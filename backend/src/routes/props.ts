import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, created, badRequest, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { generateImage } from '../services/generation.js'
import { getDramaStylePrompt } from '../services/style-preset.js'
import { ensurePropFinalPrompt } from '../services/final-prompt.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()
// Prop image: white-background single-product still life, square canvas
const PROP_IMAGE_SIZE = '1024x1024'

// POST /props — manually create a prop (when episode_id is passed, bind it to that episode)
app.post('/', async (c) => {
  const body = await c.req.json()
  // i18n: user-facing
  if (!body.drama_id) return badRequest(c, 'drama_id 必填')
  // i18n: user-facing
  if (!body.name?.trim()) return badRequest(c, '名称必填')
  const ts = now()
  const res = await db.insert(schema.props).values({
    name: body.name.trim(),
    type: body.type || '',
    description: body.description || '',
    dramaId: body.drama_id,
    createdAt: ts,
    updatedAt: ts,
  })
  const propId = getInsertId(res)
  if (body.episode_id) {
    const existing = await db.select().from(schema.episodeProps)
      .where(and(eq(schema.episodeProps.episodeId, Number(body.episode_id)), eq(schema.episodeProps.propId, propId)))
    if (!existing.length) {
      await db.insert(schema.episodeProps).values({ episodeId: Number(body.episode_id), propId, createdAt: ts })
    }
  }
  const [row] = await db.select().from(schema.props).where(eq(schema.props.id, propId))
  return created(c, toSnakeCase(row))
})

// DELETE /props/:id — soft delete
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.update(schema.props).set({ deletedAt: now(), updatedAt: now() }).where(eq(schema.props.id, id))
  return success(c)
})

// PUT /props/:id — update a prop (appearance/type/final prompt)
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.name !== undefined) updates.name = body.name
  if (body.type !== undefined) updates.type = body.type
  if (body.description !== undefined) updates.description = body.description
  // User-uploaded prop image: write the image URL and local path directly
  if (body.image_url !== undefined) updates.imageUrl = body.image_url
  else if (body.imageUrl !== undefined) updates.imageUrl = body.imageUrl
  if (body.local_path !== undefined) updates.localPath = body.local_path
  else if (body.localPath !== undefined) updates.localPath = body.localPath
  // When the final prompt is edited manually the passed value wins; when absent keep the original (editing info no longer auto-clears it)
  if (body.final_prompt !== undefined) updates.finalPrompt = body.final_prompt || null
  else if (body.finalPrompt !== undefined) updates.finalPrompt = body.finalPrompt || null
  // E7: definition-field changes invalidate the finalPrompt cache — without an invalidation trigger,
  // users who change a prop's definition would still generate the old image;
  // an explicit final_prompt still takes precedence
  const definesChanged = ['name', 'type', 'description'].some((k) => updates[k] !== undefined)
  if (definesChanged && body.final_prompt === undefined && body.finalPrompt === undefined) updates.finalPrompt = null
  await db.update(schema.props).set(updates).where(eq(schema.props.id, id))
  return success(c)
})

/** Local fallback prompt: white-background single product, no other elements */
function propImagePrompt(prop: typeof schema.props.$inferSelect, stylePrompt = '') {
  return [
    stylePrompt || '',
    `single product photo of ${prop.name}`,
    prop.description || '',
    'isolated on a pure white background',
    'no other objects, no people, no scenery',
    'soft even studio lighting',
    'high detail',
    'no text, no watermark',
  ].filter(Boolean).join(', ')
}

// POST /props/:id/generate-prompt — generate/regenerate the white-background final prompt standalone (no image generation)
app.post('/:id/generate-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [prop] = await db.select().from(schema.props).where(eq(schema.props.id, id))
  // i18n: user-facing
  if (!prop) return badRequest(c, '道具不存在')
  // i18n: user-facing
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  // i18n: user-facing
  if (!ep) return badRequest(c, '剧集不存在')

  logTaskStart('FinalPrompt', 'prop-generate', { propId: id, episodeId: ep.id, force: !!body.force })
  const finalPrompt = await ensurePropFinalPrompt(prop, ep.id, !!body.force, { model: body.text_model, configId: body.text_config_id ?? undefined })
  if (!finalPrompt) {
    logTaskError('FinalPrompt', 'prop-generate', { propId: id, error: 'agent returned empty prompt' })
    // i18n: user-facing
    return badRequest(c, '最终提示词生成失败，请重试')
  }
  logTaskSuccess('FinalPrompt', 'prop-generate', { propId: id })
  return success(c, { final_prompt: finalPrompt })
})

// POST /props/:id/generate-image — generate the prop's white-background product image
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [prop] = await db.select().from(schema.props).where(eq(schema.props.id, id))
  // i18n: user-facing
  if (!prop) return badRequest(c, '道具不存在')
  // i18n: user-facing
  if (!body.episode_id) return badRequest(c, 'episode_id 必填')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  // i18n: user-facing
  if (!ep) return badRequest(c, '剧集不存在')

  // Dedup: skip when the prop already has an in-flight image task — batch clicks fire per-prop concurrent requests, and rapid clicking would create duplicate tasks
  const [dup] = await db.select({ id: schema.sysTask.id }).from(schema.sysTask)
    .where(and(eq(schema.sysTask.propId, id), eq(schema.sysTask.status, 'processing')))
    .limit(1)
  if (dup) return success(c, { image_generation_id: dup.id, skipped: true })

  // Row-first: the cached finalPrompt or template-composed prompt enqueues immediately (visible in the task panel at once);
  // without a cache, the background enrichment below fills it in, updating the task prompt before the serial queue executes.
  const stylePrompt = await getDramaStylePrompt(prop.dramaId)
  const prompt = prop.finalPrompt || propImagePrompt(prop, stylePrompt)
  try {
    logTaskStart('PropImage', 'generate', { propId: id, episodeId: ep.id, dramaId: prop.dramaId })
    const genId = await generateImage({
      propId: id, dramaId: prop.dramaId, prompt, model: body.model, size: PROP_IMAGE_SIZE,
      configId: body.config_id ?? ep.imageConfigId ?? undefined,
      // Without a cached prompt, enrichImagePromptIfNeeded fills it in inside the queue before generation (strictly serial with generation)
      enrichEpisodeId: prop.finalPrompt ? undefined : ep.id,
      textModel: body.text_model, textConfigId: body.text_config_id ?? undefined,
    })
    logTaskSuccess('PropImage', 'generate', { propId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('PropImage', 'generate', { propId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

export default app
