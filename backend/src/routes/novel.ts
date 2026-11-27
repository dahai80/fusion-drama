/**
 * Full-novel import routes — entry points of the four-step pipeline
 *   POST /novel/import   Import and chunk (sync, no LLM)
 *   POST /novel/outline  Per-chunk outlines (background batch, idempotent resume)
 *   POST /novel/plan     Episode planning (single LLM call, creates episode rows)
 *   POST /novel/rewrite  Rolling rewrite of all episodes (background batch, idempotent resume)
 *   POST /novel/rewrite/:episodeId  Single-episode rewrite (sync, inside the GPU queue)
 *   GET  /novel/status    Pipeline progress (chunk count / outlines done / episode count / task status)
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

// Audit 1107 F-5: hard ceiling on import size (2M chars ≈ thousands of segments;
// anything bigger is a abuse/misuse vector — blocks CPU + DB, not a real novel)
const NOVEL_IMPORT_MAX = 2_000_000

// POST /novel/import {drama_id, content, replace?}
app.post('/import', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id is required')
  if (!body.content || typeof body.content !== 'string') return badRequest(c, 'content is required')
  if (body.content.length < 500) return badRequest(c, 'Novel content is too short (at least 500 characters)')
  if (body.content.length > NOVEL_IMPORT_MAX) return badRequest(c, `Novel content is too long (limit ${NOVEL_IMPORT_MAX} characters)`)
  // F-5: reject non-existent drama before doing any work
  const dramaId = Number(body.drama_id)
  const [drama] = await db.select({ id: schema.dramas.id }).from(schema.dramas).where(eq(schema.dramas.id, dramaId)).limit(1)
  if (!drama) return badRequest(c, `Drama not found: ${dramaId}`)
  try {
    const result = await importNovel(dramaId, body.content, body.replace !== false)
    return success(c, result)
  } catch (err) {
    return badRequest(c, (err as Error).message)
  }
})

// POST /novel/outline {drama_id}
app.post('/outline', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id is required')
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
  if (!body.drama_id) return badRequest(c, 'drama_id is required')
  try {
    const result = await planEpisodesFromOutlines(Number(body.drama_id), Number(body.target_minutes) || 2)
    return success(c, result)
  } catch (err) {
    return badRequest(c, (err as Error).message)
  }
})

// POST /novel/rewrite {drama_id}  sequential rewrite of all episodes (background)
app.post('/rewrite', async (c) => {
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id is required')
  try {
    const language = await getContentLanguage()
    await rewriteAllEpisodes(Number(body.drama_id), language)
    return success(c, { started: true })
  } catch (err) {
    return badRequest(c, (err as Error).message)
  }
})

// POST /novel/rewrite/:episodeId {drama_id}  single-episode rewrite (sync)
app.post('/rewrite/:episodeId', async (c) => {
  const episodeId = Number(c.req.param('episodeId'))
  const body = await c.req.json()
  if (!body.drama_id) return badRequest(c, 'drama_id is required')
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
  // i18n: user-facing
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
