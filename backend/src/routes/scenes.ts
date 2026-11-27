import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, created, badRequest, now } from '../utils/response.js'
import { generateImage } from '../services/generation.js'
import { getDramaStylePrompt } from '../services/style-preset.js'
import { ensureSceneFinalPrompt } from '../services/final-prompt.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

// POST /scenes — manually add a scene (linked to the episode when episode_id is passed)
app.post('/', async (c) => {
  const body = await c.req.json()
  // i18n: user-facing
  if (!body.drama_id) return badRequest(c, 'drama_id 必填')
  // i18n: user-facing
  if (!body.location?.trim()) return badRequest(c, '地点必填')
  const ts = now()
  const res = await db.insert(schema.scenes).values({
    dramaId: body.drama_id,
    episodeId: body.episode_id,
    location: body.location.trim(),
    time: body.time || '',
    prompt: body.prompt || body.description || body.location,
    lighting: body.lighting || '',
    createdAt: ts,
    updatedAt: ts,
  })
  const sceneId = getInsertId(res)
  if (body.episode_id) {
    const existing = await db.select().from(schema.episodeScenes)
      .where(and(eq(schema.episodeScenes.episodeId, Number(body.episode_id)), eq(schema.episodeScenes.sceneId, sceneId)))
    if (!existing.length) {
      await db.insert(schema.episodeScenes).values({ episodeId: Number(body.episode_id), sceneId, createdAt: ts })
    }
  }
  const [result] = await db.select().from(schema.scenes)
    .where(eq(schema.scenes.id, sceneId))
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
  // User-uploaded scene image: write the image URL and local path directly
  const uploadedImage = body.image_url ?? body.imageUrl
  if (uploadedImage !== undefined) {
    updates.imageUrl = uploadedImage
    if (uploadedImage) updates.status = 'completed'
  }
  if (body.local_path !== undefined) updates.localPath = body.local_path
  else if (body.localPath !== undefined) updates.localPath = body.localPath
  // When the final prompt is manually edited, the passed value wins; when absent keep the
  // original (editing info no longer auto-clears it)
  if (body.final_prompt !== undefined) updates.finalPrompt = body.final_prompt || null
  else if (body.finalPrompt !== undefined) updates.finalPrompt = body.finalPrompt || null
  // E7: changes to definition fields invalidate the finalPrompt cache — without an invalidation
  // trigger the user would change the setting yet still generate the old character art;
  // an explicitly passed final_prompt still wins
  const definesChanged = ['location', 'time', 'prompt', 'lighting'].some((k) => updates[k] !== undefined)
  if (definesChanged && body.final_prompt === undefined && body.finalPrompt === undefined) updates.finalPrompt = null
  await db.update(schema.scenes).set(updates).where(eq(schema.scenes.id, id))
  return success(c)
})

// POST /scenes/:id/generate-image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id))
  // i18n: user-facing
  if (!scene) return badRequest(c, '场景不存在')
  // i18n: user-facing
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  // i18n: user-facing
  if (!ep) return badRequest(c, '剧集不存在')

  // Dedup: skip when the scene already has a running image task — batch clicks fire per-scene
  // concurrent requests and double clicks would create duplicate tasks
  const [dup] = await db.select({ id: schema.sysTask.id }).from(schema.sysTask)
    .where(and(eq(schema.sysTask.sceneId, id), eq(schema.sysTask.status, 'processing')))
    .limit(1)
  if (dup) return success(c, { image_generation_id: dup.id, skipped: true })

  // Pre-enqueue: a cached finalPrompt or the template fallback joins the queue immediately
  // (visible in the task panel right away); without a cache the background enrichment below
  // backfills in time, updating the task prompt before the serial queue executes it.
  const stylePrompt = await getDramaStylePrompt(scene.dramaId)
  // The fallback concat must also preserve the no-people constraint: the scene description
  // (prompt) may contain character activity, and concatenating it directly would let people
  // sneak into the image
  // i18n: user-facing
  const prompt = scene.finalPrompt || [
    stylePrompt || '',
    scene.location,
    scene.time || '',
    // i18n: user-facing
    scene.prompt || '高质量场景',
    // i18n: user-facing
    scene.lighting || '电影感光影',
    // i18n: user-facing
    '画面中没有任何人物，空场景，只有场景本身',
  ].filter(Boolean).join(', ')
  try {
    logTaskStart('SceneImage', 'generate', { sceneId: id, episodeId: ep.id, dramaId: scene.dramaId, location: scene.location })
    await db.update(schema.scenes).set({ status: 'processing', updatedAt: now() }).where(eq(schema.scenes.id, id))
    const genId = await generateImage({
      sceneId: id, dramaId: scene.dramaId, prompt, model: body.model,
      configId: body.config_id ?? ep.imageConfigId ?? undefined,
      // Without a cached prompt, enrichImagePromptIfNeeded backfills inside the queue before
      // image generation (strictly serialized with generation)
      enrichEpisodeId: scene.finalPrompt ? undefined : ep.id,
      textModel: body.text_model, textConfigId: body.text_config_id ?? undefined,
    })
    logTaskSuccess('SceneImage', 'generate', { sceneId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('SceneImage', 'generate', { sceneId: id, error: err.message })
    await db.update(schema.scenes).set({ status: 'failed', updatedAt: now() }).where(eq(schema.scenes.id, id))
    return badRequest(c, err.message)
  }
})

// POST /scenes/:id/generate-prompt — standalone generate/regenerate of the fixed-view final prompt (no image)
app.post('/:id/generate-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, id))
  // i18n: user-facing
  if (!scene) return badRequest(c, '场景不存在')
  // i18n: user-facing
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  // i18n: user-facing
  if (!ep) return badRequest(c, '剧集不存在')

  logTaskStart('FinalPrompt', 'scene-generate', { sceneId: id, episodeId: ep.id, force: !!body.force })
  const finalPrompt = await ensureSceneFinalPrompt(scene, ep.id, !!body.force, { model: body.text_model, configId: body.text_config_id ?? undefined })
  if (!finalPrompt) {
    logTaskError('FinalPrompt', 'scene-generate', { sceneId: id, error: 'agent returned empty prompt' })
    // i18n: user-facing
    return badRequest(c, '最终提示词生成失败，请重试')
  }
  logTaskSuccess('FinalPrompt', 'scene-generate', { sceneId: id })
  return success(c, { final_prompt: finalPrompt })
})

// DELETE /scenes/:id — soft delete (historical generation records preserved)
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.update(schema.scenes).set({ deletedAt: now(), updatedAt: now() }).where(eq(schema.scenes.id, id))
  return success(c)
})

export default app
