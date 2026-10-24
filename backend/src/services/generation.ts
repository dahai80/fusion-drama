/**
 * 统一生成任务服务 — 图片/视频生成共用 sys_task 表与同一条生命周期：
 * 创建(processing) → 适配器构建请求 → 同步完成或异步轮询 → 下载落盘 → 回写业务表
 */
import { db, getInsertId, schema } from '../db/index.js'
import { and, eq } from 'drizzle-orm'
import { getActiveConfig, getConfigById } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile, fetchImageAsCompressedDataUrl, generateImageThumb, readImageAsCompressedDataUrl, saveBase64Image } from '../utils/storage.js'
import { extractVideoPoster } from '../utils/video-poster.js'
import { getImageAdapter, getVideoAdapter } from './adapters/registry'
import { isMiniMaxH3, isWan22Ti2v5b } from './adapters/fusion-video'
import { enqueueGpuWork } from './gpu-queue'
import { appendTaskEvent } from '../utils/task-events'
// P2: 零超时 dispatcher 模块级单例——每个 fetch new Agent 会各建一个连接池，从不 close
const laxDispatcher = new UndiciAgent({ headersTimeout: 0, bodyTimeout: 0 })
import { ensureCharacterFinalPrompt, ensureSceneFinalPrompt, ensurePropFinalPrompt } from './final-prompt.js'
import type { AIConfig, ImageProviderAdapter, VideoProviderAdapter } from './adapters/types'
import { getModel } from '../agents/index.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'
import { Agent as UndiciAgent } from 'undici'

type TaskType = 'image' | 'video'

const taskLabel = (type: TaskType) => (type === 'image' ? 'ImageTask' : 'VideoTask')

// 轮询节奏：图片 5s×120（上限 10 分钟）；视频 10s×300（上限 60 分钟 wall-clock）
const POLL_PROFILES: Record<TaskType, { attempts: number; intervalMs: number; maxDurationMs: number | null }> = {
  image: { attempts: 120, intervalMs: 5000, maxDurationMs: 600_000 },
  video: { attempts: 300, intervalMs: 10_000, maxDurationMs: 3_600_000 },
}

interface GenerateImageParams {
  storyboardId?: number
  dramaId?: number
  sceneId?: number
  characterId?: number
  propId?: number
  prompt: string
  model?: string
  size?: string
  referenceImages?: string[]
  frameType?: string
  configId?: number
  /** 队列内富化：资产缺最终提示词时，生图前在 GPU 串行队列内跑 prompt_generator 补齐 */
  enrichEpisodeId?: number
  textModel?: string
  textConfigId?: number
  /** v5 PRD §10.2：重试溯源——重发失败任务时指向原任务 id */
  retryOf?: number
}

interface GenerateVideoParams {
  storyboardId?: number
  dramaId?: number
  prompt: string
  model?: string
  referenceMode?: string
  imageUrl?: string
  firstFrameUrl?: string
  lastFrameUrl?: string
  referenceImageUrls?: string[]
  referenceVideoUrls?: string[]
  referenceAudioUrls?: string[]
  referenceFileUrl?: string
  referenceLinkUrl?: string
  generateAudio?: boolean
  duration?: number
  aspectRatio?: string
  resolution?: string
  seed?: number
  promptExtend?: boolean
  watermark?: boolean
  /** 画质档（仅 fusion LTX-2.5）：'dev'=高质量单阶段（慢），缺省 distilled=快速 */
  videoPipeline?: string
  configId?: number
  /** v5 PRD §10.2：重试溯源——重发失败任务时指向原任务 id */
  retryOf?: number
}

export async function generateImage(params: GenerateImageParams): Promise<number> {
  // 指定配置（集锁定）可能已停用/删除/厂商收敛，失效时回退到当前启用配置，避免生成被旧引用卡死
  const config = params.configId
    ? (await getConfigById(params.configId)) ?? await getActiveConfig('image')
    : await getActiveConfig('image')
  if (!config) throw new Error('未配置图片模型，请先到「设置」页添加并启用 AI 服务')

  const id = await createTask('image', config, {
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    propId: params.propId,
    prompt: params.prompt,
    model: params.model || config.model,
    retryOf: params.retryOf,
  }, {
    size: params.size || '1920x1080',
    frameType: params.frameType,
    referenceImages: params.referenceImages,
    enrichEpisodeId: params.enrichEpisodeId,
    textModel: params.textModel,
    textConfigId: params.textConfigId,
    configId: params.configId,
  })

  logTaskStart('ImageTask', 'enqueue', {
    id,
    provider: config.provider,
    storyboardId: params.storyboardId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    frameType: params.frameType,
    model: params.model || config.model,
  })
  logTaskPayload('ImageTask', 'enqueue params', {
    id,
    config: { provider: config.provider, model: config.model, baseUrl: config.baseUrl },
    params,
  })
  return id
}

export async function generateVideo(params: GenerateVideoParams): Promise<number> {
  // 指定配置（集锁定）可能已停用/删除/厂商收敛，失效时回退到当前启用配置
  const config = params.configId
    ? (await getConfigById(params.configId)) ?? await getActiveConfig('video')
    : await getActiveConfig('video')
  if (!config) throw new Error('未配置视频模型，请先到「设置」页添加并启用 AI 服务')

  const id = await createTask('video', config, {
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    prompt: params.prompt,
    model: params.model || config.model,
    retryOf: params.retryOf,
  }, {
    referenceMode: params.referenceMode || 'reference',
    imageUrl: params.imageUrl,
    firstFrameUrl: params.firstFrameUrl,
    lastFrameUrl: params.lastFrameUrl,
    referenceImageUrls: params.referenceImageUrls,
    referenceVideoUrls: params.referenceVideoUrls,
    referenceAudioUrls: params.referenceAudioUrls,
    referenceFileUrl: params.referenceFileUrl,
    referenceLinkUrl: params.referenceLinkUrl,
    generateAudio: params.generateAudio === false ? 0 : 1,
    duration: params.duration,
    aspectRatio: params.aspectRatio,
    // 统一存为项目内部格式，各适配器再转换为官方大小写与枚举。
    resolution: normalizeStoredVideoResolution(params.resolution),
    seed: params.seed,
    promptExtend: params.promptExtend,
    watermark: params.watermark,
    videoPipeline: params.videoPipeline,
    configId: params.configId,
  })

  logTaskStart('VideoTask', 'enqueue', {
    id,
    provider: config.provider,
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    referenceMode: params.referenceMode || 'reference',
    duration: params.duration || 5,
  })
  logTaskPayload('VideoTask', 'enqueue params', {
    id,
    config: { provider: config.provider, model: config.model, baseUrl: config.baseUrl },
    params,
  })
  return id
}

