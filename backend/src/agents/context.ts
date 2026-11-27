/**
 * Agent request context — injected per request via Mastra RequestContext
 * Built by the route layer → generate({ requestContext }) → read inside tool execute
 */
import { RequestContext } from '@mastra/core/request-context'
import { getContentLanguage, type ContentLanguage } from '../services/app-settings.js'

export interface AgentRequestContextValues {
  episodeId: number
  dramaId: number
  modelOverride?: string
  textConfigId?: number
  /** AI content language; falls back to the global setting (app_settings.content_language) when absent */
  language?: ContentLanguage
}

export function buildAgentRequestContext(values: AgentRequestContextValues): RequestContext<AgentRequestContextValues> {
  const rc = new RequestContext<AgentRequestContextValues>()
  rc.set('episodeId', values.episodeId)
  rc.set('dramaId', values.dramaId)
  if (values.modelOverride) rc.set('modelOverride', values.modelOverride)
  if (values.textConfigId) rc.set('textConfigId', values.textConfigId)
  // Language is resolved once at build time: all 4 paths (chat/extraction/image prompts/video prompts) go through here,
  // so the global setting takes effect in a single place; pass values.language explicitly to override per request
  rc.set('language', values.language ?? getContentLanguage())
  return rc
}

export function getEpisodeId(requestContext: RequestContext | undefined): number | null {
  const v = requestContext?.get('episodeId' as never)
  return typeof v === 'number' ? v : null
}

export function getDramaId(requestContext: RequestContext | undefined): number | null {
  const v = requestContext?.get('dramaId' as never)
  return typeof v === 'number' ? v : null
}

/** Read the content language from the request context; returns null when unset (callers treat it as zh) */
export function getContentLanguageFromRC(requestContext: RequestContext | undefined): ContentLanguage | null {
  const v = requestContext?.get('language' as never)
  return typeof v === 'string' && v ? (v as ContentLanguage) : null
}

/** H6: shared tool-layer context guard — the two verbatim copies of requireIds converge here (original files keep wrapper call sites) */
export function requireAgentIds(
  episodeId: number | null | undefined,
  dramaId: number | null | undefined,
): { episodeId: number; dramaId: number } | { error: string } {
  if (!episodeId || !dramaId) return { error: 'Missing episodeId/dramaId in request context' }
  return { episodeId, dramaId }
}
