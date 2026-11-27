/**
 * Gemini image generation adapter
 * auth: URL query param ?key= or header x-goog-api-key
 * request: Google REST-style contents[].parts[] structure
 * response: base64 payload in inlineData.data, no URL
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

export class GeminiImageAdapter implements ImageProviderAdapter {
  provider = 'gemini'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    // Gemini model name formats: "models/gemini-3-pro-image" or plain "gemini-3-pro-image"
    const modelName = record.model || config.model || 'gemini-3-pro-image'
    // the interactions endpoint exists only on the official API; relay proxies (new-api
    // style) generally do not configure that endpoint type and report
    // i18n: user-facing — quotes the upstream error message text
// "endpointType=GEMINI_INTERACTIONS 未启用" — those fall back to the generateContent branch
    const isGemini3Image = /gemini-3.*image/.test(modelName)
    const isOfficialHost = /generativelanguage\.googleapis\.com/.test(config.baseUrl || '')

    if (isGemini3Image && isOfficialHost) {
      return {
        url: joinProviderUrl(config.baseUrl, '/v1beta', '/interactions'),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.apiKey,
        },
        body: {
          model: modelName.replace(/^models\//, ''),
          input: record.prompt || 'Generate an image',
          response_format: {
            type: 'image',
            aspect_ratio: this.parseAspectRatio(record.size),
            image_size: this.parseImageSize(record.size),
          },
        },
      }
    }

    const model = modelName.startsWith('models/') ? modelName : `models/${modelName}`

    // Google REST-style request body
    const parts: any[] = []
    if (record.referenceImages) {
      try {
        const refs = JSON.parse(record.referenceImages)
        for (const ref of refs) {
          const parsed = parseDataUrl(String(ref || ''))
          if (parsed) {
            parts.push({
              inline_data: {
                mime_type: parsed.mimeType,
                data: parsed.data,
              },
            })
          }
        }
      } catch {}
    }
    parts.push({ text: record.prompt || 'Generate an image' })

    const body = {
      contents: [{
        parts,
      }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        imageConfig: {
          // parse size like "1920x1080" -> aspectRatio
          aspectRatio: this.parseAspectRatio(record.size),
          imageSize: this.parseImageSize(record.size),
        },
      },
    }

    // key goes in the header only (x-goog-api-key): a query-param key would leave traces in
    // proxy/gateway access logs
    const url = new URL(joinProviderUrl(config.baseUrl, '/v1beta', `/${model}:generateContent`))

    return {
      url: url.toString(),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    const firstCandidate = result?.candidates?.[0]
    const finishReason = firstCandidate?.finishReason || firstCandidate?.finish_reason
    const finishMessage = firstCandidate?.finishMessage || firstCandidate?.finish_message

    if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
      throw new Error(finishMessage || `Gemini generation stopped: ${finishReason}`)
    }

    if (this.extractImageUrl(result)) {
      return { isAsync: false, imageUrl: this.extractImageUrl(result) || undefined }
    }

    if (this.extractImageBase64(result)) {
      return { isAsync: false, imageUrl: undefined }
    }

    // only an explicit task_id counts as an async task: relay proxies often return a plain
    // result.id (not a poll-endpoint id); misjudging would GET /{id} idle through the whole
    // polling window and then fake-timeout
    if (result.task_id) {
      return { isAsync: true, taskId: result.task_id }
    }

    if (result.error) {
      throw new Error(result.error.message || 'Gemini generation failed')
    }
    throw new Error('No image data in Gemini response')
  }

  parsePollResponse(result: any): ImagePollResponse {
    // Gemini is synchronous; this is normally never reached
    return { status: 'completed' }
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    // Gemini does not poll, but the interface is implemented for consistency
    const url = new URL(joinProviderUrl(config.baseUrl, '/v1beta', `/${taskId}`))
    return {
      url: url.toString(),
      method: 'GET',
      headers: {
        'x-goog-api-key': config.apiKey,
      },
      body: undefined,
    }
  }

  extractImageUrl(result: any): string | null {
    return result?.data?.[0]?.url
      || result?.image_url
      || result?.url
      || null
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    const b64 = result?.data?.[0]?.b64_json
    if (b64) {
      return { data: b64, mimeType: 'image/png' }
    }

    if (result?.output_image?.data) {
      return {
        data: result.output_image.data,
        mimeType: result.output_image.mime_type || result.output_image.mimeType || 'image/png',
      }
    }

    const parts = result.candidates?.[0]?.content?.parts || []
    for (const part of parts) {
      if (part.inlineData || part.inline_data) {
        const inline = part.inlineData || part.inline_data
        return {
          data: inline.data,
          mimeType: inline.mimeType || inline.mime_type || 'image/png',
        }
      }
    }
    return null
  }

  private parseAspectRatio(size?: string | null): string {
    if (!size) return '16:9'
    const [w, h] = size.split('x').map(Number)
    if (!w || !h) return '16:9'
    const gcd = this.gcd(w, h)
    return `${w / gcd}:${h / gcd}`
  }

  private parseImageSize(size?: string | null): string {
    if (!size) return '1K'
    const [w] = size.split('x').map(Number)
    if (!w) return '1K'
    if (w >= 2048) return '4K'
    if (w >= 1024) return '2K'
    if (w >= 512) return '1K'
    return '512'
  }

  private gcd(a: number, b: number): number {
    return b === 0 ? a : this.gcd(b, a % b)
  }
}
