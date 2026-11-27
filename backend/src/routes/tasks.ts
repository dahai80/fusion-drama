import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { eq, and, desc, or, gt, asc, sql } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, badRequest } from '../utils/response.js'
import { readTaskEvents, formatTaskEvent } from '../utils/task-events.js'
import { generateImage, generateVideo, requestTaskCancel, cancelTask } from '../services/generation.js'
import { getActiveConfig, getConfigById } from '../services/ai.js'
import { deleteStoredFile } from '../utils/storage.js'
import { getDramaStylePrompt } from '../services/style-preset.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { gpuQueueDepth } from '../services/gpu-queue.js'

const app = new Hono()

type TaskType = 'image' | 'video'

const WAN_MEDIA_TYPES = new Set([
  'first_frame',
  'last_frame',
  'reference_image',
  'reference_video',
  'reference_audio',
  'file',
  'link',
])

/**
 * Accepts the project's legacy flat params as well as the official Wan 3.0 model/input/parameters structure.
 */
function normalizeVideoRequest(body: any) {
  const input = body.input && typeof body.input === 'object' && !Array.isArray(body.input) ? body.input : {}
  const parameters = body.parameters && typeof body.parameters === 'object' && !Array.isArray(body.parameters)
    ? body.parameters
    : {}
  const media = Array.isArray(input.media) ? input.media : []

  const mediaUrls = (type: string) => media
    .filter((item: any) => item?.type === type)
    .map((item: any) => item?.url)

  return {
    ...body,
    prompt: body.prompt ?? input.prompt ?? '',
    reference_image_urls: body.reference_image_urls ?? mediaUrls('reference_image'),
    reference_video_urls: body.reference_video_urls ?? mediaUrls('reference_video'),
    reference_audio_urls: body.reference_audio_urls ?? mediaUrls('reference_audio'),
    first_frame_url: body.first_frame_url ?? mediaUrls('first_frame')[0],
    last_frame_url: body.last_frame_url ?? mediaUrls('last_frame')[0],
    file_url: body.file_url ?? mediaUrls('file')[0],
    link_url: body.link_url ?? mediaUrls('link')[0],
    generate_audio: body.generate_audio ?? parameters.audio,
    duration: body.duration ?? parameters.duration,
    aspect_ratio: body.aspect_ratio ?? parameters.ratio,
    resolution: body.resolution ?? parameters.resolution,
    seed: body.seed ?? parameters.seed,
    prompt_extend: body.prompt_extend ?? parameters.prompt_extend,
    watermark: body.watermark ?? parameters.watermark,
    video_pipeline: body.video_pipeline ?? parameters.video_pipeline,
    official_media: media,
  }
}

