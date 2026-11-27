import { Hono } from 'hono'
import { and, eq, isNull } from 'drizzle-orm'
import { streamSSE } from 'hono/streaming'
import { db, getInsertId, schema } from '../db/index.js'
import { success, notFound, badRequest, now } from '../utils/response.js'
import { toSnakeCaseArray, toSnakeCase } from '../utils/transform.js'
import { getActiveConfigId } from '../services/ai.js'
import { logTaskWarn } from '../utils/task-logger.js'
import { readEpisodeEvents, formatTaskEvent } from '../utils/task-events.js'
import { cascadeDeleteEpisode } from '../utils/cascade.js'
import { isRagEnabled } from '../services/app-settings.js'
import { indexDrama } from '../services/rag.js'
import { EXTRACT_TARGETS, getExtractionStatus, startExtraction, type ExtractTarget } from '../services/extraction.js'
import { startStoryboardBreakdown } from '../services/storyboard-breakdown.js'
import { getVideoPromptBatchStatus, startVideoPromptBatch } from '../services/video-prompts.js'

const app = new Hono()

// POST /episodes — Create a new episode
app.post('/', async (c) => {
  const body = await c.req.json()
  // i18n: user-facing
  if (!body.drama_id) return badRequest(c, 'drama_id 必填')

  // image/video configs: explicit values win; otherwise auto-lock onto the currently
  // enabled highest-priority official config
  const imageConfigId = body.image_config_id ?? await getActiveConfigId('image')
  const videoConfigId = body.video_config_id ?? await getActiveConfigId('video')
  // i18n: user-facing
  if (!imageConfigId) return badRequest(c, '未找到启用的图片生成配置，请先在设置中心添加')
  // i18n: user-facing
  if (!videoConfigId) return badRequest(c, '未找到启用的视频生成配置，请先在设置中心添加')
  const ts = now()

  // Get next episode number (soft-deleted episodes are ignored; after deleting a middle
  // episode a new one may reuse the max number after the freed slot)
  const existing = await db.select().from(schema.episodes)
    .where(and(eq(schema.episodes.dramaId, body.drama_id), isNull(schema.episodes.deletedAt)))
    .orderBy(schema.episodes.episodeNumber)
  const nextNum = existing.length ? Math.max(...existing.map(e => e.episodeNumber)) + 1 : 1

  // B22: unique-index backstop + conflict retry — when concurrent double-clicks on the
  // same drama both compute the same nextNum, the later one hits uq_episodes_drama_number
  // and retries with nextNum+1 instead of 500
  let res
  try {
    res = await db.insert(schema.episodes).values({
      dramaId: body.drama_id,
      episodeNumber: nextNum,
      // i18n: user-facing — default episode title shown in the product
      title: body.title || `第${nextNum}集`,
      imageConfigId,
      videoConfigId,
      // video resolution is fixed at episode creation (480p/720p/1080p), changeable later
      // via PUT; each video adapter maps it to vendor-specific tiers
      resolution: ['480p', '720p', '1080p'].includes(body.resolution) ? body.resolution : '720p',
      createdAt: ts,
      updatedAt: ts,
    })
  } catch (err: any) {
    if (!/UNIQUE constraint failed: episodes.drama_id, episodes.episode_number/.test(err?.message || '')) throw err
    logTaskWarn('Episode', 'create-conflict-retry', { dramaId: body.drama_id, nextNum })
    res = await db.insert(schema.episodes).values({
      dramaId: body.drama_id,
      episodeNumber: nextNum + 1,
      // i18n: user-facing — default episode title shown in the product
      title: body.title || `第${nextNum + 1}集`,
      imageConfigId,
      videoConfigId,
      resolution: ['480p', '720p', '1080p'].includes(body.resolution) ? body.resolution : '720p',
      createdAt: ts,
      updatedAt: ts,
    })
  }

  const [ep] = await db.select().from(schema.episodes)
    .where(eq(schema.episodes.id, getInsertId(res)))
  return success(c, {
    id: ep.id,
    episode_number: ep.episodeNumber,
    title: ep.title,
    image_config_id: ep.imageConfigId,
    video_config_id: ep.videoConfigId,
    resolution: ep.resolution,
  })
})

