/**
 * OpenAI DALL-E image generation adapter
 * text-to-image endpoint: /v1/images/generations (note the /v1 prefix)
 * reference-image endpoint: /v1/images/edits (multipart/form-data, image[] file upload)
 * response shape: { data: [{ url: "..." }] } or { data: [{ b64_json: "..." }] }
 */
import type {
  ImageProviderAdapter,
  ProviderRequest,
  AIConfig,
  ImageGenerationRecord,
  ImageGenResponse,
  ImagePollResponse,
} from './types'
import { joinProviderUrl } from './url'
import { parseDataUrl } from '../../utils/storage.js'

export class OpenAIImageAdapter implements ImageProviderAdapter {
  provider = 'openai'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    const model = record.model || config.model || 'gpt-image-2'
    const isGptImage = model.startsWith('gpt-image-')
    const isGptImage2 = model === 'gpt-image-2'
    const size = isGptImage2
      ? this.normalizeGptImage2Size(record.size)
      : isGptImage
      ? this.normalizeGptImageSize(record.size)
      : record.size || '1024x1024'

    // with reference images → use edits (multipart file upload); without → plain
    // text-to-image generations
    const refs = this.parseReferenceImages(record.referenceImages)
    if (refs.length) {
      return this.buildEditsRequest(config, model, record.prompt, size, refs)
    }

    const body: any = {
      model,
      prompt: record.prompt,
      size,
      n: 1,
    }

    if (!isGptImage) {
      body.response_format = 'url'
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/images/generations'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  private parseReferenceImages(raw?: string | null): string[] {
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []
    } catch {
      return []
    }
  }

  /**
   * /v1/images/edits: reference images are uploaded as image[] files via multipart/form-data.
   * generation.ts already normalized them to data URLs (local compression / remote download);
   * this only converts base64 → Blob; the multipart boundary is set by fetch — never set
   * Content-Type by hand.
   *
   * FLUX.1-Kontext (model name contains kontext) in-context editing: fusion-mlx only
   * consumes image[0] (edit target); extra reference images are silently dropped (upstream
   * #1374) — upload only the first and wrap the prompt as an edit instruction (keep character
   * identity unchanged + new shot description); reusing the raw t2i prompt makes Kontext
   * treat the image as a regeneration instead of an edit.
   * Reference-image ordering convention (drama frontend getShotReferenceImages): character
   * costume shots first.
   */
  private buildEditsRequest(
    config: AIConfig,
    model: string,
    prompt: string | null | undefined,
    size: string,
    refs: string[],
  ): ProviderRequest {
    const isKontext = /kontext/i.test(model)
    // Qwen-Image-Edit multi-image conditioning (fusion-mlx #1375): scene/prop reference
    // images beyond the character costume shot are also consumed, not truncated — feed
    // multiple images for "place the character into the scene"-style edits
    const isQwenEdit = /qwen.*edit/i.test(model)
    const KONTEXT_PROMPT_PREFIX = 'Edit this image. Keep the exact same character identity, face and outfit unchanged. '
    const form = new FormData()
    form.append('model', model)
    form.append('prompt', isKontext ? KONTEXT_PROMPT_PREFIX + (prompt || '') : (prompt || ''))
    form.append('size', size)
    form.append('n', '1')
    // Qwen-Image-Edit-2509 bf16 56GB ~80s/step: upstream changed the 600s deadline to an
    // inactivity budget (#1407, v0.10.17); 30 default steps no longer get killed but take
    // ~40min/image — fixed at 6 steps for pipeline speed (measured 494s for 1024x1024)
    if (isQwenEdit) form.append('num_inference_steps', '6')

    let appended = 0
    const uploadRefs = isKontext ? refs.slice(0, 1) : refs
    for (const ref of uploadRefs) {
      const parsed = parseDataUrl(ref)
      if (!parsed) continue
      const buffer = Buffer.from(parsed.data, 'base64')
      const ext = parsed.mimeType === 'image/png' ? 'png' : parsed.mimeType === 'image/webp' ? 'webp' : 'jpg'
      form.append('image[]', new Blob([buffer], { type: parsed.mimeType }), `reference-${++appended}.${ext}`)
    }
    if (!appended) {
      // i18n: user-facing
      throw new Error('参考图片无法解析为可上传的文件（仅支持 data URL 形式的图片）')
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/images/edits'),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: form,
    }
  }

  private normalizeGptImageSize(size?: string | null): string {
    const allowed = ['1024x1024', '1536x1024', '1024x1536', 'auto']
    if (!size) return '1024x1024'

    const normalized = size.toLowerCase()
    if (allowed.includes(normalized)) return normalized

    const [width, height] = normalized.split('x').map(Number)
    if (!width || !height) return 'auto'
    if (width === height) return '1024x1024'
    return width > height ? '1536x1024' : '1024x1536'
  }

  private normalizeGptImage2Size(size?: string | null): string {
    if (!size) return '1024x1024'
    const normalized = size.toLowerCase()
    if (normalized === 'auto') return 'auto'

    const [rawWidth, rawHeight] = normalized.split('x').map(Number)
    if (!rawWidth || !rawHeight) return 'auto'

    const width = this.roundToMultiple(Math.min(4096, Math.max(256, rawWidth)), 16)
    const height = this.roundToMultiple(Math.min(4096, Math.max(256, rawHeight)), 16)
    return `${width}x${height}`
  }

  private roundToMultiple(value: number, multiple: number): number {
    return Math.max(multiple, Math.round(value / multiple) * multiple)
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    // OpenAI sync responses carry their own id (resp-xxx); only treat it as async task
    // mode when there is no data array: with data = sync image result, polling result.id
    // would 404 idle until timeout
    if ((result.task_id || result.id) && !result.data) {
      return { isAsync: true, taskId: result.task_id || result.id }
    }
    const imageUrl = result.data?.[0]?.url || result.url
    if (imageUrl) {
      return { isAsync: false, imageUrl }
    }
    // b64_json mode
    const b64 = result.data?.[0]?.b64_json
    if (b64) {
      // for base64, return the sentinel marker; actual handling lives in extractImageBase64
      return { isAsync: false, imageUrl: undefined }
    }
    throw new Error('No image URL in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', `/images/task/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): ImagePollResponse {
    if (result.status === 'completed') {
      return {
        status: 'completed',
        imageUrl: result.image_url || result.data?.[0]?.url || null,
      }
    }
    if (result.status === 'failed') {
      return { status: 'failed', error: result.error?.message || 'Generation failed' }
    }
    return { status: result.status || 'processing' }
  }

  extractImageUrl(result: any): string | null {
    return result.data?.[0]?.url || result.image_url || null
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    const b64 = result.data?.[0]?.b64_json
    if (b64) {
      return { data: b64, mimeType: 'image/png' }
    }
    return null
  }
}