function validateVideoRequest(body: any, provider?: string): string | null {
  for (const key of ['reference_image_urls', 'reference_video_urls', 'reference_audio_urls']) {
    // i18n: user-facing
    if (body[key] !== undefined && !Array.isArray(body[key])) return `${key} 必须为数组`
    // i18n: user-facing
    if (Array.isArray(body[key]) && body[key].some((url: any) => typeof url !== 'string' || !url.trim())) {
      // i18n: user-facing
      return `${key} 中的每个 URL 都必须为非空字符串`
    }
  }

  if (body.official_media.length) {
    for (const item of body.official_media) {
      // i18n: user-facing
      if (!item || typeof item !== 'object' || !WAN_MEDIA_TYPES.has(item.type) || typeof item.url !== 'string' || !item.url.trim()) {
        // i18n: user-facing
        return 'input.media 中的每项都必须包含官方支持的 type 和非空 url'
      }
    }
    for (const type of ['first_frame', 'last_frame', 'file', 'link']) {
      if (body.official_media.filter((item: any) => item.type === type).length > 1) {
        // i18n: user-facing
        return `Wan 3.0 input.media 中 ${type} 最多 1 项`
      }
    }
  }

  const imgs = body.reference_image_urls.length
  const vids = body.reference_video_urls.length
  const auds = body.reference_audio_urls.length
  const first = Boolean(body.first_frame_url)
  const last = Boolean(body.last_frame_url)
  const file = Boolean(body.file_url)
  const link = Boolean(body.link_url)

  if ((provider || '').toLowerCase() === 'aliyun') {
    // i18n: user-facing
    if (imgs > 10 || vids > 5 || auds > 5) return 'Wan 3.0 参考素材超限：图片≤10、视频≤5、音频≤5'
    // i18n: user-facing
    if (last && !first) return 'Wan 3.0 尾帧必须与首帧同时传入'
    // i18n: user-facing
    if (file && link) return 'Wan 3.0 file 与 link 不能同时传入'
    // i18n: user-facing
    if ((first || last) && (imgs + vids + auds > 0 || file || link)) {
      // i18n: user-facing
      return 'Wan 3.0 的 first_frame/last_frame 不能与 reference_image/reference_video/reference_audio/file/link 混用'
    }
    const total = imgs + vids + auds + Number(first) + Number(last) + Number(file) + Number(link)
    // i18n: user-facing
    if (total > 20) return 'Wan 3.0 input.media 最多 20 项'
  } else {
    // i18n: user-facing
    if (imgs > 9 || vids > 3 || auds > 3) return '参考素材超限：图片≤9、视频≤3、音频≤3'
    // i18n: user-facing
    if (auds > 0 && imgs + vids === 0) return '参考音频需要至少 1 个参考图片或视频'
  }

  // i18n: user-facing
  if (!String(body.prompt || '').trim() && imgs + vids + auds === 0 && !first && !last && !file && !link) {
    // i18n: user-facing
    return '视频生成需要至少一个参考素材或 prompt'
  }
  return null
}

