/**
 * Unified generation task service — image/video generation share the sys_task table and one lifecycle:
 * create(processing) → adapter builds the request → sync completion or async polling → download to disk → write back to business tables
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
// P2: module-level singleton zero-timeout dispatcher — each fetch with a new Agent builds its own connection pool and never closes
const laxDispatcher = new UndiciAgent({ headersTimeout: 0, bodyTimeout: 0 })
import { ensureCharacterFinalPrompt, ensureSceneFinalPrompt, ensurePropFinalPrompt } from './final-prompt.js'
import type { AIConfig, ImageProviderAdapter, VideoProviderAdapter } from './adapters/types'
import { getModel } from '../agents/index.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn, redactUrl } from '../utils/task-logger.js'
import { Agent as UndiciAgent } from 'undici'

type TaskType = 'image' | 'video'

const taskLabel = (type: TaskType) => (type === 'image' ? 'ImageTask' : 'VideoTask')

// Polling cadence: image 5s×120 (max 10 min); video 10s×300 (max 60 min wall-clock)
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
  /** In-queue enrichment: when an asset lacks a final prompt, run prompt_generator inside the GPU serial queue to fill it in before image generation */
  enrichEpisodeId?: number
  textModel?: string
  textConfigId?: number
  /** v5 PRD §10.2: retry provenance — points to the original task id when resending a failed task */
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
  /** Quality tier (fusion LTX-2.5 only): 'dev' = high-quality single stage (slow), default distilled = fast */
  videoPipeline?: string
  configId?: number
  /** v5 PRD §10.2: retry provenance — points to the original task id when resending a failed task */
  retryOf?: number
}

export async function generateImage(params: GenerateImageParams): Promise<number> {
  // The pinned config (episode lock) may have been disabled/deleted/vendor-merged; fall back to the currently enabled config when invalid so generation is not stuck on a stale reference
  const config = params.configId
    ? (await getConfigById(params.configId)) ?? await getActiveConfig('image')
    : await getActiveConfig('image')
  if (!config) throw new Error('未配置图片模型，请先到「设置」页添加并启用 AI 服务') // i18n: user-facing

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
  // The pinned config (episode lock) may have been disabled/deleted/vendor-merged; fall back to the currently enabled config when invalid
  const config = params.configId
    ? (await getConfigById(params.configId)) ?? await getActiveConfig('video')
    : await getActiveConfig('video')
  if (!config) throw new Error('未配置视频模型，请先到「设置」页添加并启用 AI 服务') // i18n: user-facing

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
    // Stored in the project-internal format; each adapter converts to the official casing and enums.
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
    /** v5 PRD §10.2: retry provenance — points to the original task id when resending a failed task */
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

// ===== Global serial execution queue =====
// Background: local models (fusion-mlx) cannot process multiple generation requests in parallel (VRAM contention / queue timeouts),
// and batch generation (characters/scenes/props/storyboards) submitted concurrently drags everything down.
// All generation tasks (image/video) are queued and executed strictly one by one in submission order.
// Cloud providers benefit too: avoids concurrency rate limits. Shares gpu-queue with asset extraction
// (FLUX + Qwen3.5 concurrently → GPU contention crashes the Metal command buffer → fusion-mlx SIGTERM hang).
function enqueueTask(id: number, type: TaskType, config: AIConfig): void {
  enqueueGpuWork(`${taskLabel(type)}-${id}`, (signal) => processTask(id, config, signal), {
    // NFR-REL-4: queue feedback — when position > 1 the frontend shows "queued at position N" (visible via SSE/polling)
    onQueued: (position) => {
      if (position > 1) appendTaskEvent(id, 'queued', { position })
    },
  })
    .catch(err => {
      // R1: enqueue failure (queue full/watchdog) must also land a terminal state; the task row must not stay in processing
      logTaskError(taskLabel(type), 'process', { id, error: err.message })
      failTask(id, `任务执行中断: ${err.message}`).catch(e => logTaskError(taskLabel(type), 'failTask-error', { id, error: e?.message })) // i18n: user-facing
    })
}

// ===== FR-P0-5a task cancellation (PRD 4.7: cancellation takes effect only at step boundaries, never hard-kills the local engine process) =====
// Registry taskId -> controller; after abort, the fetch interruption / next polling hop exits and lands the terminal state.
// Registry is cleaned up on terminal-state write-back (failTask/cancelTask/completed write-back/orphan polling exit)
const activeCancels = new Map<number, AbortController>()

/** Requests cancellation of an in-flight task; returns whether an in-flight execution was found (otherwise the caller does the optimistic persistence) */
export function requestTaskCancel(id: number): boolean {
    const ac = activeCancels.get(id)
    if (!ac) return false
    ac.abort()
    return true
}

/** Cancel terminal state: optimistic condition (only processing may land cancelled), prevents overwriting a completed write-back (NFR-DATA-1) */
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

/** Detects whether text contains Chinese/Japanese kana (FLUX and other text-to-image models do not understand Chinese; Chinese segments get ignored, causing near-identical outputs) */
function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff\u3040-\u30ff]/.test(text)
}

