const BASE = '/api/v1'

// dev flag: API logging only in dev mode (production console never leaks request bodies/routes)
const isDev = import.meta.dev ?? false

// F8: 30s default timeout, 120s for POST (ai-configs/test probes a real provider and can take minutes);
// a hung backend no longer leaves buttons pending forever
const DEFAULT_TIMEOUT = 30_000
const POST_TIMEOUT = 120_000

// FR-P0-1: frontend auth in server token mode (FUSION_API_TOKEN) — token stored in localStorage
// (same XSS surface as the cookie approach but CSRF-free), configurable on the settings page;
// no header when unset (local/desktop mode)
function authHeaders(): Record<string, string> {
  const token = (typeof localStorage !== 'undefined' && localStorage.getItem('FUSION_API_TOKEN')) || ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function req<T = any>(method: string, path: string, body?: any, timeoutMs?: number): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    signal: AbortSignal.timeout(timeoutMs ?? (method === 'POST' ? POST_TIMEOUT : DEFAULT_TIMEOUT)),
  }
  if (body) opts.body = JSON.stringify(body)

  const start = performance.now()
  if (isDev) console.log(`%c[API] %c${method} %c${path}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc', body || '')

  try {
    const resp = await fetch(`${BASE}${path}`, opts)
    // F8: envelope tolerance — non-JSON responses like 502/504 HTML no longer throw a bare SyntaxError
    let json: any = null
    try { json = await resp.json() } catch { /* non-JSON body */ }
    const ms = Math.round(performance.now() - start)

    if (!resp.ok || (json?.code && json.code >= 400)) {
      const message = json?.message || `HTTP ${resp.status}`
      if (isDev) console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', message)
      throw new Error(message)
    }

    if (isDev) console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#66bb6a', 'color:#66bb6a;font-weight:bold', 'color:#888')
    return json?.data ?? json
  } catch (err: any) {
    // i18n: user-facing
    if (err.name === 'TimeoutError') throw new Error('请求超时，请检查服务是否可用')
    if (isDev && !err.message?.match(/^(HTTP )?\d{3}$/)) {
      const ms = Math.round(performance.now() - start)
      console.log(`%c[API] %c${method} ${path} %cERROR %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', err.message)
    }
    throw err
  }
}

export const api = {
  get: <T = any>(p: string) => req<T>('GET', p),
  post: <T = any>(p: string, b?: any, timeoutMs?: number) => req<T>('POST', p, b, timeoutMs),
  put: <T = any>(p: string, b?: any) => req<T>('PUT', p, b),
  del: <T = any>(p: string) => req<T>('DELETE', p),
}

export const dramaAPI = {
  list: () => api.get<{ items: any[] }>('/dramas'),
  get: (id: number) => api.get(`/dramas/${id}`),
  create: (data: any) => api.post('/dramas', data),
  update: (id: number, data: any) => api.put(`/dramas/${id}`, data),
  // Backend requires delete confirmation (FR-P0-1/FR-BIZ-1): confirm=true cascades a soft delete of the episode
  del: (id: number) => api.del(`/dramas/${id}?confirm=true`),
}

// Whole-novel import pipeline: chunking -> outlines -> episode planning -> per-episode rolling rewrite
export const novelAPI = {
  import: (dramaId: number, content: string, replace = true) =>
    api.post('/novel/import', { drama_id: dramaId, content, replace }, 300_000),
  outline: (dramaId: number) => api.post('/novel/outline', { drama_id: dramaId }),
  plan: (dramaId: number, targetMinutes = 2) =>
    api.post('/novel/plan', { drama_id: dramaId, target_minutes: targetMinutes }, 600_000),
  rewriteAll: (dramaId: number) => api.post('/novel/rewrite', { drama_id: dramaId }),
  rewriteOne: (dramaId: number, episodeId: number) =>
    api.post(`/novel/rewrite/${episodeId}`, { drama_id: dramaId }, 900_000),
  status: (dramaId: number) => api.get(`/novel/status?drama_id=${dramaId}`),
}

export const episodeAPI = {
  create: (data: any) => api.post('/episodes', data),
  update: (id: number, data: any) => api.put(`/episodes/${id}`, data),
  del: (id: number) => api.del(`/episodes/${id}?confirm=true`),
  characters: (id: number) => api.get(`/episodes/${id}/characters`),
  scenes: (id: number) => api.get(`/episodes/${id}/scenes`),
  props: (id: number) => api.get(`/episodes/${id}/props`),
  storyboards: (id: number) => api.get(`/episodes/${id}/storyboards`),
  pipelineStatus: (id: number) => api.get(`/episodes/${id}/pipeline-status`),
  extract: (id: number, target: string, model?: string, configId?: number) => api.post(`/episodes/${id}/extract`, { target, model: model || undefined, config_id: configId || undefined }),
  extractStatus: (id: number) => api.get(`/episodes/${id}/extract-status`),
  generateVideoPrompts: (id: number, model?: string, configId?: number, storyboardIds?: number[]) => api.post(`/episodes/${id}/generate-video-prompts`, { model: model || undefined, config_id: configId || undefined, storyboard_ids: storyboardIds?.length ? storyboardIds : undefined }),
  videoPromptsStatus: (id: number) => api.get(`/episodes/${id}/video-prompts-status`),
}

