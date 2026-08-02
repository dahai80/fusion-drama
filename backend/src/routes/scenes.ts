import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, created, badRequest, now } from '../utils/response.js'
import { generateImage } from '../services/image-generation.js'
import { getDramaStylePrompt } from '../services/style-preset.js'
import { ensureSceneFinalPrompt } from '../services/final-prompt.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

// POST /scenes
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()
  const res = await db.insert(schema.scenes).values({
    dramaId: body.drama_id,
    episodeId: body.episode_id,
    location: body.location,
    time: body.time || '',
    prompt: body.prompt || body.description || body.location,
    lighting: body.lighting || '',
    createdAt: ts,
    updatedAt: ts,
  })
  const [result] = await db.select().from(schema.scenes)
    .where(eq(schema.scenes.id, getInsertId(res)))
  return created(c, result)
})

// PUT /scenes/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.location !== undefined) updates.location = body.location
  if (body.time !== undefined) updates.time = body.time
  if (body.prompt !== undefined) updates.prompt = body.prompt
  if (body.description !== undefined) updates.prompt = body.description
  if (body.lighting !== undefined) updates.lighting = body.lighting
  // 描述/光影变更后，旧的固定视角最终提示词失效，下次生图时由提示词 Agent 重新生成
  if (body.prompt !== undefined || body.description !== undefined || body.lighting !== undefined) updates.finalPrompt = null
  // 手动编辑最终提示词时以传入值为准（覆盖上面的失效置空）
  if (body.final_prompt !== undefined) updates.finalPrompt = body.final_prompt || null
  else if (body.finalPrompt !== undefined) updates.finalPrompt = body.finalPrompt || null
  await db.update(schema.scenes).set(updates).where(eq(schema.scenes.id, id))
  return success(c)
})

// POST /scenes/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id))
  if (!scene) return badRequest(c, 'Scene not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  if (!ep) return badRequest(c, 'Episode not found')

  const stylePrompt = await getDramaStylePrompt(scene.dramaId)
  const finalPrompt = await ensureSceneFinalPrompt(scene, ep.id)
  const prompt = finalPrompt || [
    scene.location,
    scene.time || '',
    scene.prompt || '高质量场景',
    scene.lighting || '电影感光影',
    stylePrompt || '',
  ].filter(Boolean).join(', ')
  try {
    logTaskStart('SceneImage', 'generate', { sceneId: id, episodeId: ep.id, dramaId: scene.dramaId, location: scene.location })
    await db.update(schema.scenes).set({ status: 'processing', updatedAt: now() }).where(eq(schema.scenes.id, id))
    const genId = await generateImage({ sceneId: id, dramaId: scene.dramaId, prompt, model: body.model, configId: body.config_id ?? ep.imageConfigId ?? undefined })
    logTaskSuccess('SceneImage', 'generate', { sceneId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('SceneImage', 'generate', { sceneId: id, error: err.message })
    await db.update(schema.scenes).set({ status: 'failed', updatedAt: now() }).where(eq(schema.scenes.id, id))
    return badRequest(c, err.message)
  }
})

// POST /scenes/:id/generate-prompt — 独立生成/重新生成固定视角最终提示词（不生图）
app.post('/:id/generate-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id))
  if (!scene) return badRequest(c, 'Scene not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  if (!ep) return badRequest(c, 'Episode not found')

  logTaskStart('FinalPrompt', 'scene-generate', { sceneId: id, episodeId: ep.id, force: !!body.force })
  const finalPrompt = await ensureSceneFinalPrompt(scene, ep.id, !!body.force)
  if (!finalPrompt) {
    logTaskError('FinalPrompt', 'scene-generate', { sceneId: id, error: 'agent returned empty prompt' })
    return badRequest(c, '最终提示词生成失败，请重试')
  }
  logTaskSuccess('FinalPrompt', 'scene-generate', { sceneId: id })
  return success(c, { final_prompt: finalPrompt })
})

// DELETE /scenes/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.delete(schema.scenes).where(eq(schema.scenes.id, id))
  return success(c)
})

export default app
