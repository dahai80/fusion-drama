import { Hono } from 'hono'
import { eq, and, desc, or } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, badRequest } from '../utils/response.js'
import { generateImage, generateVideo, requestTaskCancel, cancelTask } from '../services/generation.js'
import { getActiveConfig, getConfigById } from '../services/ai.js'
import { deleteStoredFile } from '../utils/storage.js'
import { getDramaStylePrompt } from '../services/style-preset.js'
import { logTaskError, logTaskPayload, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

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
 * 兼容项目原有扁平入参，也支持 Wan 3.0 官方 model/input/parameters 结构。
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
    if (body[key] !== undefined && !Array.isArray(body[key])) return `${key} 必须为数组`
    if (Array.isArray(body[key]) && body[key].some((url: any) => typeof url !== 'string' || !url.trim())) {
      return `${key} 中的每个 URL 都必须为非空字符串`
    }
  }

  if (body.official_media.length) {
    for (const item of body.official_media) {
      if (!item || typeof item !== 'object' || !WAN_MEDIA_TYPES.has(item.type) || typeof item.url !== 'string' || !item.url.trim()) {
        return 'input.media 中的每项都必须包含官方支持的 type 和非空 url'
      }
    }
    for (const type of ['first_frame', 'last_frame', 'file', 'link']) {
      if (body.official_media.filter((item: any) => item.type === type).length > 1) {
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
    if (imgs > 10 || vids > 5 || auds > 5) return 'Wan 3.0 参考素材超限：图片≤10、视频≤5、音频≤5'
    if (last && !first) return 'Wan 3.0 尾帧必须与首帧同时传入'
    if (file && link) return 'Wan 3.0 file 与 link 不能同时传入'
    if ((first || last) && (imgs + vids + auds > 0 || file || link)) {
      return 'Wan 3.0 的 first_frame/last_frame 不能与 reference_image/reference_video/reference_audio/file/link 混用'
    }
    const total = imgs + vids + auds + Number(first) + Number(last) + Number(file) + Number(link)
    if (total > 20) return 'Wan 3.0 input.media 最多 20 项'
  } else {
    if (imgs > 9 || vids > 3 || auds > 3) return '参考素材超限：图片≤9、视频≤3、音频≤3'
    if (auds > 0 && imgs + vids === 0) return '参考音频需要至少 1 个参考图片或视频'
  }

  if (!String(body.prompt || '').trim() && imgs + vids + auds === 0 && !first && !last && !file && !link) {
    return '视频生成需要至少一个参考素材或 prompt'
  }
  return null
}

// POST /tasks — 发起生成任务（body.type: image | video）
app.post('/', async (c) => {
  const body = await c.req.json()
  const type = body.type as TaskType
  if (type !== 'image' && type !== 'video') return badRequest(c, 'type 必须为 image 或 video')

  if (type === 'image') {
    if (!body.prompt) return badRequest(c, '提示词必填')
  }

  const videoBody = type === 'video' ? normalizeVideoRequest(body) : null

  if (videoBody) {
    // B20 参数硬校验：duration/seed 非整数（字符串/NaN）会传到适配器算出 NaN 帧数
    if (videoBody.duration != null) {
      videoBody.duration = Number(videoBody.duration)
      if (!Number.isInteger(videoBody.duration) || videoBody.duration <= 0 || videoBody.duration > 20) {
        return badRequest(c, 'duration 必须为 1-20 的整数（秒）')
      }
    }
    if (videoBody.seed != null) {
      videoBody.seed = Number(videoBody.seed)
      if (!Number.isInteger(videoBody.seed)) return badRequest(c, 'seed 必须为整数')
    }
  }

  try {
    // 请求显式指定 config_id（工作台模型下拉跨厂商切换）时优先；
    // 未指定才回退到集锁定配置，避免锁定配置与所选模型错配（如锁定 Seedance 却传 MiniMax 模型名）
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
        // issue #1: 视频任务未显式传任何参考素材时，自动把该分镜最新完成的成图（composedImage 优先，其次 firstFrameImage）
        // 作为首帧注入，避免纯 T2V 生成与分镜画面无关的内容
        if (type === 'video' && videoBody) {
          const hasExplicitRef = Boolean(
            videoBody.first_frame_url || videoBody.image_url || videoBody.last_frame_url
            || (videoBody.reference_image_urls?.length)
            || (videoBody.reference_video_urls?.length)
            || videoBody.file_url || videoBody.link_url,
          )
          if (!hasExplicitRef) {
            const sbImage = sb.composedImage || sb.firstFrameImage
            if (sbImage) autoFirstFrameUrl = sbImage
          }
          // 分镜 duration 兜底：未显式传 duration 时用分镜时长（分镜拆解设 8-10s），
          // 否则 sys_task 默认 5s → 121 帧 → 视频 5s 装不下 TTS 对白被 dub 丢弃
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

    // E4: 通用任务入口去重——同分镜同类型同 frameType 已有进行中任务时拒绝重复提交，
    // 连点/批量重试不再叠加两个长任务（本地引擎并发正是 Metal crash 诱因）
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
        try { prev = JSON.parse(t.params || '{}') } catch { /* 损坏 params 视为不同任务 */ }
        if ((prev.frameType ?? null) === (body.frame_type ?? null)) {
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

    // 视频生成时把项目视觉风格词注入提示词最前方（与图片侧的自动注入保持一致口径）
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

// GET /tasks/:id — 轮询任务状态
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.sysTask)
    .where(eq(schema.sysTask.id, id))
  return success(c, row || null)
})

// POST /tasks/:id/cancel — 取消生成任务（FR-P0-5：取消在步骤边界生效，不硬杀本地引擎）
const TERMINAL = new Set(['completed', 'failed', 'cancelled'])
app.post('/:id/cancel', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
  if (!row) return badRequest(c, '任务不存在')
  if (TERMINAL.has(row.status || '')) return badRequest(c, `任务已结束（${row.status}），无法取消`)
  const inflight = requestTaskCancel(id)
  const changed = await cancelTask(id, '用户取消')
  if (changed) {
    console.log(`[tasks] task ${id} cancelled (inflight=${inflight})`)
  } else if (inflight) {
    // 中断信号已发出但执行方尚未观察到（竞态窗口）——执行方观察到 abort 后自行落 cancelled
    console.log(`[tasks] task ${id} cancel signal sent, awaiting executor`)
  } else {
    return badRequest(c, '任务当前状态不可取消，请刷新后重试')
  }
  return success(c, { cancelled: changed, inflight })
})

// GET /tasks — 按 type / storyboard_id / drama_id 过滤（SQL 级过滤 + 上限截断）
app.get('/', async (c) => {
  const type = c.req.query('type')
  const storyboardId = c.req.query('storyboard_id')
  const dramaId = c.req.query('drama_id')

  // B15: 表无界增长后全表扫描 + 内存过滤会拖垮列表接口；SQL 级过滤 + LIMIT 截断
  const conditions = []
  if (type) conditions.push(eq(schema.sysTask.type, type))
  if (storyboardId) conditions.push(eq(schema.sysTask.storyboardId, Number(storyboardId)))
  if (dramaId) conditions.push(eq(schema.sysTask.dramaId, Number(dramaId)))
  const rows = await db.select().from(schema.sysTask)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.sysTask.id))
    .limit(500)

  return success(c, rows)
})

// DELETE /tasks/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
  await db.delete(schema.sysTask).where(eq(schema.sysTask.id, id))
  // R2: 删除任务联动清理产物文件，磁盘不再只进不出；
  // 业务表（角色/场景/道具/分镜）仍引用同一路径时保留文件防悬空
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