// PUT /episodes/:id - Update episode fields
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()

  const allowed = ['content', 'script_content', 'title', 'description', 'status', 'resolution']
  const updates: Record<string, any> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }
  // i18n: user-facing
  if (Object.keys(updates).length === 0) return badRequest(c, '没有可更新的字段')
  if ('resolution' in updates && !['480p', '720p', '1080p'].includes(updates.resolution)) {
    // i18n: user-facing
    return badRequest(c, 'resolution 只支持 480p / 720p / 1080p')
  }

  // Map snake_case to camelCase for drizzle
  const drizzleUpdates: Record<string, any> = { updatedAt: now() }
  if ('content' in updates) drizzleUpdates.content = updates.content
  if ('script_content' in updates) {
    // FR-BIZ-3: manual script overwrites also keep a history draft (same semantics as agent overwrites)
    const [cur] = await db.select({ scriptContent: schema.episodes.scriptContent }).from(schema.episodes).where(eq(schema.episodes.id, id))
    if (cur?.scriptContent?.trim() && cur.scriptContent !== updates.script_content) {
      let history: { content: string, savedAt: string }[] = []
      try { history = JSON.parse((await db.select().from(schema.episodes).where(eq(schema.episodes.id, id)))[0]?.scriptHistory || '[]') || [] } catch { history = [] }
      history.push({ content: cur.scriptContent, savedAt: now() })
      while (history.length > 5) history.shift()
      drizzleUpdates.scriptHistory = JSON.stringify(history)
    }
    drizzleUpdates.scriptContent = updates.script_content
  }
  if ('title' in updates) drizzleUpdates.title = updates.title
  if ('description' in updates) drizzleUpdates.description = updates.description
  if ('status' in updates) drizzleUpdates.status = updates.status
  if ('resolution' in updates) drizzleUpdates.resolution = updates.resolution

  await db.update(schema.episodes).set(drizzleUpdates).where(eq(schema.episodes.id, id))

  // ONNX RAG: rebuild the drama's vector index asynchronously after script content changes
  // (failure does not block the save; CPU embedding takes seconds)
  if (('script_content' in updates || 'content' in updates) && isRagEnabled()) {
    const [ep] = await db.select({ dramaId: schema.episodes.dramaId }).from(schema.episodes).where(eq(schema.episodes.id, id))
    if (ep?.dramaId) {
      void indexDrama(ep.dramaId).catch(err => {
        console.error(`[RAG] reindex after script save failed (drama ${ep.dramaId}):`, err.message)
      })
    }
  }
  return success(c)
})

// DELETE /episodes/:id - hard delete (unrecoverable)
// FR-P0-1/FR-BIZ-1: deletion requires explicit double confirmation; cascades cleanup of the
// episode's storyboards/tasks/merge records (DB rows + storage files); drama-level assets
// (characters/scenes/props) are drama-owned and untouched.
// In-flight generation tasks are deleted along with it (tasks die with their artifacts, no
// orphan processing rows)
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, id))
  // i18n: user-facing
  if (!ep || ep.deletedAt) return notFound(c, '剧集不存在')
  const bodyConfirm = await c.req.json().then((b: any) => b?.confirm === true).catch(() => false)
  if (c.req.query('confirm') !== 'true' && !bodyConfirm) {
    // i18n: user-facing
    return badRequest(c, '删除剧集需要二次确认：请携带 confirm=true（query 或 body）重试。此操作不可恢复，将级联删除该集分镜与生成产物')
  }
  const result = await cascadeDeleteEpisode(id)
  return success(c, { cascaded: result.rows, files: result.files })
})

// POST /episodes/:id/rollback-script — roll back to the previous script version (FR-BIZ-3)
app.post('/:id/rollback-script', async (c) => {
  const id = Number(c.req.param('id'))
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, id))
  // i18n: user-facing
  if (!ep) return notFound(c, '剧集不存在')
  let history: { content: string, savedAt: string }[] = []
  try { history = JSON.parse(ep.scriptHistory || '[]') || [] } catch { history = [] }
  const last = history[history.length - 1]
  // i18n: user-facing
  if (!last) return badRequest(c, '没有可回退的历史版本')
  history.pop()
  await db.update(schema.episodes)
    .set({ scriptContent: last.content, scriptHistory: history.length ? JSON.stringify(history) : null, updatedAt: now() })
    .where(eq(schema.episodes.id, id))
  console.log(`[episodes] episode ${id} script rolled back to ${last.savedAt}`)
  return success(c, { savedAt: last.savedAt })
})

