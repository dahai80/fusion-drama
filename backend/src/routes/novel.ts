/**
 * 整本小说导入路由 — 四步管线入口
 *   POST /novel/import   导入并切块（同步，无 LLM）
 *   POST /novel/outline  逐块大纲（后台批处理，幂等续跑）
 *   POST /novel/plan     分集规划（单次 LLM，建 episode 行）
 *   POST /novel/rewrite  全集滚动改写（后台批处理，幂等续跑）
 *   POST /novel/rewrite/:episodeId  单集改写（同步，GPU 队列内）
 *   GET  /novel/status    管线进度（块数/大纲完成数/分集数/任务状态）
 */
import { Hono } from 'hono'
import { asc, eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest } from '../utils/response.js'
import { getContentLanguage } from '../services/app-settings.js'
import {
  importNovel,
  outlineAllSegments,
  planEpisodesFromOutlines,
  rewriteEpisodeFromNovel,
  rewriteAllEpisodes,
  getNovelTask,
} from '../services/novel.js'

const app = new Hono()

// POST /novel/import {drama_id, content, replace?}
app.post('/import', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id 必填')
  if (!body.content || typeof body.content !== 'string') return badRequest(c, 'content 必填')
  if (body.content.length < 500) return badRequest(c, '小说内容过短（至少 500 字）')
  try {
    const result = await importNovel(Number(body.drama_id), body.content, body.replace !== false)
    return success(c, result)
  } catch (err) {
    return badRequest(c, (err as Error).message)
  }
})

// POST /novel/outline {drama_id}
app.post('/outline', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id 必填')
  try {
    await outlineAllSegments(Number(body.drama_id))
    return success(c, { started: true })
  } catch (err) {
    return badRequest(c, (err as Error).message)
  }
})

// POST /novel/plan {drama_id, target_minutes?}
app.post('/plan', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id 必填')
  try {
    const result = await planEpisodesFromOutlines(Number(body.drama_id), Number(body.target_minutes) || 2)
    return success(c, result)
  } catch (err) {
    return badRequest(c, (err as Error).message)
  }
})

// POST /novel/rewrite {drama_id}  全集顺序改写（后台）
app.post('/rewrite', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id 必填')
  try {
    const language = await getContentLanguage()
    await rewriteAllEpisodes(Number(body.drama_id), language)
    return success(c, { started: true })
  } catch (err) {
    return badRequest(c, (err as Error).message)
  }
})

// POST /novel/rewrite/:episodeId {drama_id}  单集改写（同步）
app.post('/rewrite/:episodeId', async (c) => {
  const episodeId = Number(c.req.param('episodeId'))
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id 必填')
  try {
    const language = await getContentLanguage()
    const result = await rewriteEpisodeFromNovel(Number(body.drama_id), episodeId, language)
    return success(c, result)
  } catch (err) {
    return badRequest(c, (err as Error).message)
  }
})

// GET /novel/status?drama_id=
app.get('/status', async (c) => {
  const dramaId = Number(c.req.query('drama_id'))
  if (!dramaId) return badRequest(c, 'drama_id 必填')
  const segments = await db.select({ seq: schema.novelSegments.seq, outline: schema.novelSegments.outline })
    .from(schema.novelSegments).where(eq(schema.novelSegments.dramaId, dramaId))
    .orderBy(asc(schema.novelSegments.seq))
  const plans = await db.select().from(schema.novelEpisodePlans)
    .where(eq(schema.novelEpisodePlans.dramaId, dramaId))
    .orderBy(asc(schema.novelEpisodePlans.episodeNumber))
  const episodeIds = plans.map(p => p.episodeId).filter(Boolean)
  const episodes = episodeIds.length
    ? await db.select({ id: schema.episodes.id, scriptContent: schema.episodes.scriptContent })
        .from(schema.episodes).where(eq(schema.episodes.dramaId, dramaId))
    : []
  const scripted = new Set(episodes.filter(e => e.scriptContent).map(e => e.id))
  return success(c, {
    segmentCount: segments.length,
    outlinedCount: segments.filter(s => s.outline).length,
    episodeCount: plans.length,
    rewrittenCount: plans.filter(p => p.episodeId && scripted.has(p.episodeId)).length,
    outlineTask: getNovelTask(dramaId, 'outline'),
    rewriteTask: getNovelTask(dramaId, 'rewrite'),
    plans: plans.map(p => ({
      episodeId: p.episodeId,
      episodeNumber: p.episodeNumber,
      hasScript: p.episodeId ? scripted.has(p.episodeId) : false,
      plan: JSON.parse(p.plan),
    })),
  })
})

export default app
