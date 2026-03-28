import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest } from '../utils/response.js'
import { composeStoryboard } from '../services/ffmpeg-compose.js'

const app = new Hono()

// POST /storyboards/:id/compose — 合成单个镜头
app.post('/storyboards/:id/compose', async (c) => {
  const id = Number(c.req.param('id'))
  try {
    const composedUrl = await composeStoryboard(id)
    return success(c, { id, composed_video_url: composedUrl })
  } catch (err: any) {
    return badRequest(c, err.message)
  }
})

// POST /episodes/:id/compose-all — 批量合成全部镜头
app.post('/episodes/:id/compose-all', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const storyboards = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)
    .all()

  if (storyboards.length === 0) return badRequest(c, 'No storyboards found')

  const withVideo = storyboards.filter(sb => sb.videoUrl)
  if (withVideo.length === 0) return badRequest(c, 'No storyboards have video yet')

  // 异步处理
  const results: { id: number; status: string; url?: string; error?: string }[] = []

  // 立即返回，后台处理
  ;(async () => {
    for (const sb of withVideo) {
      try {
        await composeStoryboard(sb.id)
      } catch (err: any) {
        console.error(`[Compose] Failed storyboard ${sb.id}:`, err.message)
      }
    }
    console.log(`[Compose] All ${withVideo.length} storyboards composed for episode ${episodeId}`)
  })()

  return success(c, {
    message: `Started composing ${withVideo.length} storyboards`,
    total: withVideo.length,
  })
})

export default app