async function createTask(
  type: TaskType,
  config: AIConfig,
  fields: {
    storyboardId?: number
    dramaId?: number
    sceneId?: number
    characterId?: number
    propId?: number
    prompt: string
    model?: string | null
    /** v5 PRD §10.2：重试溯源——重发失败任务时指向原任务 id */
    retryOf?: number
  },
  params: Record<string, unknown>,
): Promise<number> {
  const ts = now()
  const res = await db.insert(schema.sysTask).values({
    type,
    ...fields,
    provider: config.provider,
    params: JSON.stringify(params),
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  })

  const id = getInsertId(res)
  enqueueTask(id, type, config)
  return id
}

// ===== 全局串行执行队列 =====
// 背景：本地模型（fusion-mlx）无法并行处理多个生成请求（显存互相挤占/排队超时），
// 且批量生成（角色/场景/道具/分镜）并发提交会互相拖垮。
// 所有生成任务（图片/视频）统一入队，严格按提交顺序逐一执行。
// 云端厂商同样受益：避免并发限流。与资产提取共用 gpu-queue（FLUX + Qwen3.5 并发
// 会 GPU 争用致 Metal command buffer 崩溃 → fusion-mlx SIGTERM 挂死）。
function enqueueTask(id: number, type: TaskType, config: AIConfig): void {
  enqueueGpuWork(`${taskLabel(type)}-${id}`, (signal) => processTask(id, config, signal), {
    // NFR-REL-4: 排队反馈——位置>1 时前端展示「排队中第 N 位」（SSE/轮询可见）
    onQueued: (position) => {
      if (position > 1) appendTaskEvent(id, 'queued', { position })
    },
  })
    .catch(err => {
      // R1: 入队失败（队列满/watchdog）也要落终态，任务行不能停在 processing
      logTaskError(taskLabel(type), 'process', { id, error: err.message })
      failTask(id, `任务执行中断: ${err.message}`).catch(e => logTaskError(taskLabel(type), 'failTask-error', { id, error: e?.message }))
    })
}

// ===== FR-P0-5a 任务取消（PRD 4.7：取消只在步骤边界生效，不硬杀本地引擎进程）=====
// 注册表 taskId -> 控制器；abort 后由 fetch 中断 / 轮询下一跳退出完成终态落库。
// 注册表在终态写回时清理（failTask/cancelTask/completed 回写/孤儿轮询退出）
const activeCancels = new Map<number, AbortController>()

/** 请求取消在途任务；返回是否找到了在途执行（否则由调用方做乐观落库） */
export function requestTaskCancel(id: number): boolean {
    const ac = activeCancels.get(id)
    if (!ac) return false
    ac.abort()
    return true
}

/** 取消终态：乐观条件（仅 processing 可落 cancelled），防覆盖已完成回写（NFR-DATA-1） */
export async function cancelTask(id: number, reason: string): Promise<boolean> {
    const res = await db.update(schema.sysTask)
        .set({ status: 'cancelled', errorMsg: reason, completedAt: now(), updatedAt: now() })
        .where(and(eq(schema.sysTask.id, id), eq(schema.sysTask.status, 'processing')))
    const changed = (res as unknown as { changes?: number })?.changes ?? 0
    if (changed > 0) {
      activeCancels.delete(id)
      appendTaskEvent(id, 'cancelled', { reason: reason.slice(0, 200) })
    }
    return changed > 0
}

function parseTaskParams(raw: string | null | undefined): Record<string, any> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) || {}
  } catch {
    return {}
  }
}

/** 检测文本是否含中文/日文假名（FLUX 等文生图模型不识中文，中文段会被忽略导致出图雷同） */
function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff\u3040-\u30ff]/.test(text)
}

/** fusion-mlx \u56fe\u7247\u6a21\u578b\uff08FLUX.1-dev\uff09\u65e0 ttl_seconds \u4e0d\u4f1a\u81ea\u52a8\u9a71\u9010\uff0c
 *  \u56fe\u751f\u6210\u540e\u5e38\u9a7b ~34GB GPU \u5185\u5b58\uff0c\u4e0e\u540e\u7eed\u8d44\u4ea7\u63d0\u53d6 Qwen3.5 decode \u4e89\u7528 \u2192
 *  Metal command buffer \u5d29\u6e83 \u2192 fusion-mlx SIGTERM\u3002\u56fe\u5b8c\u6210\u540e\u663e\u5f0f\u5378\u8f7d\u3002
 *  \u4ec5\u5bf9 baseUrl \u6307\u5411 fusion-mlx\uff08localhost:11434\uff09\u7684 openai \u56fe\u7247\u914d\u7f6e\u751f\u6548\u3002 */
async function unloadFusionImageModel(config: AIConfig, model: string | null): Promise<void> {
  try {
    const baseUrl = config.baseUrl || ''
    if (!/127\.0\.0\.1:11434|localhost:11434/.test(baseUrl)) return
    const m = model || config.model || ''
    if (!m) return
    const url = `${baseUrl.replace(/\/+$/, '')}/v1/models/${m}/unload`
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.apiKey || ''}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) logTaskProgress('ImageTask', 'model-unloaded', { model: m })
  } catch (err: any) {
    logTaskWarn('ImageTask', 'model-unload-failed', { model, error: err?.message })
  }
}

/** fusion-mlx 文本模型（Qwen3.5）在视频翻译后被加载常驻，与随后准入的
 *  LTX-2.5（~60GB）内存竞争 → memory guard 直接取消视频任务（503）。
 *  视频翻译完成后显式卸载文本模型，为视频生成腾出内存。
 *  仅对 baseUrl 指向 fusion-mlx（localhost:11434）的文本配置生效。 */