/** The fusion-mlx image model (FLUX.1-dev) has no ttl_seconds so it is never evicted automatically;
 *  after image generation it stays resident at ~34GB GPU memory and competes with the subsequent
 *  asset-extraction Qwen3.5 decode \u2192 Metal command buffer crash \u2192 fusion-mlx SIGTERM. Unload
 *  explicitly after image completion. Only applies to openai image configs whose baseUrl points
 *  at fusion-mlx/gateway (:11434/:11432). */
async function unloadFusionImageModel(config: AIConfig, model: string | null): Promise<void> {
  try {
    const baseUrl = config.baseUrl || ''
    if (!/127\.0\.0\.1:11434|localhost:11434|127\.0\.0\.1:11432|localhost:11432/.test(baseUrl)) return
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

/** The fusion-mlx text model (Qwen3.5) stays resident after video prompt translation and competes for memory
 *  with the subsequently admitted LTX-2.5 (~60GB) → the memory guard cancels the video task (503).
 *  After video translation completes, explicitly unload the text model to free memory for video generation.
 *  Only applies to text configs whose baseUrl points at fusion-mlx/gateway (:11434/:11432). */
async function unloadFusionTextModel(): Promise<void> {
  try {
    const config = await getActiveConfig('text')
    if (!config) return
    const baseUrl = config.baseUrl || ''
    if (!/127\.0\.0\.1:11434|localhost:11434|127\.0\.0\.1:11432|localhost:11432/.test(baseUrl)) return
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
 * Translates Chinese-containing prompts to English before image generation (via the current text model, one direct call).
 * On failure returns the original text and logs a warning — translation is only an enhancement, it never blocks generation.
 *
 * Checklist 1107 #2 (prompt-optimizer adoption): verbatim-preservation contract — quoted dialogue/text,
 * character names and other anchors must appear verbatim in the translation; after translation each anchor is verified,
 * missing ones warn and re-attach the original anchor text, eliminating silent degradation such as
 * "paraphrased dialogue breaking TTS dubbing alignment or invalidating @name anchors".
 */

/** Extracts anchors that must be preserved verbatim: text inside Chinese quotes 「」/『』 and English quotes */
function extractVerbatimAnchors(prompt: string): string[] {
    const anchors: string[] = []
    // i18n: user-facing
    for (const re of [/[「『]([^「」『』]+)[」』]/g, /"([^"\n]{1,120})"/g]) {
        let m: RegExpExecArray | null
        while ((m = re.exec(prompt)) !== null) {
            const v = m[1].trim()
            if (v) anchors.push(v)
        }
    }
    return [...new Set(anchors)]
}

/** Re-attaches lost anchors to the translation: appends missing quoted fragments verbatim at the end (explicitly labeled) */
function reattachLostAnchors(translated: string, anchors: string[]): { text: string, lost: string[] } {
    const lost = anchors.filter(a => !translated.includes(a))
    if (!lost.length) return { text: translated, lost }
    const restored = lost.map(a => `"${a}"`).join(', ')
    return { text: `${translated}, verbatim text: ${restored}`, lost }
}

async function translatePromptToEnglish(prompt: string, taskLabel_: string, id: number): Promise<string> {
  if (!prompt || !containsChinese(prompt)) return prompt
  const anchors = extractVerbatimAnchors(prompt)
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
          { role: 'system', content: 'You are a translation engine for image-generation prompts. Translate the user text to English. Keep the visual details, style words, and structure verbatim in meaning. VERBATIM CONTRACT: any text inside quotes, character names, and on-image caption text must appear in the output EXACTLY as written in the source (copy the characters verbatim, do not translate or paraphrase them). Output ONLY the translated prompt text, no explanations, no quotes.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 4096,
      }),
      dispatcher,
    } as any)
    if (!resp.ok) throw new Error(`translate API ${resp.status}`)
    const result = await resp.json() as any
    let translated = result?.choices?.[0]?.message?.content?.trim()
    if (!translated) return prompt
    if (anchors.length) {
      const { text, lost } = reattachLostAnchors(translated, anchors)
      translated = text
      if (lost.length) {
        // loud, not silent: degraded anchors are visible in task events and logs
        logTaskWarn(taskLabel_, 'prompt-verbatim-lost', { id, lost })
        appendTaskEvent(id, 'warning', { message: `translation dropped verbatim anchors, re-attached: ${lost.join(' | ')}` })
      }
    }
    logTaskProgress(taskLabel_, 'prompt-translated', { id, originalLength: prompt.length, translatedLength: translated.length })
    return translated
  } catch (err: any) {
    logTaskWarn(taskLabel_, 'prompt-translate-failed', { id, error: err?.message })
    appendTaskEvent(id, 'warning', { message: `prompt translation failed, using original Chinese text (FLUX may degrade): ${err?.message}` })
    return prompt
  }
}