// POST /tasks — start a generation task (body.type: image | video)
app.post('/', async (c) => {
  const body = await c.req.json()
  const type = body.type as TaskType
  // i18n: user-facing
  if (type !== 'image' && type !== 'video') return badRequest(c, 'type 必须为 image 或 video')

  if (type === 'image') {
    // i18n: user-facing
    if (!body.prompt) return badRequest(c, '提示词必填')
  }

  const videoBody = type === 'video' ? normalizeVideoRequest(body) : null

  if (videoBody) {
    // B20 hard param validation: non-integer duration/seed (string/NaN) would reach the adapter and produce NaN frame counts
    if (videoBody.duration != null) {
      videoBody.duration = Number(videoBody.duration)
      // i18n: user-facing
      if (!Number.isInteger(videoBody.duration) || videoBody.duration <= 0 || videoBody.duration > 20) {
        // i18n: user-facing
        return badRequest(c, 'duration 必须为 1-20 的整数（秒）')
      }
    }
    if (videoBody.seed != null) {
      videoBody.seed = Number(videoBody.seed)
      // i18n: user-facing
      if (!Number.isInteger(videoBody.seed)) return badRequest(c, 'seed 必须为整数')
    }
  }

  try {
    // Prefer the config_id explicitly set in the request (workbench model dropdown cross-provider switch);
    // only fall back to the episode-locked config when unset, avoiding mismatch between the locked
    // config and the selected model (e.g. locked Seedance while passing a MiniMax model name)
    let configId: number | undefined = body.config_id
    let episodeResolution: string | undefined
    let storyboardDramaId: number | undefined
    let autoFirstFrameUrl: string | undefined
    if (body.storyboard_id) {
      const [sb] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, Number(body.storyboard_id)))
      if (sb) {
        const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId))
        const locked = type === 'image' ? ep?.imageConfigId : ep?.videoConfigId
        if (locked != null && configId == null) configId = locked
        if (type === 'video' && ep?.resolution) episodeResolution = ep.resolution
        storyboardDramaId = ep?.dramaId ?? undefined
        // issue #1: the storyboard image (composedImage first, then firstFrameImage) is auto-used as the video first frame.
        // The storyboard image is the visual baseline of the shot and takes priority over asset reference images
        // (asset images are still passed via reference_image_urls to cloud multi-reference models);
        // explicit first_frame_url/image_url still has the highest priority
        if (type === 'video' && videoBody) {
          const hasExplicitFrame = Boolean(videoBody.first_frame_url || videoBody.image_url)
          if (!hasExplicitFrame) {
            const sbImage = sb.composedImage || sb.firstFrameImage
            if (sbImage) autoFirstFrameUrl = sbImage
          }
          // Storyboard duration fallback: when duration is not passed explicitly use the storyboard duration
          // (storyboard breakdown sets 8-10s), otherwise sys_task defaults to 5s → 121 frames → a 5s video
          // cannot fit TTS dialogue lines which get dropped by the dub step
          if (videoBody && !videoBody.duration && sb.duration) {
            videoBody.duration = sb.duration
          }
        }
      }
    }

    if (type === 'video' && videoBody) {
      const effectiveConfig = configId
        ? (await getConfigById(configId)) ?? await getActiveConfig('video')
        : await getActiveConfig('video')
      const validationError = validateVideoRequest(videoBody, effectiveConfig?.provider)
      if (validationError) return badRequest(c, validationError)
    }

    // E4: generic task-entry dedup — reject duplicate submission when a task of the same
    // type and frameType is already running for the same storyboard, so double clicks / batch
    // retries no longer stack two long tasks (local-engine concurrency is exactly what triggers Metal crash)
    if (body.storyboard_id) {
      const dupRows = await db.select({ id: schema.sysTask.id, params: schema.sysTask.params })
        .from(schema.sysTask)
        .where(and(
          eq(schema.sysTask.type, type),
          eq(schema.sysTask.storyboardId, Number(body.storyboard_id)),
          eq(schema.sysTask.status, 'processing'),
        ))
        .limit(5)
      for (const t of dupRows) {
        let prev: any = {}
        try { prev = JSON.parse(t.params || '{}') } catch { /* corrupted params treated as a different task */ }
        if ((prev.frameType ?? null) === (body.frame_type ?? null)) {
          // i18n: user-facing
          return badRequest(c, '该分镜已有进行中的同类型生成任务，请等待完成或先删除任务')
        }
      }
    }

    logTaskStart('TaskAPI', 'generate', {
      type,
      storyboardId: body.storyboard_id,
      sceneId: body.scene_id,
      characterId: body.character_id,
      dramaId: body.drama_id,
    })
    logTaskPayload('TaskAPI', 'request body', body)

    // For video generation, inject the project visual style words at the front of the prompt
    // (same convention as the auto-injection on the image side)
    let videoPrompt = videoBody?.prompt
    if (type === 'video' && String(videoPrompt || '').trim()) {
      const dramaId = body.drama_id ?? storyboardDramaId ?? null
      const stylePrompt = await getDramaStylePrompt(dramaId)
      if (stylePrompt) videoPrompt = `${stylePrompt}，\n${videoPrompt}`
    }

    const id = type === 'image'
      ? await generateImage({
        storyboardId: body.storyboard_id,
        dramaId: body.drama_id,
        sceneId: body.scene_id,
        characterId: body.character_id,
        prompt: body.prompt,
        model: body.model,
        size: body.size,
        referenceImages: body.reference_images,
        frameType: body.frame_type,
        configId,
        retryOf: body.retry_of ? Number(body.retry_of) : undefined,
      })
      : await generateVideo({
        storyboardId: body.storyboard_id,
        dramaId: body.drama_id,
        prompt: videoPrompt,
        model: videoBody!.model,
        referenceMode: 'reference',
        imageUrl: videoBody!.image_url,
        firstFrameUrl: videoBody!.first_frame_url || autoFirstFrameUrl,
        lastFrameUrl: videoBody!.last_frame_url,
        referenceImageUrls: videoBody!.reference_image_urls,
        referenceVideoUrls: videoBody!.reference_video_urls,
        referenceAudioUrls: videoBody!.reference_audio_urls,
        referenceFileUrl: videoBody!.file_url,
        referenceLinkUrl: videoBody!.link_url,
        generateAudio: videoBody!.generate_audio,
        duration: videoBody!.duration,
        aspectRatio: videoBody!.aspect_ratio,
        resolution: episodeResolution || videoBody!.resolution,
        seed: videoBody!.seed,
        promptExtend: videoBody!.prompt_extend,
        watermark: videoBody!.watermark,
        videoPipeline: videoBody!.video_pipeline,
        configId,
        retryOf: body.retry_of ? Number(body.retry_of) : undefined,
      })

    const [record] = await db.select().from(schema.sysTask)
      .where(eq(schema.sysTask.id, id))
    logTaskSuccess('TaskAPI', 'generate', { taskId: id, type, provider: record?.provider })
    return created(c, record)
  } catch (err: any) {
    logTaskError('TaskAPI', 'generate', { type, error: err.message })
    return badRequest(c, err.message)
  }
})