// GET /episodes/:id/characters — characters linked to this episode
app.get('/:id/characters', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const links = await db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId))
  const charIds = links.map(l => l.characterId)
  if (!charIds.length) return success(c, [])
  const allChars = await db.select().from(schema.characters)
  const result = allChars.filter(ch => charIds.includes(ch.id) && !ch.deletedAt)
  return success(c, toSnakeCaseArray(result))
})

// GET /episodes/:id/scenes — scenes linked to this episode
app.get('/:id/scenes', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const links = await db.select().from(schema.episodeScenes)
    .where(eq(schema.episodeScenes.episodeId, episodeId))
  const sceneIds = links.map(l => l.sceneId)
  if (!sceneIds.length) return success(c, [])
  const allScenes = await db.select().from(schema.scenes)
  const result = allScenes.filter(sc => sceneIds.includes(sc.id) && !sc.deletedAt)
  return success(c, toSnakeCaseArray(result))
})

// GET /episodes/:id/props — props linked to this episode
app.get('/:id/props', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const links = await db.select().from(schema.episodeProps)
    .where(eq(schema.episodeProps.episodeId, episodeId))
  const propIds = links.map(l => l.propId)
  if (!propIds.length) return success(c, [])
  const allProps = await db.select().from(schema.props)
  const result = allProps.filter(p => propIds.includes(p.id) && !p.deletedAt)
  return success(c, toSnakeCaseArray(result))
})

// POST /episodes/:id/extract — async asset extraction (target: characters | scenes | props);
// returns immediately, frontend polls for status
app.post('/:id/extract', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const target = body.target as ExtractTarget
  // i18n: user-facing
  if (!EXTRACT_TARGETS.includes(target)) return badRequest(c, 'target 必须是 characters / scenes / props')
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, id))
  // i18n: user-facing
  if (!ep) return notFound(c, '剧集不存在')
  const started = await startExtraction(ep.id, ep.dramaId, target, { model: body.model || undefined, configId: body.config_id ?? undefined })
  return success(c, { target, status: 'running', already_running: !started })
})

// GET /episodes/:id/extract-status — query the status of the three asset-extraction task kinds
app.get('/:id/extract-status', async (c) => {
  const id = Number(c.req.param('id'))
  return success(c, await getExtractionStatus(id))
})

// POST /episodes/:id/storyboard-breakdown — async storyboard breakdown (direct LLM call,
// bypassing the Mastra agent); returns immediately
app.post('/:id/storyboard-breakdown', async (c) => {
  const id = Number(c.req.param('id'))
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, id))
  // i18n: user-facing
  if (!ep) return notFound(c, '剧集不存在')
  await startStoryboardBreakdown(ep.id, ep.dramaId)
  return success(c, { status: 'running' })
})

// POST /episodes/:id/generate-video-prompts — async batch generation for storyboards missing
// video prompts (returns immediately, frontend polls for status)
app.post('/:id/generate-video-prompts', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => ({}))
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, id))
  // i18n: user-facing
  if (!ep) return notFound(c, '剧集不存在')
  const storyboardIds = Array.isArray(body.storyboard_ids)
    ? body.storyboard_ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
    : undefined
  const result = await startVideoPromptBatch(ep.id, ep.dramaId, { model: body.model || undefined, configId: body.config_id ?? undefined }, storyboardIds)
  if (result.total === -1) return success(c, { status: 'running', already_running: true })
  if (!result.started) return success(c, { status: 'idle', total: 0 })
  return success(c, { status: 'running', total: result.total })
})

// GET /episodes/:id/video-prompts-status — query the batch video-prompt task status
app.get('/:id/video-prompts-status', async (c) => {
  const id = Number(c.req.param('id'))
  return success(c, await getVideoPromptBatchStatus(id))
})

