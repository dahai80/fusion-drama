import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, created, badRequest, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { generateImage } from '../services/generation.js'
import { getDramaStylePrompt } from '../services/style-preset.js'
import { ensureCharacterFinalPrompt } from '../services/final-prompt.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()
const CHARACTER_IMAGE_SIZE = '1920x1080'

// POST /characters — 手动新增角色（传入 episode_id 时关联到该集）
app.post('/', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id 必填')
  if (!body.name?.trim()) return badRequest(c, '名称必填')
  const ts = now()
  const res = await db.insert(schema.characters).values({
    name: body.name.trim(),
    role: body.role || '',
    description: body.description || '',
    appearance: body.appearance || '',
    styling: body.styling || '',
    dramaId: body.drama_id,
    createdAt: ts,
    updatedAt: ts,
  })
  const charId = getInsertId(res)
  if (body.episode_id) {
    const existing = await db.select().from(schema.episodeCharacters)
      .where(and(eq(schema.episodeCharacters.episodeId, Number(body.episode_id)), eq(schema.episodeCharacters.characterId, charId)))
    if (!existing.length) {
      await db.insert(schema.episodeCharacters).values({ episodeId: Number(body.episode_id), characterId: charId, createdAt: ts })
    }
  }
  const [row] = await db.select().from(schema.characters).where(eq(schema.characters.id, charId))
  return created(c, toSnakeCase(row))
})

function characterImagePrompt(char: typeof schema.characters.$inferSelect, stylePrompt = '') {
  // 无缓存 finalPrompt 时的兜底模板：与 SKILL 四视图设定图口径一致（Agent 富化后会覆盖）
  return [
    stylePrompt || '',
    char.name,
    char.appearance || char.description || '人物立绘',
    char.styling || '',
    '角色设定参考图',
    '左侧正脸特写',
    '右侧正面、45 度侧面、90 度侧面、背面四张等高全身视图',
    '所有视图同一角色、脸发型服装完全一致',
    '中性 A 字站姿',
    '高质量',
    '白色背景',
  ].filter(Boolean).join(', ')
}

// PUT /characters/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  for (const key of ['name', 'role', 'description', 'appearance', 'styling', 'imageUrl', 'localPath', 'voice']) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    if (snakeKey in body) updates[key] = body[snakeKey]
    else if (key in body) updates[key] = body[key]
  }
  // 手动编辑最终提示词时以传入值为准；未传入则保留原值（修改信息时不再自动置空）
  if (body.final_prompt !== undefined) updates.finalPrompt = body.final_prompt || null
  else if (body.finalPrompt !== undefined) updates.finalPrompt = body.finalPrompt || null

  // E7: 定义字段变更使 finalPrompt 缓存失效——缓存无失效触发会导致
  // 用户改了设定仍生成旧人设图；显式传 final_prompt 仍以传入值为准
  const definesChanged = ['name', 'role', 'description', 'appearance', 'styling'].some((k) => updates[k] !== undefined)
  if (definesChanged && body.final_prompt === undefined && body.finalPrompt === undefined) updates.finalPrompt = null
  await db.update(schema.characters).set(updates).where(eq(schema.characters.id, id))
  return success(c)
})

// DELETE /characters/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.update(schema.characters).set({ deletedAt: now() }).where(eq(schema.characters.id, id))
  return success(c)
})