async function unloadFusionTextModel(): Promise<void> {
  try {
    const config = await getActiveConfig('text')
    if (!config) return
    const baseUrl = config.baseUrl || ''
    if (!/127\.0\.0\.1:11434|localhost:11434/.test(baseUrl)) return
    const m = config.model || ''
    if (!m) return
    const url = `${baseUrl.replace(/\/+$/, '')}/v1/models/${m}/unload`
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.apiKey || ''}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) logTaskProgress('VideoTask', 'text-model-unloaded', { model: m })
  } catch (err: any) {
    logTaskWarn('VideoTask', 'text-model-unload-failed', { error: err?.message })
  }
}

/**
 * 生图前把含中文的提示词翻译成英文（走当前文本模型，一次直出）。
 * 失败时返回原文并记警告——翻译只是增强，不阻断生成。
 */
async function translatePromptToEnglish(prompt: string, taskLabel_: string, id: number): Promise<string> {
  if (!prompt || !containsChinese(prompt)) return prompt
  try {
    const { getTextConfig, getTextProviderBaseUrl } = await import('./ai.js')
    const textConfig = await getTextConfig()
    const baseUrl = getTextProviderBaseUrl(textConfig)
    const dispatcher = laxDispatcher
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${textConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: textConfig.model,
        messages: [
          { role: 'system', content: 'You are a translation engine for image-generation prompts. Translate the user text to English. Keep the visual details, style words, and structure verbatim in meaning; output ONLY the translated prompt text, no explanations, no quotes.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 4096,
      }),
      dispatcher,
    } as any)
    if (!resp.ok) throw new Error(`translate API ${resp.status}`)
    const result = await resp.json() as any
    const translated = result?.choices?.[0]?.message?.content?.trim()
    if (!translated) return prompt
    logTaskProgress(taskLabel_, 'prompt-translated', { id, originalLength: prompt.length, translatedLength: translated.length })
    return translated
  } catch (err: any) {
    logTaskWarn(taskLabel_, 'prompt-translate-failed', { id, error: err?.message })
    return prompt
  }
}

/** 队列内富化：路由建行时用模板提示词的任务，执行前在此补最终提示词。
 *  必须在 GPU 串行队列内执行——队列外并发富化（LLM Agent）与 FLUX 生图曾致
 *  G2 毒死 + fusion-mlx 服务冻结（2026-10-13 08:24/08:47 两轮实证）。 */
async function enrichImagePromptIfNeeded(
  record: typeof schema.sysTask.$inferSelect,
  params: Record<string, any>,
  label: string,
): Promise<string> {
  const episodeId = params.enrichEpisodeId
  if (!episodeId) return record.prompt || ''
  try {
    if (record.characterId) {
      const [char] = await db.select().from(schema.characters).where(eq(schema.characters.id, record.characterId))
      if (!char) return record.prompt || ''
      const fp = await ensureCharacterFinalPrompt(char, episodeId, false, { model: params.textModel, configId: params.textConfigId ?? undefined })
      if (fp) {
        await db.update(schema.sysTask).set({ prompt: fp, updatedAt: now() }).where(eq(schema.sysTask.id, record.id))
        logTaskProgress(label, 'prompt-enriched', { id: record.id, characterId: record.characterId })
        return fp
      }
    } else if (record.sceneId) {
      const [scene] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, record.sceneId))
      if (!scene) return record.prompt || ''
      const fp = await ensureSceneFinalPrompt(scene, episodeId, false, { model: params.textModel, configId: params.textConfigId ?? undefined })
      if (fp) {
        await db.update(schema.sysTask).set({ prompt: fp, updatedAt: now() }).where(eq(schema.sysTask.id, record.id))
        logTaskProgress(label, 'prompt-enriched', { id: record.id, sceneId: record.sceneId })
        return fp
      }
    } else if (record.propId) {
      const [prop] = await db.select().from(schema.props).where(eq(schema.props.id, record.propId))
      if (!prop) return record.prompt || ''
      const fp = await ensurePropFinalPrompt(prop, episodeId, false, { model: params.textModel, configId: params.textConfigId ?? undefined })
      if (fp) {
        await db.update(schema.sysTask).set({ prompt: fp, updatedAt: now() }).where(eq(schema.sysTask.id, record.id))
        logTaskProgress(label, 'prompt-enriched', { id: record.id, propId: record.propId })
        return fp
      }
    }
  } catch (err: any) {
    logTaskWarn(label, 'prompt-enrich-failed', { id: record.id, error: err?.message })
  }
  return record.prompt || ''
}