// GET /episodes/:episode_id/storyboards
app.get('/:episode_id/storyboards', async (c) => {
  const episodeId = Number(c.req.param('episode_id'))
  const rows = await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)

  const links = await db.select().from(schema.storyboardCharacters)
  const charIdsByStoryboard = new Map<number, number[]>()
  for (const link of links) {
    const arr = charIdsByStoryboard.get(link.storyboardId) || []
    arr.push(link.characterId)
    charIdsByStoryboard.set(link.storyboardId, arr)
  }

  const propLinks = await db.select().from(schema.storyboardProps)
  const propIdsByStoryboard = new Map<number, number[]>()
  for (const link of propLinks) {
    const arr = propIdsByStoryboard.get(link.storyboardId) || []
    arr.push(link.propId)
    propIdsByStoryboard.set(link.storyboardId, arr)
  }

  const episodeCharLinks = await db.select().from(schema.episodeCharacters)
    .where(eq(schema.episodeCharacters.episodeId, episodeId))
  const episodeCharIds = episodeCharLinks.map(link => link.characterId)
  const allChars = (await db.select().from(schema.characters))
    .filter(ch => episodeCharIds.includes(ch.id) && !ch.deletedAt)

  const episodePropLinks = await db.select().from(schema.episodeProps)
    .where(eq(schema.episodeProps.episodeId, episodeId))
  const episodePropIds = episodePropLinks.map(link => link.propId)
  const allProps = (await db.select().from(schema.props))
    .filter(p => episodePropIds.includes(p.id) && !p.deletedAt)

  return success(c, rows.map((row) => ({
    ...toSnakeCase(row),
    character_ids: charIdsByStoryboard.get(row.id) || [],
    prop_ids: propIdsByStoryboard.get(row.id) || [],
    characters: allChars
      .filter(ch => (charIdsByStoryboard.get(row.id) || []).includes(ch.id))
      .map(ch => toSnakeCase(ch)),
    props: allProps
      .filter(p => (propIdsByStoryboard.get(row.id) || []).includes(p.id))
      .map(p => toSnakeCase(p)),
  })))
})

// GET /episodes/:id/pipeline-status — pipeline progress
// GET /episodes/:id/generation-tasks — aggregate sys_task + video_merges for one episode
// sys_task has no episode_id; rows are attributed to the current episode via the
// storyboard/scene/character/prop association keys
app.get('/:id/generation-tasks', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  // i18n: user-facing
  if (!ep) return notFound(c, '剧集不存在')

  const sbs = await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))
  const storyboardIds = new Set(sbs.map(s => s.id))

  const epScenes = await db.select().from(schema.episodeScenes).where(eq(schema.episodeScenes.episodeId, episodeId))
  const sceneIds = new Set(epScenes.map(r => r.sceneId))
  // tolerate legacy data attached directly via scenes.episodeId
  const directScenes = await db.select().from(schema.scenes).where(eq(schema.scenes.episodeId, episodeId))
  directScenes.forEach(s => sceneIds.add(s.id))

  const epChars = await db.select().from(schema.episodeCharacters).where(eq(schema.episodeCharacters.episodeId, episodeId))
  const characterIds = new Set(epChars.map(r => r.characterId))

  const dramaProps = await db.select().from(schema.props).where(eq(schema.props.dramaId, ep.dramaId))
  const propIds = new Set(dramaProps.map(p => p.id))

  const allTasks = await db.select().from(schema.sysTask).where(eq(schema.sysTask.dramaId, ep.dramaId))
  const tasks = allTasks
    .filter(t =>
      (t.episodeId && t.episodeId === episodeId) ||
      (t.storyboardId && storyboardIds.has(t.storyboardId)) ||
      (t.sceneId && sceneIds.has(t.sceneId)) ||
      (t.characterId && characterIds.has(t.characterId)) ||
      (t.propId && propIds.has(t.propId))
    )
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

  const merges = (await db.select().from(schema.videoMerges)
    .where(and(eq(schema.videoMerges.episodeId, episodeId), isNull(schema.videoMerges.deletedAt))))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 20)

  return success(c, {
    tasks: toSnakeCaseArray(tasks),
    merges: toSnakeCaseArray(merges),
  })
})