// POST /characters/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [char] = await db.select().from(schema.characters).where(eq(schema.characters.id, id))
  if (!char) return badRequest(c, '角色不存在')
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  if (!ep) return badRequest(c, '剧集不存在')

  const stylePrompt = await getDramaStylePrompt(char.dramaId)
  const prompt = char.finalPrompt || characterImagePrompt(char, stylePrompt)
  try {
    logTaskStart('CharacterImage', 'generate', { characterId: id, episodeId: ep.id, dramaId: char.dramaId })
    const genId = await generateImage({
      characterId: id, dramaId: char.dramaId, prompt, model: body.model, size: CHARACTER_IMAGE_SIZE,
      configId: body.config_id ?? ep.imageConfigId ?? undefined,
      enrichEpisodeId: char.finalPrompt ? undefined : ep.id,
      textModel: body.text_model, textConfigId: body.text_config_id ?? undefined,
    })
    logTaskSuccess('CharacterImage', 'generate', { characterId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('CharacterImage', 'generate', { characterId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

// POST /characters/:id/generate-prompt — 独立生成/重新生成四视图最终提示词（不生图）
app.post('/:id/generate-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [char] = await db.select().from(schema.characters).where(eq(schema.characters.id, id))
  if (!char) return badRequest(c, '角色不存在')
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  if (!ep) return badRequest(c, '剧集不存在')

  logTaskStart('FinalPrompt', 'character-generate', { characterId: id, episodeId: ep.id, force: !!body.force })
  const finalPrompt = await ensureCharacterFinalPrompt(char, ep.id, !!body.force, { model: body.text_model, configId: body.text_config_id ?? undefined })
  if (!finalPrompt) {
    logTaskError('FinalPrompt', 'character-generate', { characterId: id, error: 'agent returned empty prompt' })
    return badRequest(c, '最终提示词生成失败，请重试')
  }
  logTaskSuccess('FinalPrompt', 'character-generate', { characterId: id })
  return success(c, { final_prompt: finalPrompt })
})

// POST /characters/batch-generate-images
app.post('/batch-generate-images', async (c) => {
  const body = await c.req.json()
  const ids: number[] = body.character_ids || []
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  if (!ep) return badRequest(c, '剧集不存在')
  const results: number[] = []
  const skipped: number[] = []
  const stylePrompt = await getDramaStylePrompt(ep.dramaId)

  // 第一遍（毫秒级）：立即为每个角色建任务并入队——面板即刻全部可见，POST 不悬挂。
  // 有缓存 finalPrompt 的直接用；没有的先用模板提示词，由下方后台富化补齐。
  const needEnrich: { taskId: number; charId: number }[] = []
  for (const cid of ids) {
    const [char] = await db.select().from(schema.characters).where(eq(schema.characters.id, cid))
    if (!char) continue
    // 去重：该角色已有进行中的图片任务则跳过——多次点击/客户端断开后服务端循环
    // 继续推进/多个循环并发时，会为同一角色重复建任务（同一秒 4 条仙童的实证）
    const [dup] = await db.select({ id: schema.sysTask.id }).from(schema.sysTask)
      .where(and(eq(schema.sysTask.characterId, cid), eq(schema.sysTask.status, 'processing')))
      .limit(1)
    if (dup) { skipped.push(cid); continue }
    try {
      const prompt = char.finalPrompt || characterImagePrompt(char, stylePrompt)
      const genId = await generateImage({
        characterId: cid, dramaId: char.dramaId, prompt, model: body.model, size: CHARACTER_IMAGE_SIZE,
        configId: body.config_id ?? ep.imageConfigId ?? undefined,
        // 无缓存提示词时由队列内 enrichImagePromptIfNeeded 在生图前补齐（与生图严格串行）
        enrichEpisodeId: char.finalPrompt ? undefined : ep.id,
        textModel: body.text_model, textConfigId: body.text_config_id ?? undefined,
      })
      results.push(genId)
      if (!char.finalPrompt) needEnrich.push({ taskId: genId, charId: cid })
    } catch (e: any) {
      logTaskError('CharacterImage', String(cid), { episodeId: ep.id, error: e?.message || '生成失败' })
    }
  }

  // 富化不再后台并发：无缓存提示词的任务由队列内 enrichImagePromptIfNeeded 在生图前补齐
  // （后台富化与 FLUX 生图并发曾致 G2 毒死 + fusion-mlx 服务冻结，2026-10-13 实证）
  logTaskSuccess('CharacterImage', 'batch-generate', { episodeId: ep.id, requested: ids.length, started: results.length, skipped: skipped.length, enriching: needEnrich.length })
  return success(c, { count: results.length, ids: results, skipped, enriching: needEnrich.length })
})

export default app
