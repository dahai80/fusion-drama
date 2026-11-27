/**
 * Provider adapter registry.
 * Returns the adapter instance for a provider name; the `custom:<name>` prefix routes to
 * programmable providers (JS code stored in the DB, hot-registered in a node:vm sandbox).
 */
import { OpenAIImageAdapter } from './openai-image'
import { GeminiImageAdapter } from './gemini-image'
import { VolcEngineImageAdapter } from './volcengine-image'
import { VolcEngineVideoAdapter } from './volcengine-video'
import { MiniMaxVideoAdapter } from './minimax-video'
import { AliyunWanVideoAdapter } from './aliyun-wan-video'
import { FusionVideoAdapter } from './fusion-video'
import type { ImageProviderAdapter, VideoProviderAdapter } from './types'
import { isCustomProvider, getCustomImageAdapter, getCustomVideoAdapter } from '../custom-providers'

// Image adapter registry
export const imageAdapters: Record<string, ImageProviderAdapter> = {
  openai: new OpenAIImageAdapter(),
  gemini: new GeminiImageAdapter(),
  volcengine: new VolcEngineImageAdapter(),
}

// Video adapter registry
export const videoAdapters: Record<string, VideoProviderAdapter> = {
  volcengine: new VolcEngineVideoAdapter(),
  minimax: new MiniMaxVideoAdapter(),
  aliyun: new AliyunWanVideoAdapter(),
  fusion: new FusionVideoAdapter(),
}

/**
 * Gets the image adapter
 * @param provider vendor name (built-in name or custom:<name>)
 * @returns the matching adapter (custom requires a DB lookup, hence async)
 */
export async function getImageAdapter(provider: string): Promise<ImageProviderAdapter> {
  if (isCustomProvider(provider)) return getCustomImageAdapter(provider.toLowerCase())
  const adapter = imageAdapters[provider.toLowerCase()]
  if (!adapter) throw new Error(`Unsupported image provider: ${provider}`)
  return adapter
}

/**
 * Gets the video adapter
 * @param provider vendor name (built-in name or custom:<name>)
 * @returns the matching adapter (custom requires a DB lookup, hence async)
 */
export async function getVideoAdapter(provider: string): Promise<VideoProviderAdapter> {
  if (isCustomProvider(provider)) return getCustomVideoAdapter(provider.toLowerCase())
  const adapter = videoAdapters[provider.toLowerCase()]
  if (!adapter) throw new Error(`Unsupported video provider: ${provider}`)
  return adapter
}
