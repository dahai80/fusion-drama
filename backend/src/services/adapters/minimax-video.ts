/**
 * MiniMax H3 video generation adapter
 * Endpoint: POST /v2/video_generation -> { task_id }
 * Polling:  GET  /v2/query/video_generation/{task_id} -> { task: { status, content.url, error } }
 *
 * Only MiniMax-H3 series models are supported. content[] multimodal structure:
 * - text           prompt (required, <=7000 chars)
 * - image_url      role: first_frame / last_frame / reference_image (up to 9 ref images)
 * - video_url      role: reference_video (up to 3)
 * - audio_url      reference audio (up to 3), mixed total <= 12
 *
 * Notes:
 * - t2v ratio is required and cannot be adaptive; with a first frame (i2v) it is always
 *   adaptive and ratio is omitted
 * - H3 generates audio+video natively in sync; the official docs have no separate
 *   generate_audio switch, so the field is ignored
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'
import { joinProviderUrl } from './url'

/** Only MiniMax-H3 series supported (prefix match, tolerant of future H3.x variants) */
const H3_MODEL_PREFIX = 'minimax-h3'
const DEFAULT_MODEL = 'MiniMax-H3'

/** Multimodal reference limits: 9 images, 3 videos, 3 audios, mixed total 12 */
const REF_LIMITS = { images: 9, videos: 3, audios: 3, total: 12 } as const

const PROMPT_MAX_CHARS = 7000

/** Aspect ratios supported by MiniMax */
const VALID_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'])

function parseUrlArray(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((u) => typeof u === 'string' && u.trim()) : []
  } catch {
    return []
  }
}

export class MiniMaxVideoAdapter implements VideoProviderAdapter {
  provider = 'minimax'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model || DEFAULT_MODEL
    if (!model.toLowerCase().startsWith(H3_MODEL_PREFIX)) {
      // i18n: user-facing
      throw new Error(`仅支持 MiniMax H3 系列模型（MiniMax-H3*），当前: ${model}`)
    }

    const prompt = (record.prompt || '').trim()
    const refImages = parseUrlArray(record.referenceImageUrls)
    const refVideos = parseUrlArray(record.referenceVideoUrls)
    const refAudios = parseUrlArray(record.referenceAudioUrls)
    const firstFrame = (record.firstFrameUrl || record.imageUrl || '').trim()
    const lastFrame = (record.lastFrameUrl || '').trim()

    // i18n: user-facing
    if (!prompt) throw new Error('MiniMax H3 要求必须提供提示词（text content）')
    if (prompt.length > PROMPT_MAX_CHARS) {
      // i18n: user-facing
      throw new Error(`提示词超长：MiniMax H3 上限 ${PROMPT_MAX_CHARS} 字符，当前 ${prompt.length}`)
    }

    const totalRefs = refImages.length + refVideos.length + refAudios.length + (firstFrame ? 1 : 0) + (lastFrame ? 1 : 0)
    if (refImages.length > REF_LIMITS.images || refVideos.length > REF_LIMITS.videos || refAudios.length > REF_LIMITS.audios || totalRefs > REF_LIMITS.total) {
      // i18n: user-facing
      throw new Error(`参考素材超限：图片≤${REF_LIMITS.images}、视频≤${REF_LIMITS.videos}、音频≤${REF_LIMITS.audios}、总数≤${REF_LIMITS.total}`)
    }

    const content: any[] = [{ type: 'text', text: prompt }]
    if (firstFrame) content.push({ type: 'image_url', image_url: { url: firstFrame }, role: 'first_frame' })
    if (lastFrame) content.push({ type: 'image_url', image_url: { url: lastFrame }, role: 'last_frame' })
    for (const url of refImages) {
      content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
    }
    for (const url of refVideos) {
      content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' })
    }
    for (const url of refAudios) {
      content.push({ type: 'audio_url', audio_url: { url } })
    }

    const body: any = {
      model,
      content,
      duration: this.normalizeDuration(record.duration),
      resolution: this.normalizeResolution(record.resolution),
    }

    // i2v (with first frame) always uses adaptive ratio and omits it; t2v ratio is required
    if (!firstFrame) {
      const ratio = (record.aspectRatio || '').trim()
      body.ratio = VALID_RATIOS.has(ratio) ? ratio : '16:9'
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v2', '/video_generation'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    if (result.task_id) {
      return { isAsync: true, taskId: String(result.task_id) }
    }
    const videoUrl = result.task?.content?.url || result.content?.url || result.video_url
    if (videoUrl) {
      return { isAsync: false, videoUrl }
    }
    throw new Error('No task_id or video url in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v2', `/query/video_generation/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    // Official response is { task: { status, content: { url }, error } }; tolerate a flat top-level shape
    const task = result.task && typeof result.task === 'object' ? result.task : result
    const status = task.status

    if (status === 'succeeded') {
      return {
        status: 'completed',
        videoUrl: task.content?.url || task.video_url,
      }
    }
    if (status === 'failed' || status === 'cancelled') {
      const err = task.error
      const msg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || 'Video generation failed')
      const code = err && typeof err === 'object' && err.code ? `[${err.code}] ` : ''
      return { status: 'failed', error: `${code}${msg}` }
    }
    return { status: status || 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    const task = result.task && typeof result.task === 'object' ? result.task : result
    return task.content?.url || task.video_url || null
  }

  private normalizeDuration(duration?: number | null): number {
    const parsed = Math.round(Number(duration || 5))
    if (!Number.isFinite(parsed)) return 5
    // MiniMax H3 supports 4-15 seconds
    return Math.min(15, Math.max(4, parsed))
  }

  /** MiniMax only has 768P / 2K tiers; project-side 480p/720p map to 768P, 1080p/2K map to 2K */
  private normalizeResolution(resolution?: string | null): string {
    const r = (resolution || '').toLowerCase()
    if (r === '2k' || r === '1080p') return '2K'
    return '768P'
  }
}
