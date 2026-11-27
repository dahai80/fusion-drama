/**
 * Volcengine veImageX image generation adapter
 * Endpoint: /api/v3/images/generations (note the /api/v3 prefix)
 * Response shape: { data: [{ url: "..." }] }
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

export class VolcEngineImageAdapter implements ImageProviderAdapter {
  provider = 'volcengine'

  buildGenerateRequest(config: AIConfig, record: ImageGenerationRecord): ProviderRequest {
    // Volcengine uses seedream models
    const model = record.model || config.model || 'doubao-seedream-5-0-260128'

    const body: any = {
      model,
      prompt: record.prompt,
    }

    // Size parameters
    if (record.size) {
      const [w, h] = record.size.split('x')
      if (w && h) {
        body.width = parseInt(w)
        body.height = parseInt(h)
      }
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', '/images/generations'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): ImageGenResponse {
    // Volcengine may return a task_id for polling
    if (result.task_id || result.id) {
      return { isAsync: true, taskId: result.task_id || result.id }
    }
    // Synchronous response
    const imageUrl = result.data?.[0]?.url || result.url
    if (imageUrl) {
      return { isAsync: false, imageUrl }
    }
    throw new Error('No image URL in response')
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/api/v3', `/images/generations/${taskId}`),
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: undefined,
    }
  }

  parsePollResponse(result: any): ImagePollResponse {
    const status = result.status
    if (status === 'succeeded') {
      return {
        status: 'completed',
        imageUrl: result.data?.[0]?.url || result.image_url,
      }
    }
    if (status === 'failed') {
      // Upstream error may be an object { code, message }; normalize to string
      const err = result.error
      const msg = typeof err === 'string' ? err : (err?.message || JSON.stringify(err) || 'Generation failed')
      const code = err && typeof err === 'object' && err.code ? `[${err.code}] ` : ''
      return { status: 'failed', error: `${code}${msg}` }
    }
    return { status: status || 'processing' }
  }

  extractImageUrl(result: any): string | null {
    return result.data?.[0]?.url || result.image_url || null
  }

  extractImageBase64(result: any): { data: string; mimeType: string } | null {
    return null
  }
}