// GET /tasks/queue — GPU serial queue depth (NFR-REL-4 queuing feedback: frontend shows queue position)
app.get('/queue', (c) => {
  return success(c, { depth: gpuQueueDepth() })
})

// GET /tasks/retry-stats — retry success rate metric (PRD §10.2: post-failure retry success rate ≥90%)
// Definition: tasks with non-null retry_of are "retry tasks"; their status=completed counts as success.
// Baseline = all failed tasks (distinct original tasks), showing coverage of retry actions
app.get('/retry-stats', async (c) => {
  const retried = await db
    .select({ retryOf: schema.sysTask.retryOf, status: schema.sysTask.status })
    .from(schema.sysTask)
    .where(sql`${schema.sysTask.retryOf} IS NOT NULL`)
  const succeeded = retried.filter(r => r.status === 'completed').length
  const failedTasks = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${schema.sysTask.retryOf})` })
    .from(schema.sysTask)
    .where(sql`${schema.sysTask.retryOf} IS NOT NULL`)
  const retriedOrigins = Number(failedTasks[0]?.count || 0)
  const allFailed = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.sysTask)
    .where(eq(schema.sysTask.status, 'failed'))
  const totalFailed = Number(allFailed[0]?.count || 0)
  return success(c, {
    retries: retried.length,
    retrySucceeded: succeeded,
    retrySuccessRate: retried.length ? Math.round((succeeded / retried.length) * 100) : null,
    failedTasksTotal: totalFailed,
    failedTasksRetried: retriedOrigins,
  })
})

// GET /tasks/:id — poll task status
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.sysTask)
    .where(eq(schema.sysTask.id, id))
  return success(c, row || null)
})

// GET /tasks/:id/events — SSE event stream (FR-P1-1: progress visibility + Last-Event-ID resume)
// Event source = sys_task_events table replay + DB tail tracking until terminal state
// (single-process deployment, no broadcast infra needed)
app.get('/:id/events', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
  // i18n: user-facing
  if (!row) return badRequest(c, '任务不存在')

  const lastSeq = Number(c.req.header('Last-Event-ID') || c.req.query('lastEventId') || 0)
  const TASK_TERMINAL = new Set(['completed', 'failed', 'cancelled'])

  return streamSSE(c, async (stream) => {
    let cursor = Number.isFinite(lastSeq) ? lastSeq : 0
    let open = true
    stream.onAbort(() => { open = false })

    // Phase 1: replay historical events (Last-Event-ID resume / reconnect backfill)
    for (;;) {
      const events = await readTaskEvents(id, cursor)
      for (const e of events) {
        await stream.writeSSE({ id: String(e.seq), event: e.type, data: formatTaskEvent(e) })
        cursor = e.seq
      }
      if (events.length < 100) break
    }

    // Phase 2: DB tail tracking while the task is not terminal (1s polling cursor, until terminal state or client disconnect)
    for (;;) {
      if (!open) return
      const [fresh] = await db.select({ status: schema.sysTask.status }).from(schema.sysTask).where(eq(schema.sysTask.id, id))
      const [tail] = await readTaskEvents(id, cursor, 10)
      if (tail) {
        await stream.writeSSE({ id: String(tail.seq), event: tail.type, data: formatTaskEvent(tail) })
        cursor = tail.seq
        continue
      }
      if (fresh && TASK_TERMINAL.has(fresh.status || '') && !tail) {
        await stream.writeSSE({ id: 'end', event: 'end', data: JSON.stringify({ status: fresh.status }) })
        return
      }
      await stream.sleep(1000)
    }
  })
})

// POST /tasks/:id/cancel — cancel a generation task (FR-P0-5: cancellation takes effect at step
// boundaries, never hard-kills the local engine)
const TERMINAL = new Set(['completed', 'failed', 'cancelled'])
app.post('/:id/cancel', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
  // i18n: user-facing
  if (!row) return badRequest(c, '任务不存在')
  // i18n: user-facing
  if (TERMINAL.has(row.status || '')) return badRequest(c, `任务已结束（${row.status}），无法取消`)
  const inflight = requestTaskCancel(id)
  // i18n: user-facing
  const changed = await cancelTask(id, '用户取消')
  if (changed) {
    console.log(`[tasks] task ${id} cancelled (inflight=${inflight})`)
  } else if (inflight) {
    // Abort signal sent but the executor has not observed it yet (race window) — the executor
    // records cancelled itself once it observes the abort
    console.log(`[tasks] task ${id} cancel signal sent, awaiting executor`)
  } else {
    // i18n: user-facing
    return badRequest(c, '任务当前状态不可取消，请刷新后重试')
  }
  return success(c, { cancelled: changed, inflight })
})

// GET /tasks — filter by type / storyboard_id / drama_id (SQL-level filtering + limit truncation)
app.get('/', async (c) => {
  const type = c.req.query('type')
  const storyboardId = c.req.query('storyboard_id')
  const dramaId = c.req.query('drama_id')

  // B15: after unbounded table growth, full table scan + in-memory filtering would crush the list
  // endpoint; SQL-level filtering + LIMIT truncation
  const conditions = []
  if (type) conditions.push(eq(schema.sysTask.type, type))
  if (storyboardId) conditions.push(eq(schema.sysTask.storyboardId, Number(storyboardId)))
  if (dramaId) conditions.push(eq(schema.sysTask.dramaId, Number(dramaId)))
  const rows = await db.select().from(schema.sysTask)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.sysTask.id))
    .limit(500)

  // Legacy dirty-data defense: result_url holding multi-MB data URIs (old image tasks) would
  // blow up JSON.stringify when returned as-is (RangeError: Invalid string length → 500);
  // uniformly downgrade to localPath
  const sanitized = rows.map((r: any) => (
    r.resultUrl && r.resultUrl.startsWith('data:') ? { ...r, resultUrl: r.localPath || null } : r
  ))
  return success(c, sanitized)
})

// DELETE /tasks/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
  await db.delete(schema.sysTask).where(eq(schema.sysTask.id, id))
  // R2: deleting a task also cleans up its artifact files so disk no longer only grows;
  // keep the file when business tables (characters/scenes/props/storyboards) still reference the
  // same path, to avoid dangling references
  if (row?.localPath) {
    const p = row.localPath
    const [charRef] = await db.select({ id: schema.characters.id }).from(schema.characters).where(eq(schema.characters.localPath, p)).limit(1)
    const [sceneRef] = await db.select({ id: schema.scenes.id }).from(schema.scenes).where(eq(schema.scenes.localPath, p)).limit(1)
    const [propRef] = await db.select({ id: schema.props.id }).from(schema.props).where(eq(schema.props.localPath, p)).limit(1)
    const [sbRef] = await db.select({ id: schema.storyboards.id }).from(schema.storyboards).where(or(
      eq(schema.storyboards.composedImage, p),
      eq(schema.storyboards.firstFrameImage, p),
      eq(schema.storyboards.lastFrameImage, p),
      eq(schema.storyboards.videoUrl, p),
    )).limit(1)
    if (!charRef && !sceneRef && !propRef && !sbRef) {
      deleteStoredFile(p)
      console.log(`[tasks] deleted task ${id}, removed orphan artifact: ${p}`)
    }
  }
  return success(c)
})

export default app
