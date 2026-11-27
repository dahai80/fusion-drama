/**
 * Volcengine Seedance 2.0 video generation adapter
 * Endpoint: /api/v3/contents/generations/tasks (note the /api/v3 prefix)
 * Response: { id: "task-xxx" } -> poll for status
 *
 * Only Doubao Seedance 2.0+ series models are supported; the only generation mode kept is
 * multimodal reference:
 * - reference   multimodal references (<=9 reference_image + <=3 reference_video +
 *   <=3 reference_audio + optional text); with reference audio at least 1 reference
 *   image or video is required
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

/** Only Seedance 2.0+ series supported (prefix match, tolerant of future 2.0.x variants) */
const SEEDANCE2_MODEL_PREFIX = 'doubao-seedance-2-0'
const DEFAULT_MODEL = 'doubao-seedance-2-0-mini-260615'

/** Multimodal reference limits: 9 images, 3 videos, 3 audios */
const REF_LIMITS = { images: 9, videos: 3, audios: 3 } as const

function parseUrlArray(raw?: string | null): string[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((u) => typeof u === 'string' && u.trim()) : []
  } catch {
    return []
  }
}

export class VolcEngineVideoAdapter implements VideoProviderAdapter {
  provider = 'volcengine'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model || DEFAULT_MODEL
    if (!model.startsWith(SEEDANCE2_MODEL_PREFIX)) {
      // i18n: user-facing
      throw new Error(`仅支持 Seedance 2.0 系列模型（${SEEDANCE2_MODEL_PREFIX}-*），当前: ${model}`)
    }

    const prompt = (record.prompt || '').trim()
    const refImages = parseUrlArray(record.referenceImageUrls)
    const refVideos = parseUrlArray(record.referenceVideoUrls)
    const refAudios = parseUrlArray(record.referenceAudioUrls)

    if (refImages.length > REF_LIMITS.images || refVideos.length > REF_LIMITS.videos || refAudios.length > REF_LIMITS.audios) {
      // i18n: user-facing
      throw new Error(`参考素材超限：图片≤${REF_LIMITS.images}、视频≤${REF_LIMITS.videos}、音频≤${REF_LIMITS.audios}`)
    }
    if (refAudios.length > 0 && refImages.length + refVideos.length === 0) {
      // i18n: user-facing
      throw new Error('参考音频需要至少 1 个参考图片或视频')
    }
    if (!prompt && !refImages.length && !refVideos.length && !refAudios.length) {
      // i18n: user-facing
      throw new Error('多模态参考模式需要至少一个参考素材或 prompt')
    }

    const content: any[] = []
    if (prompt) content.push({ type: 'text', text: prompt })
    for (const url of refImages) {
      content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
    }
    for (const url of refVideos) {
      content.push({ type: 'video_url', video_url: { url }, role: 'reference_video' })
    }
    for (const url of refAudios) {
      content.push({ type: 'audio_url', audio_url: { url }, role: 'reference_audio' })
    }

    const body: any = {
      model,
      content,
      generate_audio: record.generateAudio !== 0 && record.generateAudio !== false,
      ratio: record.aspectRatio || 'adaptive',
      duration: this.normalizeDuration(record.duration),
      // Seedance 2.0 only has 480p/720p tiers; 1080p converges to 720p
      resolution: record.resolution === '480p' ? '480p' : '720p',
      watermark: false,
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', '/contents/generations/tasks'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    if (result.id) {
      return { isAsync: true, taskId: result.id }
    }
    // Synchronous response
    const videoUrl = result.video_url || result.content?.video_url || result.data?.video_url
    if (videoUrl) {
      return { isAsync: false, videoUrl }
    }
    throw new Error('No task_id or video_url in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', `/contents/generations/tasks/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    const status = result.status
    if (status === 'succeeded') {
      const videoUrl = result.video_url || result.content?.video_url || result.data?.video_url
      return {
        status: 'completed',
        videoUrl,
      }
    }
    if (status === 'failed') {
      // Upstream error may be an object { code, message } (e.g. OutputVideoSensitiveContentDetected); normalize to string
      const err = result.error
      const msg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || 'Video generation failed')
      const code = err && typeof err === 'object' && err.code ? `[${err.code}] ` : ''
      return { status: 'failed', error: `${code}${msg}` }
    }
    return { status: status || 'processing' }
  }

  extractVideoUrl(result: any): string | null {
    return result.video_url || result.content?.video_url || result.data?.video_url || null
  }

  private normalizeDuration(duration?: number | null): number {
    const parsed = Math.round(Number(duration || 5))
    if (!Number.isFinite(parsed)) return 5
    // Seedance 2.0 supports 4-15 seconds
    return Math.min(15, Math.max(4, parsed))
  }
}