app.get('/:id/pipeline-status', async (c) => {
  const episodeId = Number(c.req.param('id'))
  const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
  // i18n: user-facing
  if (!ep) return notFound(c, '剧集不存在')

  const chars = await db.select().from(schema.characters).where(eq(schema.characters.dramaId, ep.dramaId))
  const scenes = await db.select().from(schema.scenes).where(eq(schema.scenes.dramaId, ep.dramaId))
  const sbs = await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))
  const merges = await db.select().from(schema.videoMerges).where(eq(schema.videoMerges.episodeId, episodeId))

  const sbsWithImage = sbs.filter(s => s.composedImage)
  const sbsWithVideo = sbs.filter(s => s.videoUrl)
  const latestMerge = merges[merges.length - 1]

  function stepStatus(done: boolean, partial?: boolean) {
    if (done) return 'done'
    if (partial) return 'partial'
    return 'pending'
  }

  return success(c, {
    episode_id: episodeId,
    steps: {
      script_rewrite: { status: ep.scriptContent ? 'done' : (ep.content ? 'ready' : 'pending') },
      extract_characters: { status: stepStatus(chars.length > 0), count: chars.length },
      extract_scenes: { status: stepStatus(scenes.length > 0), count: scenes.length },
      extract_storyboards: { status: stepStatus(sbs.length > 0), count: sbs.length },
      generate_images: { status: stepStatus(sbsWithImage.length === sbs.length && sbs.length > 0, sbsWithImage.length > 0), completed: sbsWithImage.length, total: sbs.length },
      generate_videos: { status: stepStatus(sbsWithVideo.length === sbs.length && sbs.length > 0, sbsWithVideo.length > 0), completed: sbsWithVideo.length, total: sbs.length },
      merge_episode: { status: latestMerge?.status === 'completed' ? 'done' : (latestMerge ? latestMerge.status : 'pending'), merged_url: latestMerge?.mergedUrl },
    },
  })
})

// GET /episodes/:id/events — agent-level event stream SSE (FR-P1-1 completion)
// Replays history + tail-follows; during tail, after receiving agent_finished(ok) a short
// quiet window ends the stream (the agent chain has no sys_task terminal row, so the last
// agent_finished acts as the stream-end signal)
app.get('/:id/events', async (c) => {
  const id = Number(c.req.param('id'))
  const [ep] = await db.select({ id: schema.episodes.id }).from(schema.episodes).where(eq(schema.episodes.id, id))
  // i18n: user-facing
  if (!ep) return badRequest(c, '剧集不存在')

  const lastId = Number(c.req.header('Last-Event-ID') || c.req.query('lastEventId') || 0)
  return streamSSE(c, async (stream) => {
    let cursor = Number.isFinite(lastId) ? lastId : 0
    let open = true
    stream.onAbort(() => { open = false })

    // Phase 1: replay historical events (Last-Event-ID resume / reconnect backfill)
    for (;;) {
      const events = await readEpisodeEvents(id, cursor)
      for (const e of events) {
        await stream.writeSSE({ id: String(e.id), event: e.type, data: formatTaskEvent(e) })
        cursor = e.id
      }
      if (events.length < 100) break
    }

    // Phase 2: tail-follow. After agent_finished(ok=true), wait 3s of quiet (backfilling
    // final events) then end; without a finished signal, tail indefinitely (ends when the
    // client disconnects)
    let finished = false
    let quietSince: number | null = null
    for (;;) {
      if (!open) return
      const tail = await readEpisodeEvents(id, cursor, 20)
      if (tail.length) {
        for (const e of tail) {
          await stream.writeSSE({ id: String(e.id), event: e.type, data: formatTaskEvent(e) })
          cursor = e.id
          if (e.type === 'agent_finished') { finished = true; quietSince = Date.now() }
        }
        continue
      }
      if (finished && quietSince && Date.now() - quietSince > 3000) {
        await stream.writeSSE({ id: 'end', event: 'end', data: JSON.stringify({ done: true }) })
        return
      }
      await stream.sleep(1000)
    }
  })
})

export default app