async function processTask(id: number, config: AIConfig, signal?: AbortSignal) {
  try {
    const [record] = await db.select().from(schema.sysTask).where(eq(schema.sysTask.id, id))
    if (!record) return
    // 取消/启动清扫后的迟到执行入口在此短路：非 processing 状态不执行（NFR-DATA-1 防幽灵完成）
    if (record.status !== 'processing') {
      console.log(`[SysTask] task ${id} skipped: status=${record.status} before queue execution`)
      return
    }
    const cancelC = new AbortController()
    activeCancels.set(id, cancelC)
    appendTaskEvent(id, 'started', { type: record.type, provider: config.provider, model: record.model })
    const type = record.type as TaskType
    const label = taskLabel(type)
    const params = parseTaskParams(record.params)
    // L7: 配置在执行时重解析——createTask 到实际执行间可能隔几十分钟排队，
    // 用户中途改 baseUrl/apiKey/切换启用配置后在途批次应打新端点；失效则沿用建任务时快照
    config = params.configId
      ? (await getConfigById(Number(params.configId))) ?? config
      : (await getActiveConfig(type === 'image' ? 'image' : 'video')) ?? config
    logTaskProgress(label, 'build-request', {
      id,
      provider: config.provider,
      storyboardId: record.storyboardId,
      sceneId: record.sceneId,
      characterId: record.characterId,
    })

    let url: string, method: string, headers: Record<string, string>, body: unknown

    if (type === 'image') {
      const adapter = await getImageAdapter(config.provider)
      const resolvedReferenceImages = await normalizeReferenceImages(params.referenceImages)
      // 队列内富化：资产缺最终提示词时先跑 prompt_generator 补齐（与生图严格串行）
      const enrichedPrompt = await enrichImagePromptIfNeeded(record, params, label)
      // FLUX 等文生图模型不识中文：中文提示词先经文本模型译成英文，否则中文段被忽略导致不同角色出图雷同
      const effectivePrompt = await translatePromptToEnglish(enrichedPrompt, label, id)
      ;({ url, method, headers, body } = adapter.buildGenerateRequest(config, {
        id: record.id,
        model: record.model,
        prompt: effectivePrompt,
        size: params.size,
        frameType: params.frameType,
        referenceImages: resolvedReferenceImages.length ? JSON.stringify(resolvedReferenceImages) : null,
      }))
    } else {
      const adapter = await getVideoAdapter(config.provider)
      const resolvedImageUrl = await normalizeVideoReferenceUrl(params.imageUrl)
      const resolvedFirstFrameUrl = await normalizeVideoReferenceUrl(params.firstFrameUrl)
      const resolvedLastFrameUrl = await normalizeVideoReferenceUrl(params.lastFrameUrl)
      const resolvedReferenceImageUrls = await normalizeVideoReferenceUrls(params.referenceImageUrls)
      // I2V 主体选图（必须在翻译前、用中文原 prompt 解析 @角色名/@图片N）：
      // 未显式指定条件图时按镜头主体挑参考图作首帧，避免适配器在翻译后
      // 盲取末张把配角钉成主体（bug：菩提替悟空占据主角机位）。仅 fusion 单条件 I2V 需要。
      const i2vSubjectUrl = !resolvedImageUrl && !resolvedFirstFrameUrl && config.provider === 'fusion'
        ? await resolveI2vSubjectUrl(
          record.storyboardId,
          record.prompt || '',
          Array.isArray(params.referenceImageUrls) ? params.referenceImageUrls.map(String) : [],
          label,
          id,
        )
        : null
      // 参考视频/音频文件较大，不适合 dataURL 内联，需解析为公网可访问 URL
      const resolvedReferenceVideoUrls = resolvePublicMediaUrls(params.referenceVideoUrls, 'video')
      const resolvedReferenceAudioUrls = resolvePublicMediaUrls(params.referenceAudioUrls, 'audio')
      const resolvedReferenceFileUrl = resolvePublicMediaUrl(params.referenceFileUrl, 'file')
      // fusion LTX-2.5 text encoder (Gemma) 不识中文，中文 prompt 产噪声视频；
      // 云端中国厂商模型（volcengine/minimax/aliyun）识中文不译。仅 fusion 翻译。
      // H3（MiniMax 中文模型）亦不译——翻译会加载文本模型与 H3 竞争内存
      // （128GB 机器 H3 5s 峰值 ~56GB，加文本模型 cache 累积超 120GB ceiling）。
      // Wan2.2 UMT5 文本编码器原生识中文，亦不译。
      const effectiveVideoPrompt = config.provider === 'fusion' && !isMiniMaxH3(record.model || '') && !isWan22Ti2v5b(record.model || '')
        ? await translatePromptToEnglish(record.prompt || '', label, id)
        : record.prompt
      // 翻译把文本模型（Qwen3.5）载入常驻，与 LTX-2.5 准入竞争内存
      // → memory guard 取消视频任务（503）。翻译完立即卸载文本模型。
      if (config.provider === 'fusion') await unloadFusionTextModel()
      ;({ url, method, headers, body } = adapter.buildGenerateRequest(config, {
        id: record.id,
        model: record.model,
        prompt: effectiveVideoPrompt,
        referenceMode: params.referenceMode,
        imageUrl: resolvedImageUrl,
        // 主体选图优先于适配器兜底（盲取末张）；显式 firstFrame 仍最高优先
        firstFrameUrl: resolvedFirstFrameUrl || i2vSubjectUrl,
        lastFrameUrl: resolvedLastFrameUrl,
        referenceImageUrls: resolvedReferenceImageUrls.length ? JSON.stringify(resolvedReferenceImageUrls) : null,
        referenceVideoUrls: resolvedReferenceVideoUrls.length ? JSON.stringify(resolvedReferenceVideoUrls) : null,
        referenceAudioUrls: resolvedReferenceAudioUrls.length ? JSON.stringify(resolvedReferenceAudioUrls) : null,
        referenceFileUrl: resolvedReferenceFileUrl,
        referenceLinkUrl: params.referenceLinkUrl,
        generateAudio: params.generateAudio,
        duration: params.duration,
        aspectRatio: params.aspectRatio,
        resolution: params.resolution,
        seed: params.seed,
        promptExtend: params.promptExtend,
        watermark: params.watermark,
        videoPipeline: params.videoPipeline,
      }))
    }

    logTaskProgress(label, 'request', {
      id,
      provider: config.provider,
      method,
      url: redactUrl(url),
      model: record.model,
    })

    const isMultipart = body instanceof FormData
    logTaskPayload(label, 'request payload', {
      id, method, url, headers,
      // multipart 表单（如 OpenAI /v1/images/edits）无法 JSON 化，记录字段摘要
      body: isMultipart ? `[multipart/form-data: ${[...(body as FormData).keys()].join(', ')}]` : body,
    })

    const resp = await fetch(url, {
      method,
      headers,
      body: isMultipart ? (body as FormData) : JSON.stringify(body),
      // 同步接口超时：视频高分辨率长时长（10s@1088x1920，241帧两阶段）实测超 30min，
      // 统一放宽到 60min（图片任务远短于此，不受影响）；与队列 watchdog abort 联动
      signal: AbortSignal.any([AbortSignal.timeout(3_600_000), signal, cancelC.signal].filter((x): x is AbortSignal => Boolean(x))),
      // 本地模型生成耗时长，解除 undici 默认 300s headers 超时
      dispatcher: laxDispatcher,
    } as any)

    if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`)
    const result = await resp.json() as any
    logTaskPayload(label, 'response payload', { id, provider: config.provider, result })

    if (type === 'image') {
      const adapter = await getImageAdapter(config.provider)
      const { isAsync, taskId, imageUrl } = adapter.parseGenerateResponse(result)

      if (!isAsync && imageUrl) {
        logTaskProgress(label, 'sync-complete', { id, imageUrl })
        await handleImageComplete(record, imageUrl)
        await unloadFusionImageModel(config, record.model)
        return
      }

      if (!isAsync && !imageUrl) {
        // 同步模式但无 URL（Gemini 等返回 base64）
        const b64 = adapter.extractImageBase64(result)
        if (b64) {
          logTaskProgress(label, 'sync-base64-complete', { id, mimeType: b64.mimeType })
          await handleImageCompleteBase64(record, b64.data, b64.mimeType)
          await unloadFusionImageModel(config, record.model)
          return
        }
        throw new Error('No image URL or base64 data in response')
      }

      await markPolling(id, taskId)
      // pollTask 为 fire-and-forget：不加 .catch 会让未处理 rejection 在 node 上进程崩溃
      pollTask(record, config, taskId!).catch(err => logTaskError(taskLabel(type), 'poll-crash', { id, taskId, error: err?.message || String(err) }))
      return
    }

    const adapter = await getVideoAdapter(config.provider)
    const { isAsync, taskId, videoUrl } = adapter.parseGenerateResponse(result)

    if (!isAsync && videoUrl) {
      logTaskProgress(label, 'sync-complete', { id, videoUrl })
      await handleVideoComplete(record, videoUrl, params.duration)
      return
    }

    await markPolling(id, taskId)
    // fire-and-forget 必须 .catch，否则未处理 rejection 在 node 上进程崩溃
    pollTask(record, config, taskId!, cancelC.signal).catch(err => logTaskError(label, 'poll-crash', { id, taskId, error: err?.message || String(err) }))
  } catch (err: any) {
    await failTask(id, err.message)
  } finally {
    // 轮询路径（fire-and-forget）由 pollTask 终态路径清理注册表；同步完成路径在此清理。
    // 轮询已启动时这里是幂等空操作（pollTask 终态也会删，Map.delete 无害）
    activeCancels.delete(id)
  }
}

async function markPolling(id: number, taskId: string | undefined) {
  await db.update(schema.sysTask)
    .set({ taskId, status: 'processing', updatedAt: now() })
    .where(eq(schema.sysTask.id, id))
  logTaskProgress('SysTask', 'poll-start', { id, taskId })
}

async function failTask(id: number, message: string) {
  logTaskError('SysTask', 'failed', { id, error: message })
  appendTaskEvent(id, 'failed', { error: message.slice(0, 500) })
  // 乐观条件：仅 processing 可落 failed——取消/清扫后迟到的失败不覆盖终态（NFR-DATA-1）
  await db.update(schema.sysTask)
    .set({ status: 'failed', errorMsg: message, updatedAt: now() })
    .where(and(eq(schema.sysTask.id, id), eq(schema.sysTask.status, 'processing')))
  activeCancels.delete(id)
}

type SysTaskRecord = typeof schema.sysTask.$inferSelect

async function pollTask(record: SysTaskRecord, config: AIConfig, taskId: string, signal?: AbortSignal) {
  const type = record.type as TaskType
  const label = taskLabel(type)
  const profile = POLL_PROFILES[type]
  const adapter = type === 'image' ? await getImageAdapter(config.provider) : await getVideoAdapter(config.provider)
  const startedAt = Date.now()

  for (let i = 0; i < profile.attempts; i++) {
    if (signal?.aborted) {
      await cancelTask(record.id, '用户取消')
      return
    }
    if (profile.maxDurationMs && Date.now() - startedAt >= profile.maxDurationMs) {
      await failTask(record.id, `Timeout: polling exceeded ${Math.round(profile.maxDurationMs / 60000)} minutes`)
      return
    }
    await new Promise(r => setTimeout(r, profile.intervalMs))
    try {
      // B8: 任务行可能已被用户删除（DELETE /tasks/:id）或重启清理标 failed——
      // 行已消失则停止孤儿轮询，避免结果写回无主任务
      const [fresh] = await db.select({ id: schema.sysTask.id, status: schema.sysTask.status }).from(schema.sysTask).where(eq(schema.sysTask.id, record.id))
      if (!fresh) {
        activeCancels.delete(record.id)
        return
      }
      // 取消/清扫后停止孤儿轮询：结果不再写回无主任务
      if (fresh.status !== 'processing') {
        activeCancels.delete(record.id)
        return
      }
      const { url, method, headers } = adapter.buildPollRequest(config, taskId)
      logTaskProgress(label, 'poll-request', {
        id: record.id,
        taskId,
        provider: config.provider,
        method,
        url: redactUrl(url),
        attempt: i + 1,
      })
      const remainingMs = profile.maxDurationMs
        ? Math.max(1_000, profile.maxDurationMs - (Date.now() - startedAt))
        : 600_000
      const resp = await fetch(url, {
        method,
        headers,
        signal: AbortSignal.any([AbortSignal.timeout(remainingMs), signal].filter((x): x is AbortSignal => Boolean(x))),
        dispatcher: laxDispatcher,
      } as any)
      if (!resp.ok) {
        // 4xx（除 408/429）= 上游终态拒绝（鉴权失败/参数非法/内容审核），重试无意义，
        // 立即落库失败并携带响应体摘要；5xx/408/429 保持重试
        if (resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429) {
          const body = await resp.text().catch(() => '')
          await failTask(record.id, `Generation rejected (HTTP ${resp.status}): ${body.slice(0, 200)}`)
          return
        }
        continue
      }
      const result = await resp.json() as any

      // 图片/视频 PollResponse 结构不同，这里统一按 any 取值后按 type 分支
      const pollResp: any = adapter.parsePollResponse(result)

      if (pollResp.status === 'completed') {
        if (type === 'image') {
          if (pollResp.imageUrl) {
            logTaskSuccess(label, 'poll-complete', { id: record.id, taskId, imageUrl: pollResp.imageUrl })
            // A2: 落盘/缩略图/写回在 GPU 队列内串行执行（锁外的并发转码/写库正是
            // gpu-queue 要避免的资源争用，只是换了资源类型）
            await enqueueGpuWork(`image-complete-${record.id}`, () => handleImageComplete(record, pollResp.imageUrl))
            await unloadFusionImageModel(config, record.model)
            return
          }
          if (adapter.provider === 'gemini') {
            // Gemini 可能返回 base64
            const b64 = (adapter as ImageProviderAdapter).extractImageBase64(result)
            if (b64) {
              logTaskSuccess(label, 'poll-base64-complete', { id: record.id, taskId, mimeType: b64.mimeType })
              await enqueueGpuWork(`image-complete-${record.id}`, () => handleImageCompleteBase64(record, b64.data, b64.mimeType))
              await unloadFusionImageModel(config, record.model)
              return
            }
          }
        } else if (pollResp.videoUrl) {
          // fusion-mlx #1254 交接：completed 作业的产物不在 status 响应里，
          // 'job-output' 占位符 → 解析带鉴权的 /jobs/{id}/output/0 产物 URL。
          // 该 URL 是临时文件（1800s TTL）且需 Bearer 鉴权，落库走 localPath。
          let videoUrl = pollResp.videoUrl
          let authHeaders: Record<string, string> | undefined
          if (videoUrl === 'job-output') {
            const outReq = (adapter as VideoProviderAdapter).buildJobOutputRequest?.(config, taskId, 0)
            if (!outReq) {
              await failTask(record.id, 'Job completed but adapter cannot build output request')
              return
            }
            videoUrl = outReq.url
            authHeaders = outReq.headers
          }
          logTaskSuccess(label, 'poll-complete', { id: record.id, taskId, videoUrl })
          // A2: 下载/海报帧/TTS 配音/ffmpeg 混流同样入 GPU 串行队列
          await enqueueGpuWork(`video-complete-${record.id}`, () => handleVideoComplete(record, videoUrl, pollResp.duration, authHeaders))
          return
        }
        // 上游报告完成但没有产物 URL：终态失败，不让轮询空转到超时
        if (pollResp.status === 'completed') {
          await unloadFusionImageModel(config, record.model)
          await failTask(record.id, 'Generation completed but no output URL in poll response')
          return
        }
      }
      if (pollResp.status === 'failed') {
        // 上游明确失败（如内容审核拦截）属终态：立即落库，不重试不等待超时。
        // 失败时模型已加载，仍须卸载避免驻留挤占后续提取 Agent
        await unloadFusionImageModel(config, record.model)
        await failTask(record.id, pollResp.error || 'Generation failed')
        return
      }
    } catch (err: any) {
      const exhausted = i === profile.attempts - 1
        || (profile.maxDurationMs != null && Date.now() - startedAt >= profile.maxDurationMs)
      if (exhausted) {
        await failTask(record.id, `Timeout: ${err.message}`)
        return
      }
      logTaskWarn(label, 'poll-retry', { id: record.id, taskId, attempt: i + 1, error: err.message })
    }
  }
  // 兜底落库自身也可能抛（DB 忙/锁），不让异常逃出 fire-and-forget 调用
  try {
    await failTask(record.id, 'Timeout: polling attempts exhausted')
  } catch (err: any) {
    logTaskError(taskLabel(type), 'failTask-error', { id: record.id, error: err?.message || String(err) })
  }
}

async function handleImageComplete(record: SysTaskRecord, imageUrl: string) {
  // L6: 先落 resultUrl——上游签名 URL 短期有效，下载失败时 URL 已在库中可查/可重取，
  // 否则整个 GPU 生成白跑且无法恢复
  await db.update(schema.sysTask)
    .set({ resultUrl: imageUrl, updatedAt: now() })
    .where(eq(schema.sysTask.id, record.id))
  const localPath = await downloadFile(imageUrl, 'images')
  // 列表页缩略图（前端按命名约定推导地址）——失败只降级，不判死主图
  try {
    await generateImageThumb(localPath)
  } catch (err: any) {
    logTaskWarn('ImageTask', 'thumb-failed', { id: record.id, error: err?.message })
  }

  appendTaskEvent(record.id, 'completed', { localPath })
  // data URI（fusion 同步返回）已落盘为 localPath，不可原样存入 result_url——
  // 列表接口 JSON.stringify 多 MB base64 会撑爆响应（与视频路径同口径）
  const resultUrl = imageUrl.startsWith('data:') ? localPath : imageUrl
  await db.update(schema.sysTask)
    .set({ resultUrl, localPath, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(and(eq(schema.sysTask.id, record.id), eq(schema.sysTask.status, 'processing')))

  logTaskSuccess('ImageTask', 'downloaded', { id: record.id, provider: record.provider, localPath })

  await writeBackImageAssets(record, localPath)
}

async function handleImageCompleteBase64(record: SysTaskRecord, base64Data: string, mimeType: string) {
  const localPath = await saveBase64Image(base64Data, mimeType, 'images')
  try {
    await generateImageThumb(localPath)
  } catch (err: any) {
    logTaskWarn('ImageTask', 'thumb-failed', { id: record.id, error: err?.message })
  }

  appendTaskEvent(record.id, 'completed', { localPath })
  await db.update(schema.sysTask)
    .set({ localPath, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(and(eq(schema.sysTask.id, record.id), eq(schema.sysTask.status, 'processing')))

  logTaskSuccess('ImageTask', 'saved-base64', { id: record.id, provider: record.provider, mimeType, localPath })

  await writeBackImageAssets(record, localPath)
}

// 图片完成后回写业务表：分镜(按 frameType)、角色、场景、道具
/** B25: 写回守卫——目标行在任务创建后又被更新过（如用户手动改图/重传），跳过覆盖防丢失 */
async function isStaleTarget(table: any, id: number, taskCreatedAt: string | null): Promise<boolean> {
  if (!id || !taskCreatedAt) return false
  const [row] = await db.select({ updatedAt: table.updatedAt }).from(table).where(eq(table.id, id))
  return Boolean(row?.updatedAt && row.updatedAt > taskCreatedAt)
}

async function writeBackImageAssets(record: SysTaskRecord, localPath: string) {
  const params = parseTaskParams(record.params)
  if (record.storyboardId && !(await isStaleTarget(schema.storyboards, record.storyboardId, record.createdAt))) {
    const sbUpdate: Record<string, any> = { updatedAt: now() }
    if (params.frameType === 'first_frame') sbUpdate.firstFrameImage = localPath
    else if (params.frameType === 'last_frame') sbUpdate.lastFrameImage = localPath
    else sbUpdate.composedImage = localPath
    await db.update(schema.storyboards).set(sbUpdate).where(eq(schema.storyboards.id, record.storyboardId))
  }
  if (record.characterId && !(await isStaleTarget(schema.characters, record.characterId, record.createdAt))) {
    await db.update(schema.characters).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.characters.id, record.characterId))
  }
  if (record.sceneId && !(await isStaleTarget(schema.scenes, record.sceneId, record.createdAt))) {
    await db.update(schema.scenes).set({ imageUrl: localPath, status: 'completed', updatedAt: now() }).where(eq(schema.scenes.id, record.sceneId))
  }
  if (record.propId && !(await isStaleTarget(schema.props, record.propId, record.createdAt))) {
    await db.update(schema.props).set({ imageUrl: localPath, updatedAt: now() }).where(eq(schema.props.id, record.propId))
  }
}

async function handleVideoComplete(record: SysTaskRecord, videoUrl: string, duration: number | null | undefined, authHeaders?: Record<string, string>) {
  // L6: data URI 外的远端 URL 先落库（签名 URL 短期有效，下载失败可查可重取）。
  // #1254 交接的产物 URL 是临时文件且带鉴权，不存在「重取」——落库占位无妨，
  // 真相源以 localPath 为准。
  if (!videoUrl.startsWith('data:')) {
    await db.update(schema.sysTask)
      .set({ resultUrl: videoUrl, updatedAt: now() })
      .where(eq(schema.sysTask.id, record.id))
  }
  const localPath = await downloadFile(videoUrl, 'videos', authHeaders)
  // 海报帧供列表/封面展示，避免前端为显示首帧缓冲整个视频——失败只降级
  try {
    await extractVideoPoster(localPath)
  } catch (err: any) {
    logTaskWarn('VideoTask', 'poster-failed', { id: record.id, error: err?.message })
  }
  // issue: LTX-2.5 联合 A/V 仅产出环境底噪，对白缺失——
  // 分镜提示词含对白时用 TTS 合成配音并混入音轨（失败不阻断主流程）。
  // 注意：对白必须取中文原 prompt（record.prompt），翻译后的英文无法用于中文 TTS；
  // params.prompt 不存在（prompt 存任务记录列），此前从这里读导致配音从未触发。
  try {
    const { dubVideoDialogue } = await import('../utils/video-dub.js')
    // storyboardId 用于查分镜绑定角色名：LLM 常把动作描述夹在 @角色名 与「说」之间
    // （@孙悟空跪在...说：「」），无已知角色名则同角色多句台词因动作描述不同映射
    // 到不同 speaker → 不同音色，破坏同角色音色一致性。传角色名精确匹配。
    await dubVideoDialogue(localPath, record.prompt, record.id, record.storyboardId ?? undefined)
  } catch { /* 配音失败保持原音轨 */ }
  // data URI（fusion 同步返回）已落盘为 localPath，不可原样存入 result_url——
  // 否则 37MB base64 污染 DB 与 API 响应。远端 URL 原样保留（前端 http 判定直连）。
  const resultUrl = videoUrl.startsWith('data:') ? localPath : videoUrl
  appendTaskEvent(record.id, 'completed', { localPath })
  await db.update(schema.sysTask)
    .set({ resultUrl, localPath, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(and(eq(schema.sysTask.id, record.id), eq(schema.sysTask.status, 'processing')))

  logTaskSuccess('VideoTask', 'downloaded', { id: record.id, localPath, storyboardId: record.storyboardId, duration })

  if (record.storyboardId) {
    await db.update(schema.storyboards)
      .set({ videoUrl: localPath, duration: duration || undefined, updatedAt: now() })
      .where(eq(schema.storyboards.id, record.storyboardId))
  }
}

// ─── 参考素材归一化 ───────────────────────────────────────────────

async function normalizeReferenceImages(refs: string[] | null | undefined): Promise<string[]> {
  if (!Array.isArray(refs) || !refs.length) return []

  const deduped = Array.from(
    new Set(
      refs
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  )

  const normalized = await Promise.all(deduped.map(async (value) => {
    if (value.startsWith('data:image/')) return value
    if (value.startsWith('static/') || value.startsWith('/static/')) {
      const localPath = value.startsWith('/static/') ? value.slice(1) : value
      try {
        return await readImageAsCompressedDataUrl(localPath, {
          maxWidth: 768,
          maxHeight: 768,
          quality: 68,
        })
      } catch (err) {
        logTaskWarn('ImageTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
        return null
      }
    }
    // 远程 URL：下载压缩为 data URL，保证 multipart 上传（OpenAI edits）/ inline_data（Gemini）都可用
    if (/^https?:\/\//.test(value)) {
      try {
        return await fetchImageAsCompressedDataUrl(value, {
          maxWidth: 768,
          maxHeight: 768,
          quality: 68,
        })
      } catch (err) {
        logTaskWarn('ImageTask', 'reference-fetch-failed', { url: value, error: (err as Error).message })
        return null
      }
    }
    return value
  }))

  return normalized.filter((item): item is string => !!item).slice(0, 6)
}

async function normalizeVideoReferenceUrl(value: string | null | undefined): Promise<string | null> {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.startsWith('data:image/')) return raw
  if (raw.startsWith('static/') || raw.startsWith('/static/')) {
    const localPath = raw.startsWith('/static/') ? raw.slice(1) : raw
    try {
      return await readImageAsCompressedDataUrl(localPath, {
        maxWidth: 768,
        maxHeight: 768,
        quality: 68,
      })
    } catch (err) {
      logTaskWarn('VideoTask', 'reference-read-failed', { path: localPath, error: (err as Error).message })
      return null
    }
  }
  return raw
}

async function normalizeVideoReferenceUrls(refs: string[] | null | undefined): Promise<string[]> {
  if (!Array.isArray(refs) || !refs.length) return []
  const normalized = await Promise.all(
    Array.from(new Set(refs.map((item) => String(item || '').trim()).filter(Boolean))).map((item) => normalizeVideoReferenceUrl(item)),
  )
  return normalized.filter((item): item is string => !!item)
}

/**
 * I2V 主体选图：从分镜 video_prompt 的引用标记中解析镜头主体，返回其参考图。
 * 必须在 prompt 翻译前调用——翻译后引用标记会失真（@图片1 → @Image 1、@角色名被改写），
 * 适配器侧只能盲取 referenceImageUrls 末张，多角色镜头会把主体钉在配角图上
 * → 人物身份反转（实测菩提代替悟空出现在主角机位）。
 * 支持两种标记（分镜提示词实际混用）：
 *   @图片N  — referenceImageUrls 的 1-based 下标（前端 getShotReferenceIndexMap 生成）
 *   @角色名 — 分镜绑定角色名（Agent 生成路径），如 @孙悟空 / @须菩提祖师
 * 多主体时取提及次数最多者；并列时优先主角（role 含「主角」），再按首次出现位置。
 * 返回压缩 data URL；无引用/角色无图返回 null（调用方回退适配器兜底逻辑）。
 */
async function resolveI2vSubjectUrl(
  storyboardId: number | null | undefined,
  prompt: string,
  rawReferenceUrls: string[],
  label: string,
  id: number,
): Promise<string | null> {
  if (!prompt) return null

  // 1) @图片N 显式编号引用
  const idxCounts = new Map<number, number>()
  for (const m of prompt.matchAll(/@图片(\d+)/g)) {
    const n = Number(m[1])
    if (n >= 1 && n <= rawReferenceUrls.length) idxCounts.set(n, (idxCounts.get(n) ?? 0) + 1)
  }
  if (idxCounts.size) {
    let best = 0
    let bestCount = -1
    for (const [n, c] of idxCounts) {
      if (c > bestCount || (c === bestCount && n > best)) { best = n; bestCount = c }
    }
    const url = rawReferenceUrls[best - 1]
    if (url) {
      logTaskProgress(label, 'i2v-subject-image', { id, index: best, mentions: bestCount })
      return normalizeVideoReferenceUrl(url)
    }
  }

  // 2) @角色名 引用（本分镜绑定的角色，按提及次数→主角优先→首次出现位置排序）
  if (!storyboardId) return null
  const rows = await db
    .select({ id: schema.characters.id, name: schema.characters.name, role: schema.characters.role, imageUrl: schema.characters.imageUrl, deletedAt: schema.characters.deletedAt })
    .from(schema.storyboardCharacters)
    .innerJoin(schema.characters, eq(schema.characters.id, schema.storyboardCharacters.characterId))
    .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
  const candidates = rows
    .filter((ch) => ch.name && ch.imageUrl && !ch.deletedAt)
    .map((ch) => {
      const firstPos = prompt.indexOf(`@${ch.name}`)
      const mentions = firstPos < 0 ? 0 : prompt.split(`@${ch.name}`).length - 1
      return { name: ch.name!, imageUrl: ch.imageUrl!, mentions, isProtagonist: (ch.role || '').includes('主角') ? 1 : 0, firstPos }
    })
    .filter((ch) => ch.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions || b.isProtagonist - a.isProtagonist || a.firstPos - b.firstPos)
  const winner = candidates[0]
  if (!winner) {
    // 老数据兼容：无 @图片N / @角色名 引用时回退参考列表末张（场景图在前、角色图在后约定）
    for (let i = rawReferenceUrls.length - 1; i >= 0; i--) {
      const u = String(rawReferenceUrls[i] || '').trim()
      if (u) {
        logTaskProgress(label, 'i2v-subject-fallback-last', { id })
        return normalizeVideoReferenceUrl(u)
      }
    }
    return null
  }
  logTaskProgress(label, 'i2v-subject-character', {
    id,
    character: winner.name,
    mentions: winner.mentions,
    ranking: candidates.map((c) => `${c.name}:${c.mentions}`).join(','),
  })
  return normalizeVideoReferenceUrl(winner.imageUrl)
}

/**
 * 将参考视频/音频解析为 Seedance API 可访问的 URL。
 * http(s)/dataURL 直通；本地 static 路径需要 PUBLIC_BASE_URL 拼成公网地址，
 * 未配置时抛出可操作的中文错误（落入 catch 写入 error_msg 供前端展示）。
 */
function resolvePublicMediaUrl(value: string | null | undefined, kind: 'video' | 'audio' | 'file'): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw
  if (raw.startsWith('static/') || raw.startsWith('/static/')) {
    const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
    if (!base) {
      const label = kind === 'video' ? '视频' : kind === 'audio' ? '音频' : '文件'
      throw new Error(
        `参考${label}为本地路径 ${raw}，但后端未配置 PUBLIC_BASE_URL，上游视频生成 API 无法访问内网地址。` +
        `请在 backend/.env 配置 PUBLIC_BASE_URL（如 https://your-domain.com）后重试，或改用公网 URL。`,
      )
    }
    const p = raw.startsWith('/') ? raw : `/${raw}`
    return `${base}${p}`
  }
  return raw
}

function resolvePublicMediaUrls(refs: string[] | null | undefined, kind: 'video' | 'audio'): string[] {
  if (!Array.isArray(refs) || !refs.length) return []
  const items = Array.from(new Set(refs.map((item) => String(item || '').trim()).filter(Boolean)))
  return items.map((item) => resolvePublicMediaUrl(item, kind)).filter((item): item is string => !!item)
}

function normalizeStoredVideoResolution(resolution: string | null | undefined): string | undefined {
  const value = String(resolution || '').trim().toLowerCase()
  if (value === '480p' || value === '720p' || value === '1080p') return value
  if (value === '2k') return '2K'
  return undefined
}
