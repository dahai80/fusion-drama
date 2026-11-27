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

// POST /characters — manually create a character (when episode_id is passed, bind it to that episode)
app.post('/', async (c) => {
  const body = await c.req.json()
  // i18n: user-facing
  if (!body.drama_id) return badRequest(c, 'drama_id 必填')
  // i18n: user-facing
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
  // Fallback template when no cached finalPrompt: aligned with the SKILL four-view reference-sheet spec (overwritten after Agent enrichment)
  // i18n: user-facing — image-generation prompt text (product behavior)
  return [
    stylePrompt || '',
    char.name,
    char.appearance || char.description || '人物立绘', // i18n: user-facing
    char.styling || '',
    '角色设定参考图', // i18n: user-facing
    '左侧正脸特写', // i18n: user-facing
    '右侧正面、45 度侧面、90 度侧面、背面四张等高全身视图', // i18n: user-facing
    '所有视图同一角色、脸发型服装完全一致', // i18n: user-facing
    '中性 A 字站姿', // i18n: user-facing
    '高质量', // i18n: user-facing
    '白色背景', // i18n: user-facing
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
  // When the final prompt is edited manually the passed value wins; when absent keep the original (editing info no longer auto-clears it)
  if (body.final_prompt !== undefined) updates.finalPrompt = body.final_prompt || null
  else if (body.finalPrompt !== undefined) updates.finalPrompt = body.finalPrompt || null

  // E7: definition-field changes invalidate the finalPrompt cache — without an invalidation trigger,
  // users who change a character's definition would still generate the old reference sheet;
  // an explicit final_prompt still takes precedence
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
  // i18n: user-facing
  if (!char) return badRequest(c, '角色不存在')
  // i18n: user-facing
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  // i18n: user-facing
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

// POST /characters/:id/generate-prompt — generate/regenerate the four-view final prompt standalone (no image generation)
app.post('/:id/generate-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [char] = await db.select().from(schema.characters).where(eq(schema.characters.id, id))
  // i18n: user-facing
  if (!char) return badRequest(c, '角色不存在')
  // i18n: user-facing
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  // i18n: user-facing
  if (!ep) return badRequest(c, '剧集不存在')

  logTaskStart('FinalPrompt', 'character-generate', { characterId: id, episodeId: ep.id, force: !!body.force })
  const finalPrompt = await ensureCharacterFinalPrompt(char, ep.id, !!body.force, { model: body.text_model, configId: body.text_config_id ?? undefined })
  if (!finalPrompt) {
    logTaskError('FinalPrompt', 'character-generate', { characterId: id, error: 'agent returned empty prompt' })
    // i18n: user-facing
    return badRequest(c, '最终提示词生成失败，请重试')
  }
  logTaskSuccess('FinalPrompt', 'character-generate', { characterId: id })
  return success(c, { final_prompt: finalPrompt })
})

// POST /characters/batch-generate-images
app.post('/batch-generate-images', async (c) => {
  const body = await c.req.json()
  const ids: number[] = body.character_ids || []
  // i18n: user-facing
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  // i18n: user-facing
  if (!ep) return badRequest(c, '剧集不存在')
  const results: number[] = []
  const skipped: number[] = []
  const stylePrompt = await getDramaStylePrompt(ep.dramaId)

  // First pass (millisecond-scale): immediately create and enqueue a task per character — the panel shows them all at once, the POST does not hang.
  // Cached finalPrompt is used directly; without one, start from the template prompt and let the enrichment below fill it in.
  const needEnrich: { taskId: number; charId: number }[] = []
  for (const cid of ids) {
    const [char] = await db.select().from(schema.characters).where(eq(schema.characters.id, cid))
    if (!char) continue
    // Dedup: skip when the character already has an in-flight image task — repeated clicks / server-side loops continuing
    // after client disconnect / multiple concurrent loops would create duplicate tasks for the same character
    // (observed: 4 Xiantong tasks within the same second)
    const [dup] = await db.select({ id: schema.sysTask.id }).from(schema.sysTask)
      .where(and(eq(schema.sysTask.characterId, cid), eq(schema.sysTask.status, 'processing')))
      .limit(1)
    if (dup) { skipped.push(cid); continue }
    try {
      const prompt = char.finalPrompt || characterImagePrompt(char, stylePrompt)
      const genId = await generateImage({
        characterId: cid, dramaId: char.dramaId, prompt, model: body.model, size: CHARACTER_IMAGE_SIZE,
        configId: body.config_id ?? ep.imageConfigId ?? undefined,
        // Without a cached prompt, enrichImagePromptIfNeeded fills it in inside the queue before generation (strictly serial with generation)
        enrichEpisodeId: char.finalPrompt ? undefined : ep.id,
        textModel: body.text_model, textConfigId: body.text_config_id ?? undefined,
      })
      results.push(genId)
      if (!char.finalPrompt) needEnrich.push({ taskId: genId, charId: cid })
    } catch (e: any) {
      logTaskError('CharacterImage', String(cid), { episodeId: ep.id, error: e?.message || 'generation failed' })
    }
  }

  // Enrichment no longer runs concurrently in the background: tasks without a cached prompt are filled in by
  // enrichImagePromptIfNeeded inside the queue before generation
  // (background enrichment concurrent with FLUX generation previously poisoned G2 and froze the fusion-mlx service, observed 2026-10-13)
  logTaskSuccess('CharacterImage', 'batch-generate', { episodeId: ep.id, requested: ids.length, started: results.length, skipped: skipped.length, enriching: needEnrich.length })
  return success(c, { count: results.length, ids: results, skipped, enriching: needEnrich.length })
})

export default app
