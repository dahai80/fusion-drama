import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, badRequest } from '../utils/response.js'
import { generateVideo } from '../services/video-generation.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

// POST /videos — Generate video
app.post('/', async (c) => {
  const body = await c.req.json()

  // 生成模式只保留多模态参考：校验素材上限与必填项
  const imgs = body.reference_image_urls?.length || 0
  const vids = body.reference_video_urls?.length || 0
  const auds = body.reference_audio_urls?.length || 0
  if (imgs > 9 || vids > 3 || auds > 3) {
    return badRequest(c, '参考素材超限：图片≤9、视频≤3、音频≤3')
  }
  if (auds > 0 && imgs + vids === 0) {
    return badRequest(c, '参考音频需要至少 1 个参考图片或视频')
  }
  if (imgs + vids + auds === 0 && !body.prompt) {
    return badRequest(c, '多模态参考模式需要至少一个参考素材或 prompt')
  }

  try {
    let configId: number | undefined = body.config_id
    if (body.storyboard_id) {
      const [sb] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id)))
      if (sb) {
        const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId))
        if (ep?.videoConfigId != null) configId = ep.videoConfigId
      }
    }

    logTaskStart('VideoAPI', 'generate', {
      storyboardId: body.storyboard_id,
      dramaId: body.drama_id,
      referenceMode: 'reference',
      duration: body.duration,
    })
    logTaskPayload('VideoAPI', 'request body', body)
    const id = await generateVideo({
      storyboardId: body.storyboard_id,
      dramaId: body.drama_id,
      prompt: body.prompt,
      model: body.model,
      referenceMode: 'reference',
      referenceImageUrls: body.reference_image_urls,
      referenceVideoUrls: body.reference_video_urls,
      referenceAudioUrls: body.reference_audio_urls,
      generateAudio: body.generate_audio,
      duration: body.duration,
      aspectRatio: body.aspect_ratio,
      configId,
    })

    const [record] = await db.select().from(schema.videoGenerations)
      .where(eq(schema.videoGenerations.id, id))
    logTaskSuccess('VideoAPI', 'generate', { generationId: id, provider: record?.provider })
    return created(c, record)
  } catch (err: any) {
    logTaskError('VideoAPI', 'generate', { error: err.message })
    return badRequest(c, err.message)
  }
})

// GET /videos/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.id, id))
  return success(c, row || null)
})

// GET /videos — List by storyboard_id or drama_id
app.get('/', async (c) => {
  const storyboardId = c.req.query('storyboard_id')
  const dramaId = c.req.query('drama_id')

  let rows = await db.select().from(schema.videoGenerations)

  if (storyboardId) rows = rows.filter(r => r.storyboardId === Number(storyboardId))
  if (dramaId) rows = rows.filter(r => r.dramaId === Number(dramaId))

  return success(c, rows)
})

// DELETE /videos/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.delete(schema.videoGenerations).where(eq(schema.videoGenerations.id, id))
  return success(c)
})

export default app