/** In-queue enrichment: tasks created via routing with template prompts get their final prompt filled in here before execution.
 *  Must run inside the GPU serial queue — out-of-queue concurrent enrichment (LLM Agent) plus FLUX image generation
 *  previously poisoned G2 and froze the fusion-mlx service (proven twice on 2026-10-13 08:24/08:47). */
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
    // Late execution entries after cancel/startup sweep short-circuit here: non-processing states do not execute (NFR-DATA-1 anti-ghost-completion)
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
    // L7: config is re-resolved at execution time — dozens of minutes may pass between createTask and actual execution;
    // if the user changes baseUrl/apiKey or switches the enabled config mid-queue, in-flight batches should hit the new endpoint; fall back to the creation-time snapshot if invalid
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
      // In-queue enrichment: when an asset lacks a final prompt, run prompt_generator first (strictly serial with image generation)
      const enrichedPrompt = await enrichImagePromptIfNeeded(record, params, label)
      // FLUX and other text-to-image models do not understand Chinese: Chinese prompts are first translated to English by the text model, otherwise Chinese segments get ignored and different characters render alike
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
      // I2V subject image selection (must run before translation, parsing @characterName/@imageN from the original Chinese prompt):
      // when no conditional image is specified, pick the reference image matching the shot's subject as first frame, avoiding the adapter
      // blindly taking the last image after translation and pinning a supporting character as the subject (bug: Puti displaced Wukong from the protagonist slot). Only fusion single-condition I2V needs this.
      const i2vSubjectUrl = !resolvedImageUrl && !resolvedFirstFrameUrl && config.provider === 'fusion'
        ? await resolveI2vSubjectUrl(
          record.storyboardId,
          record.prompt || '',
          Array.isArray(params.referenceImageUrls) ? params.referenceImageUrls.map(String) : [],
          label,
          id,
        )
        : null
      // Reference video/audio files are too large for dataURL inlining; resolve them into publicly accessible URLs
      const resolvedReferenceVideoUrls = resolvePublicMediaUrls(params.referenceVideoUrls, 'video')
      const resolvedReferenceAudioUrls = resolvePublicMediaUrls(params.referenceAudioUrls, 'audio')
      const resolvedReferenceFileUrl = resolvePublicMediaUrl(params.referenceFileUrl, 'file')
      // fusion LTX-2.5 text encoder (Gemma) does not understand Chinese; Chinese prompts produce noise video;
      // cloud Chinese-vendor models (volcengine/minimax/aliyun) understand Chinese and skip translation. Only fusion translates.
      // H3 (MiniMax Chinese model) also skips translation — translating would load the text model and compete with H3 for memory
      // (on a 128GB machine H3 5s peaks at ~56GB; adding text model cache accumulation exceeds the 120GB ceiling).
      // Wan2.2 UMT5 text encoder natively understands Chinese, also skips translation.
      const effectiveVideoPrompt = config.provider === 'fusion' && !isMiniMaxH3(record.model || '') && !isWan22Ti2v5b(record.model || '')
        ? await translatePromptToEnglish(record.prompt || '', label, id)
        : record.prompt
      // Translation loads the text model (Qwen3.5) resident, competing with LTX-2.5 admission for memory
      // → the memory guard cancels the video task (503). Unload the text model immediately after translation.
      if (config.provider === 'fusion') await unloadFusionTextModel()
      ;({ url, method, headers, body } = adapter.buildGenerateRequest(config, {
        id: record.id,
        model: record.model,
        prompt: effectiveVideoPrompt,
        referenceMode: params.referenceMode,
        imageUrl: resolvedImageUrl,
        // Subject image selection takes priority over the adapter fallback (blind last-image); explicit firstFrame still wins
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
      // multipart forms (e.g. OpenAI /v1/images/edits) cannot be JSON-serialized; log a field summary
      body: isMultipart ? `[multipart/form-data: ${[...(body as FormData).keys()].join(', ')}]` : body,
    })

    const resp = await fetch(url, {
      method,
      headers,
      body: isMultipart ? (body as FormData) : JSON.stringify(body),
      // Sync API timeout: high-res long-duration video (10s @ 1088x1920, 241 frames two-stage) measured over 30min,
      // relaxed to 60min across the board (image tasks are far shorter, unaffected); couples with the queue watchdog abort
      signal: AbortSignal.any([AbortSignal.timeout(3_600_000), signal, cancelC.signal].filter((x): x is AbortSignal => Boolean(x))),
      // Local model generation takes long: lift undici's default 300s headers timeout
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
        // Sync mode but no URL (Gemini et al. return base64)
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
      // pollTask is fire-and-forget: without .catch an unhandled rejection crashes the node process
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
    // fire-and-forget must .catch, otherwise an unhandled rejection crashes the node process
    pollTask(record, config, taskId!, cancelC.signal).catch(err => logTaskError(label, 'poll-crash', { id, taskId, error: err?.message || String(err) }))
  } catch (err: any) {
    await failTask(id, err.message)
  } finally {
    // Polling path (fire-and-forget) cleans the registry in pollTask's terminal-state path; sync completion cleans here.
    // When polling already started this is an idempotent no-op (pollTask's terminal state deletes too; Map.delete is harmless)
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
  // Optimistic condition: only processing may land failed — late failures after cancel/sweep do not overwrite terminal states (NFR-DATA-1)
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
      // i18n: user-facing
      await cancelTask(record.id, '用户取消')
      return
    }
    if (profile.maxDurationMs && Date.now() - startedAt >= profile.maxDurationMs) {
      await failTask(record.id, `Timeout: polling exceeded ${Math.round(profile.maxDurationMs / 60000)} minutes`)
      return
    }
    await new Promise(r => setTimeout(r, profile.intervalMs))
    try {
      // B8: the task row may already have been user-deleted (DELETE /tasks/:id) or marked failed by the restart sweep —
      // stop orphan polling when the row is gone, so results never write back to an unowned task
      const [fresh] = await db.select({ id: schema.sysTask.id, status: schema.sysTask.status }).from(schema.sysTask).where(eq(schema.sysTask.id, record.id))
      if (!fresh) {
        activeCancels.delete(record.id)
        return
      }
      // Stop orphan polling after cancel/sweep: results no longer write back to an unowned task
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
        // 4xx (except 408/429) = upstream terminal rejection (auth failure/invalid params/content moderation), retrying is pointless:
        // land the failure immediately with a response-body summary; 5xx/408/429 keep retrying
        if (resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429) {
          const body = await resp.text().catch(() => '')
          await failTask(record.id, `Generation rejected (HTTP ${resp.status}): ${body.slice(0, 200)}`)
          return
        }
        continue
      }
      const result = await resp.json() as any

      // Image/video PollResponse shapes differ: read uniformly as any here, then branch by type
      const pollResp: any = adapter.parsePollResponse(result)

      if (pollResp.status === 'completed') {
        if (type === 'image') {
          if (pollResp.imageUrl) {
            logTaskSuccess(label, 'poll-complete', { id: record.id, taskId, imageUrl: pollResp.imageUrl })
            // A2: disk write/thumb/write-back run serially inside the GPU queue (concurrent transcoding/DB writes
            // outside the lock are exactly the contention gpu-queue exists to avoid, just with different resources)
            await enqueueGpuWork(`image-complete-${record.id}`, () => handleImageComplete(record, pollResp.imageUrl))
            await unloadFusionImageModel(config, record.model)
            return
          }
          if (adapter.provider === 'gemini') {
            // Gemini may return base64
            const b64 = (adapter as ImageProviderAdapter).extractImageBase64(result)
            if (b64) {
              logTaskSuccess(label, 'poll-base64-complete', { id: record.id, taskId, mimeType: b64.mimeType })
              await enqueueGpuWork(`image-complete-${record.id}`, () => handleImageCompleteBase64(record, b64.data, b64.mimeType))
              await unloadFusionImageModel(config, record.model)
              return
            }
          }
        } else if (pollResp.videoUrl) {
          // fusion-mlx #1254 handoff: a completed job's artifact is not in the status response —
          // the 'job-output' placeholder → resolve the authenticated /jobs/{id}/output/0 artifact URL.
          // That URL is a temp file (1800s TTL) requiring Bearer auth; persistence goes through localPath.
          let videoUrl = pollResp.videoUrl
          let authHeaders: Record<string, string> | undefined
          let allowLoopback = false
          if (videoUrl === 'job-output') {
            const outReq = (adapter as VideoProviderAdapter).buildJobOutputRequest?.(config, taskId, 0)
            if (!outReq) {
              await failTask(record.id, 'Job completed but adapter cannot build output request')
              return
            }
            videoUrl = outReq.url
            authHeaders = outReq.headers
            // Audit 1107 F-10: this URL is built from the admin-configured
            // fusion-mlx baseUrl (loopback) — exempt from the SSRF gate
            allowLoopback = true
          }
          logTaskSuccess(label, 'poll-complete', { id: record.id, taskId, videoUrl })
          // A2: download/poster frame/TTS dub/ffmpeg muxing likewise enter the GPU serial queue
          await enqueueGpuWork(`video-complete-${record.id}`, () => handleVideoComplete(record, videoUrl, pollResp.duration, authHeaders, allowLoopback))
          return
        }
        // Upstream reported completion without an artifact URL: land terminal failure, do not let polling spin until timeout
        if (pollResp.status === 'completed') {
          await unloadFusionImageModel(config, record.model)
          await failTask(record.id, 'Generation completed but no output URL in poll response')
          return
        }
      }
      if (pollResp.status === 'failed') {
        // Upstream explicit failure (e.g. content moderation block) is terminal: land immediately, no retry, no timeout wait.
        // The model is already loaded on failure; still unload to avoid residency squeezing out subsequent extraction Agents
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
  // The fallback failure write itself may throw (DB busy/locked); do not let exceptions escape the fire-and-forget call
  try {
    await failTask(record.id, 'Timeout: polling attempts exhausted')
  } catch (err: any) {
    logTaskError(taskLabel(type), 'failTask-error', { id: record.id, error: err?.message || String(err) })
  }
}

async function handleImageComplete(record: SysTaskRecord, imageUrl: string) {
  // L6: persist resultUrl first — upstream signed URLs are short-lived; if the download fails the URL is already queryable/re-fetchable in the DB,
  // otherwise the whole GPU generation would be wasted and unrecoverable
  await db.update(schema.sysTask)
    .set({ resultUrl: imageUrl, updatedAt: now() })
    .where(eq(schema.sysTask.id, record.id))
  const localPath = await downloadFile(imageUrl, 'images')
  // List-page thumbnail (frontend derives the address by naming convention) — failure only degrades, never kills the main image
  try {
    await generateImageThumb(localPath)
  } catch (err: any) {
    logTaskWarn('ImageTask', 'thumb-failed', { id: record.id, error: err?.message })
  }

  appendTaskEvent(record.id, 'completed', { localPath })
  // data URI (fusion sync return) is already on disk as localPath; never store it verbatim in result_url —
  // JSON.stringify of multi-MB base64 would blow up the list API response (same policy as the video path)
  const resultUrl = imageUrl.startsWith('data:') ? localPath : imageUrl
  await db.update(schema.sysTask)
    .set({ resultUrl, localPath, status: 'completed', completedAt: now(), updatedAt: now() })
    .where(and(eq(schema.sysTask.id, record.id), eq(schema.sysTask.status, 'processing')))

  logTaskSuccess('ImageTask', 'downloaded', { id: record.id, provider: record.provider, localPath })

  await writeBackImageAssets(record, localPath)
  await runImageReviewGate(record, localPath)
}

// Checklist 1107 #4: VLM review gate — score consistency/quality/artifacts,
// fire ONE corrective retry task when the image is clearly off. Retries carry
// params.review_retry=true and skip review (no loops). Best-effort: review
// failure never fails the completed task. Used by both URL and base64 paths.
async function runImageReviewGate(record: SysTaskRecord, localPath: string) {
  try {
    const params = parseTaskParams(record.params)
    if (params.review_retry) return
    const { reviewGeneratedImage, reviewNeedsRetry, reviewRetryPrompt } = await import('./image-review.js')
    const review = await reviewGeneratedImage(localPath, record.prompt || '', record.provider, 'ImageTask', record.id)
    if (review && reviewNeedsRetry(review)) {
      const cfg = await getActiveConfig('image')
      if (cfg) {
        const retryPrompt = reviewRetryPrompt(record.prompt || '', review)
        const retryParams: Record<string, any> = { ...params, prompt: retryPrompt, review_retry: true }
        delete retryParams.referenceImages
        const retryId = await createTask('image', cfg, {
          storyboardId: record.storyboardId ?? undefined,
          dramaId: record.dramaId ?? undefined,
          sceneId: record.sceneId ?? undefined,
          characterId: record.characterId ?? undefined,
          propId: record.propId ?? undefined,
          prompt: retryPrompt,
          model: record.model,
          retryOf: record.id,
        }, retryParams)
        appendTaskEvent(record.id, 'review-retry', { review, retryTaskId: retryId })
        logTaskWarn('ImageTask', 'review-retry-spawned', { id: record.id, retryId, score: review.score, issues: review.issues })
      }
    } else if (review) {
      appendTaskEvent(record.id, 'review-passed', { score: Math.round(review.score * 10) / 10, consistency: review.consistency, quality: review.quality, artifacts: review.artifacts })
    }
  } catch (err: any) {
    logTaskWarn('ImageTask', 'review-gate-error', { id: record.id, error: err?.message })
  }
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
  await runImageReviewGate(record, localPath)
}

// Write image results back to business tables after completion: storyboards (by frameType), characters, scenes, props
/** B25: write-back guard — skip the overwrite when the target row was updated after task creation (e.g. user manually re-generated/re-uploaded), preventing loss */
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

async function handleVideoComplete(record: SysTaskRecord, videoUrl: string, duration: number | null | undefined, authHeaders?: Record<string, string>, allowLoopback = false) {
  // L6: persist remote URLs other than data URIs first (signed URLs are short-lived; on download failure they are queryable/re-fetchable).
  // The #1254-handoff artifact URL is a temp file with auth — no re-fetch exists; a placeholder in the DB is fine,
  // localPath is the source of truth.
  if (!videoUrl.startsWith('data:')) {
    await db.update(schema.sysTask)
      .set({ resultUrl: videoUrl, updatedAt: now() })
      .where(eq(schema.sysTask.id, record.id))
  }
  const localPath = await downloadFile(videoUrl, 'videos', authHeaders, { allowLoopback })
  // Poster frame for list/cover display, so the frontend need not buffer the whole video to show the first frame — failure only degrades
  try {
    await extractVideoPoster(localPath)
  } catch (err: any) {
    logTaskWarn('VideoTask', 'poster-failed', { id: record.id, error: err?.message })
  }
  // issue: LTX-2.5 joint A/V produces only ambient noise, dialogue is missing —
  // when the storyboard prompt contains dialogue, synthesize a TTS dub and mix it into the audio track (failure does not block the main flow).
  // Note: dialogue must come from the original prompt (record.prompt); the translated English cannot feed the Chinese TTS;
  // params.prompt does not exist (prompt lives in the task record column) — reading from there previously meant dubbing never triggered.
  try {
    const { dubVideoDialogue } = await import('../utils/video-dub.js')
    // storyboardId looks up the characters bound to the storyboard: LLMs often sandwich action description between
    // @name and the dialogue marker, and without a known character name multiple lines of the same
    // character map to different speakers → different voices, breaking per-character voice consistency. Pass names for exact matching.
    await dubVideoDialogue(localPath, record.prompt, record.id, record.storyboardId ?? undefined)
  } catch { /* dub failure keeps the original audio track */ }
  // data URI (fusion sync return) is already on disk as localPath; never store it verbatim in result_url —
  // otherwise 37MB base64 pollutes the DB and API responses. Remote URLs stay verbatim (frontend treats http as direct link).
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

// ─── Reference material normalization ───────────────────────────────────────────────

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
    // Remote URL: download and compress to a data URL so multipart upload (OpenAI edits) / inline_data (Gemini) both work
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
 * I2V subject image selection: parse the shot's subject from the reference markers in the storyboard
 * video_prompt and return its reference image. Must run before prompt translation — markers get
 * mangled by translation (image indexes renamed, character names rewritten), leaving the adapter to
 * blindly take the last referenceImageUrls entry, which pins the subject to a supporting character's
 * image in multi-character shots → identity swap (observed: Puti appearing in the protagonist slot
 * instead of Wukong). Supports two marker kinds (storyboard prompts actually mix both):
 *   @ImageN — 1-based index into referenceImageUrls (generated by frontend getShotReferenceIndexMap)
 *   @<character name> — storyboard-bound character name (Agent generation path)
 * Multiple subjects: pick the most mentioned; ties favor the protagonist (see the role tag check below), then first occurrence.
 * Returns a compressed data URL; null when there is no reference or the character has no image (caller falls back to the adapter).
 */
async function resolveI2vSubjectUrl(
  storyboardId: number | null | undefined,
  prompt: string,
  rawReferenceUrls: string[],
  label: string,
  id: number,
): Promise<string | null> {
  if (!prompt) return null

  // 1) @ImageN explicit numbered reference
  const idxCounts = new Map<number, number>()
  // i18n: user-facing — matches agent-produced prompt markers
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

  // 2) @<character name> references (characters bound to this storyboard; order by mentions → protagonist first → first occurrence)
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
      // i18n: user-facing — matches the agent-written Chinese role tag
      return { name: ch.name!, imageUrl: ch.imageUrl!, mentions, isProtagonist: (ch.role || '').includes('主角') ? 1 : 0, firstPos }
    })
    .filter((ch) => ch.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions || b.isProtagonist - a.isProtagonist || a.firstPos - b.firstPos)
  const winner = candidates[0]
  if (!winner) {
    // Legacy-data fallback: with no numbered/name references, take the last reference in the list (scene images first, character images last convention)
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
 * Resolves reference video/audio into URLs accessible by the Seedance API.
 * http(s)/dataURL pass through; local static paths need PUBLIC_BASE_URL to build a public address.
 * When unset, throws an actionable error (caught and written into error_msg for frontend display).
 */
function resolvePublicMediaUrl(value: string | null | undefined, kind: 'video' | 'audio' | 'file'): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw
  if (raw.startsWith('static/') || raw.startsWith('/static/')) {
    const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '')
    if (!base) {
      // i18n: user-facing
      const label = kind === 'video' ? '视频' : kind === 'audio' ? '音频' : '文件'
      throw new Error(
        `参考${label}为本地路径 ${raw}，但后端未配置 PUBLIC_BASE_URL，上游视频生成 API 无法访问内网地址。` + // i18n: user-facing
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
