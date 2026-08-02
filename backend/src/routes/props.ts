import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest, now } from '../utils/response.js'
import { generateImage } from '../services/image-generation.js'
import { getDramaStylePrompt } from '../services/style-preset.js'
import { ensurePropFinalPrompt } from '../services/final-prompt.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()
// 道具图：白底单品静物，方形画布
const PROP_IMAGE_SIZE = '1024x1024'

// PUT /props/:id — 更新道具（物品外貌/类型/最终提示词）
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.name !== undefined) updates.name = body.name
  if (body.type !== undefined) updates.type = body.type
  if (body.description !== undefined) updates.description = body.description
  // 物品外貌变更后，旧的白底单品最终提示词失效，下次生图时由提示词 Agent 重新生成
  if (body.description !== undefined) updates.finalPrompt = null
  // 手动编辑最终提示词时以传入值为准（覆盖上面的失效置空）
  if (body.final_prompt !== undefined) updates.finalPrompt = body.final_prompt || null
  else if (body.finalPrompt !== undefined) updates.finalPrompt = body.finalPrompt || null
  await db.update(schema.props).set(updates).where(eq(schema.props.id, id))
  return success(c)
})

/** 本地兜底提示词：白底单品，不掺杂其他元素 */
function propImagePrompt(prop: typeof schema.props.$inferSelect, stylePrompt = '') {
  return [
    `single product photo of ${prop.name}`,
    prop.description || '',
    'isolated on a pure white background',
    'no other objects, no people, no scenery',
    'soft even studio lighting',
    'high detail',
    'no text, no watermark',
    stylePrompt || '',
  ].filter(Boolean).join(', ')
}

// POST /props/:id/generate-prompt — 独立生成/重新生成白底单品最终提示词（不生图）
app.post('/:id/generate-prompt', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [prop] = await db.select().from(schema.props).where(eq(schema.props.id, id))
  if (!prop) return badRequest(c, 'Prop not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  if (!ep) return badRequest(c, 'Episode not found')

  logTaskStart('FinalPrompt', 'prop-generate', { propId: id, episodeId: ep.id, force: !!body.force })
  const finalPrompt = await ensurePropFinalPrompt(prop, ep.id, !!body.force)
  if (!finalPrompt) {
    logTaskError('FinalPrompt', 'prop-generate', { propId: id, error: 'agent returned empty prompt' })
    return badRequest(c, '最终提示词生成失败，请重试')
  }
  logTaskSuccess('FinalPrompt', 'prop-generate', { propId: id })
  return success(c, { final_prompt: finalPrompt })
})

// POST /props/:id/generate-image — 生成道具白底单品图
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [prop] = await db.select().from(schema.props).where(eq(schema.props.id, id))
  if (!prop) return badRequest(c, 'Prop not found')
  if (!body.episode_id) return badRequest(c, 'episode_id is required')

  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, Number(body.episode_id)))
  if (!ep) return badRequest(c, 'Episode not found')

  const stylePrompt = await getDramaStylePrompt(prop.dramaId)
  const finalPrompt = await ensurePropFinalPrompt(prop, ep.id)
  const prompt = finalPrompt || propImagePrompt(prop, stylePrompt)
  try {
    logTaskStart('PropImage', 'generate', { propId: id, episodeId: ep.id, dramaId: prop.dramaId })
    const genId = await generateImage({ propId: id, dramaId: prop.dramaId, prompt, model: body.model, size: PROP_IMAGE_SIZE, configId: body.config_id ?? ep.imageConfigId ?? undefined })
    logTaskSuccess('PropImage', 'generate', { propId: id, generationId: genId })
    return success(c, { image_generation_id: genId })
  } catch (err: any) {
    logTaskError('PropImage', 'generate', { propId: id, error: err.message })
    return badRequest(c, err.message)
  }
})

export default app