export const storyboardAPI = {
  create: (data: any) => api.post('/storyboards', data),
  update: (id: number, data: any) => api.put(`/storyboards/${id}`, data),
  layout: (items: Array<{ id: number; canvas_x: number; canvas_y: number }>) => api.put('/storyboards/layout', { items }),
  del: (id: number) => api.del(`/storyboards/${id}`),
}

export const characterAPI = {
  create: (data: any) => api.post('/characters', data),
  update: (id: number, data: any) => api.put(`/characters/${id}`, data),
  del: (id: number) => api.del(`/characters/${id}`),
  generatePrompt: (id: number, episodeId: number, force = false, textModel?: string, textConfigId?: number) => api.post(`/characters/${id}/generate-prompt`, { episode_id: episodeId, force, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
  generateImage: (id: number, episodeId: number, model?: string, configId?: number, textModel?: string, textConfigId?: number) => api.post(`/characters/${id}/generate-image`, { episode_id: episodeId, model: model || undefined, config_id: configId || undefined, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
  batchImages: (ids: number[], episodeId: number, model?: string, configId?: number, textModel?: string, textConfigId?: number) => api.post('/characters/batch-generate-images', { character_ids: ids, episode_id: episodeId, model: model || undefined, config_id: configId || undefined, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
}

export const sceneAPI = {
  create: (data: any) => api.post('/scenes', data),
  update: (id: number, data: any) => api.put(`/scenes/${id}`, data),
  del: (id: number) => api.del(`/scenes/${id}`),
  generatePrompt: (id: number, episodeId: number, force = false, textModel?: string, textConfigId?: number) => api.post(`/scenes/${id}/generate-prompt`, { episode_id: episodeId, force, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
  generateImage: (id: number, episodeId: number, model?: string, configId?: number, textModel?: string, textConfigId?: number) => api.post(`/scenes/${id}/generate-image`, { episode_id: episodeId, model: model || undefined, config_id: configId || undefined, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
}

export const propAPI = {
  create: (data: any) => api.post('/props', data),
  update: (id: number, data: any) => api.put(`/props/${id}`, data),
  del: (id: number) => api.del(`/props/${id}`),
  generatePrompt: (id: number, episodeId: number, force = false, textModel?: string, textConfigId?: number) => api.post(`/props/${id}/generate-prompt`, { episode_id: episodeId, force, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
  generateImage: (id: number, episodeId: number, model?: string, configId?: number, textModel?: string, textConfigId?: number) => api.post(`/props/${id}/generate-image`, { episode_id: episodeId, model: model || undefined, config_id: configId || undefined, text_model: textModel || undefined, text_config_id: textConfigId || undefined }),
}

// Unified generation tasks (image/video): POST carries a type field, list filters by type
export const taskAPI = {
  generate: (d: any) => api.post('/tasks', d),
  get: (id: number) => api.get(`/tasks/${id}`),
  del: (id: number) => api.del(`/tasks/${id}`),
  list: (params?: { type?: 'image' | 'video'; drama_id?: number; storyboard_id?: number }) => {
    const query = new URLSearchParams()
    if (params?.type) query.set('type', params.type)
    if (params?.drama_id) query.set('drama_id', String(params.drama_id))
    if (params?.storyboard_id) query.set('storyboard_id', String(params.storyboard_id))
    return api.get(`/tasks${query.size ? `?${query.toString()}` : ''}`)
  },
  // Per-episode aggregated generation tasks (sys_task + video_merges)
  listByEpisode: (episodeId: number) => api.get<{ tasks: any[]; merges: any[] }>(`/episodes/${episodeId}/generation-tasks`),
  // NFR-REL-4 queue depth (queuing feedback); PRD §10.2 retry success rate metric
  queueDepth: () => api.get<{ depth: number }>('/tasks/queue'),
  retryStats: () => api.get<{ retries: number; retrySucceeded: number; retrySuccessRate: number | null; failedTasksTotal: number; failedTasksRetried: number }>('/tasks/retry-stats'),
}

async function uploadReq<T = any>(path: string, file: File): Promise<T> {
  const fd = new FormData()
  fd.append('file', file)
  if (isDev) console.log(`%c[API] %cPOST %c${path} %c${file.name}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc', 'color:#888')
  const resp = await fetch(`${BASE}${path}`, { method: 'POST', body: fd, signal: AbortSignal.timeout(300_000) })
  let json: any = null
  try { json = await resp.json() } catch { /* non-JSON body */ }
  if (!resp.ok || (json?.code && json.code >= 400)) {
    if (isDev) console.log(`%c[API] %cPOST ${path} %c${resp.status}`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold')
    throw new Error(json?.message || `HTTP ${resp.status}`)
  }
  return json?.data ?? json
}

export const uploadAPI = {
  image: (f: File) => uploadReq<{ url: string; path: string }>('/upload/image', f),
  video: (f: File) => uploadReq<{ url: string; path: string }>('/upload/video', f),
  audio: (f: File) => uploadReq<{ url: string; path: string }>('/upload/audio', f),
}
export const mergeAPI = {
  merge: (epId: number, storyboardIds?: number[]) => api.post(`/merge/episodes/${epId}/merge`, storyboardIds?.length ? { storyboard_ids: storyboardIds } : {}),
  status: (epId: number) => api.get(`/merge/episodes/${epId}/merge`),
  list: (epId: number) => api.get<any[]>(`/merge/episodes/${epId}/merges`),
}
export const aiConfigAPI = {
  list: (t?: string) => api.get(`/ai-configs${t ? `?service_type=${t}` : ''}`),
  create: (d: any) => api.post('/ai-configs', d),
  update: (id: number, d: any) => api.put(`/ai-configs/${id}`, d),
  del: (id: number) => api.del(`/ai-configs/${id}`),
  test: (d: any) => api.post('/ai-configs/test', d),
}

// Programmable providers: user-defined image/video adapters (JS code stored in DB, hot-registered in a sandbox)
export const customProviderAPI = {
  list: () => api.get<any[]>('/custom-providers'),
  get: (id: number) => api.get(`/custom-providers/${id}`),
  create: (d: any) => api.post('/custom-providers', d),
  update: (id: number, d: any) => api.put(`/custom-providers/${id}`, d),
  del: (id: number) => api.del(`/custom-providers/${id}`),
  test: (d: any) => api.post('/custom-providers/test', d),
  testById: (id: number, d?: any) => api.post(`/custom-providers/${id}/test`, d || {}),
}

// ONNX RAG: local vector retrieval (bge-small CPU); agent chat auto-injects script/character/scene/prop context
export const ragAPI = {
  status: () => api.get<any>('/rag/status'),
  setEnabled: (enabled: boolean) => api.put('/rag/enabled', { enabled }),
  indexAll: () => api.post('/rag/index-all', {}, 600_000),
  search: (dramaId: number, q: string) => api.get(`/rag/search?drama_id=${dramaId}&q=${encodeURIComponent(q)}`),
}

export const memoryAPI = {
  status: () => api.get<any>('/memory/status'),
  setEnabled: (enabled: boolean) => api.put('/memory/enabled', { enabled }),
  recall: (q: string) => api.get<any>(`/memory/recall?q=${encodeURIComponent(q)}`),
}

export const supervisorAPI = {
  status: () => api.get<any>('/supervisor/status'),
  setEnabled: (enabled: boolean) => api.put('/supervisor/enabled', { enabled }),
}

// When lang is unset or zh, read/write the base version (no query param, preserving the original request shape)
const langQ = (lang?: string) => (lang && lang !== 'zh' ? `?lang=${lang}` : '')

export const promptAPI = {
  list: () => api.get('/prompts'),
  get: (type: string, lang?: string) => api.get(`/prompts/${type}${langQ(lang)}`),
  update: (type: string, d: any, lang?: string) => api.put(`/prompts/${type}${langQ(lang)}`, d),
  reset: (type: string, lang?: string) => api.post(`/prompts/${type}/reset${langQ(lang)}`),
}

export const skillsAPI = {
  list: (lang?: string) => api.get(`/skills${langQ(lang)}`),
  get: (id: string, lang?: string) => api.get(`/skills/${id}${langQ(lang)}`),
  create: (data: { id: string; name: string; description?: string }) => api.post('/skills', data),
  update: (id: string, content: string, lang?: string) => api.put(`/skills/${id}${langQ(lang)}`, { content }),
  del: (id: string) => api.del(`/skills/${id}`),
}

export const stylePresetAPI = {
  list: (all = false) => api.get(`/style-presets${all ? '?all=1' : ''}`),
  create: (d: any) => api.post('/style-presets', d),
  update: (id: number, d: any) => api.put(`/style-presets/${id}`, d),
  del: (id: number) => api.del(`/style-presets/${id}`),
}

export const storageAPI = {
  info: () => api.get('/storage'),
  // FR-BIZ-6: manual DB backup for server deployments (last 10 kept)
  createBackup: () => api.post('/storage/backup', {}, 300_000),
  listBackups: () => api.get('/storage/backups'),
}

export const settingsAPI = {
  contentLanguage: () => api.get<{ language: string }>('/settings/content-language'),
  setContentLanguage: (language: string) => api.put('/settings/content-language', { language }),
}

// Version check and update for server/Docker deployments (desktop uses useDesktopBridge instead of this API)
export const serverUpdateAPI = {
  state: () => api.get('/server-update/state'),
  check: () => api.post('/server-update/check'),
  apply: () => api.post('/server-update/apply'),
}
