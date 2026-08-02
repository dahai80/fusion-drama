const BASE = '/api/v1'

async function req<T = any>(method: string, path: string, body?: any): Promise<T> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)

  const start = performance.now()
  console.log(`%c[API] %c${method} %c${path}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc', body || '')

  try {
    const resp = await fetch(`${BASE}${path}`, opts)
    const json = await resp.json()
    const ms = Math.round(performance.now() - start)

    if (!resp.ok || (json.code && json.code >= 400)) {
      console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', json.message || '')
      throw new Error(json.message || `${resp.status}`)
    }

    console.log(`%c[API] %c${method} ${path} %c${resp.status} %c${ms}ms`, 'color:#888', 'color:#66bb6a', 'color:#66bb6a;font-weight:bold', 'color:#888')
    return json.data ?? json
  } catch (err: any) {
    if (!err.message?.match(/^\d{3}$/)) {
      const ms = Math.round(performance.now() - start)
      console.log(`%c[API] %c${method} ${path} %cERROR %c${ms}ms`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold', 'color:#888', err.message)
    }
    throw err
  }
}

export const api = {
  get: <T = any>(p: string) => req<T>('GET', p),
  post: <T = any>(p: string, b?: any) => req<T>('POST', p, b),
  put: <T = any>(p: string, b?: any) => req<T>('PUT', p, b),
  del: <T = any>(p: string) => req<T>('DELETE', p),
}

export const dramaAPI = {
  list: () => api.get<{ items: any[] }>('/dramas'),
  get: (id: number) => api.get(`/dramas/${id}`),
  create: (data: any) => api.post('/dramas', data),
  update: (id: number, data: any) => api.put(`/dramas/${id}`, data),
  del: (id: number) => api.del(`/dramas/${id}`),
}

export const episodeAPI = {
  create: (data: any) => api.post('/episodes', data),
  update: (id: number, data: any) => api.put(`/episodes/${id}`, data),
  del: (id: number) => api.del(`/episodes/${id}`),
  characters: (id: number) => api.get(`/episodes/${id}/characters`),
  scenes: (id: number) => api.get(`/episodes/${id}/scenes`),
  props: (id: number) => api.get(`/episodes/${id}/props`),
  storyboards: (id: number) => api.get(`/episodes/${id}/storyboards`),
  pipelineStatus: (id: number) => api.get(`/episodes/${id}/pipeline-status`),
}

export const storyboardAPI = {
  create: (data: any) => api.post('/storyboards', data),
  update: (id: number, data: any) => api.put(`/storyboards/${id}`, data),
  del: (id: number) => api.del(`/storyboards/${id}`),
}

export const characterAPI = {
  update: (id: number, data: any) => api.put(`/characters/${id}`, data),
  generatePrompt: (id: number, episodeId: number, force = false) => api.post(`/characters/${id}/generate-prompt`, { episode_id: episodeId, force }),
  generateImage: (id: number, episodeId: number, model?: string, configId?: number) => api.post(`/characters/${id}/generate-image`, { episode_id: episodeId, model: model || undefined, config_id: configId || undefined }),
  batchImages: (ids: number[], episodeId: number, model?: string, configId?: number) => api.post('/characters/batch-generate-images', { character_ids: ids, episode_id: episodeId, model: model || undefined, config_id: configId || undefined }),
}

export const sceneAPI = {
  update: (id: number, data: any) => api.put(`/scenes/${id}`, data),
  generatePrompt: (id: number, episodeId: number, force = false) => api.post(`/scenes/${id}/generate-prompt`, { episode_id: episodeId, force }),
  generateImage: (id: number, episodeId: number, model?: string, configId?: number) => api.post(`/scenes/${id}/generate-image`, { episode_id: episodeId, model: model || undefined, config_id: configId || undefined }),
}

export const propAPI = {
  update: (id: number, data: any) => api.put(`/props/${id}`, data),
  generatePrompt: (id: number, episodeId: number, force = false) => api.post(`/props/${id}/generate-prompt`, { episode_id: episodeId, force }),
  generateImage: (id: number, episodeId: number, model?: string, configId?: number) => api.post(`/props/${id}/generate-image`, { episode_id: episodeId, model: model || undefined, config_id: configId || undefined }),
}

export const imageAPI = {
  generate: (d: any) => api.post('/images', d),
  list: (params?: { drama_id?: number; storyboard_id?: number }) => {
    const query = new URLSearchParams()
    if (params?.drama_id) query.set('drama_id', String(params.drama_id))
    if (params?.storyboard_id) query.set('storyboard_id', String(params.storyboard_id))
    return api.get(`/images${query.size ? `?${query.toString()}` : ''}`)
  },
}
export const videoAPI = {
  generate: (d: any) => api.post('/videos', d),
  get: (id: number) => api.get(`/videos/${id}`),
}

async function uploadReq<T = any>(path: string, file: File): Promise<T> {
  const fd = new FormData()
  fd.append('file', file)
  console.log(`%c[API] %cPOST %c${path} %c${file.name}`, 'color:#888', 'color:#4fc3f7;font-weight:bold', 'color:#ccc', 'color:#888')
  const resp = await fetch(`${BASE}${path}`, { method: 'POST', body: fd })
  const json = await resp.json()
  if (!resp.ok || (json.code && json.code >= 400)) {
    console.log(`%c[API] %cPOST ${path} %c${resp.status}`, 'color:#888', 'color:#ef5350', 'color:#ef5350;font-weight:bold')
    throw new Error(json.message || `${resp.status}`)
  }
  return json.data ?? json
}

export const uploadAPI = {
  image: (f: File) => uploadReq<{ url: string; path: string }>('/upload/image', f),
  video: (f: File) => uploadReq<{ url: string; path: string }>('/upload/video', f),
  audio: (f: File) => uploadReq<{ url: string; path: string }>('/upload/audio', f),
}
export const mergeAPI = {
  merge: (epId: number) => api.post(`/merge/episodes/${epId}/merge`),
  status: (epId: number) => api.get(`/merge/episodes/${epId}/merge`),
}
export const aiConfigAPI = {
  list: (t?: string) => api.get(`/ai-configs${t ? `?service_type=${t}` : ''}`),
  create: (d: any) => api.post('/ai-configs', d),
  update: (id: number, d: any) => api.put(`/ai-configs/${id}`, d),
  del: (id: number) => api.del(`/ai-configs/${id}`),
  test: (d: any) => api.post('/ai-configs/test', d),
}

export const agentConfigAPI = {
  list: () => api.get('/agent-configs'),
  get: (id: number) => api.get(`/agent-configs/${id}`),
  create: (d: any) => api.post('/agent-configs', d),
  update: (id: number, d: any) => api.put(`/agent-configs/${id}`, d),
  del: (id: number) => api.del(`/agent-configs/${id}`),
}

export const skillsAPI = {
  list: () => api.get('/skills'),
  get: (id: string) => api.get(`/skills/${id}`),
  create: (data: { id: string; name: string; description?: string }) => api.post('/skills', data),
  update: (id: string, content: string) => api.put(`/skills/${id}`, { content }),
  del: (id: string) => api.del(`/skills/${id}`),
}

export const stylePresetAPI = {
  list: (all = false) => api.get(`/style-presets${all ? '?all=1' : ''}`),
  create: (d: any) => api.post('/style-presets', d),
  update: (id: number, d: any) => api.put(`/style-presets/${id}`, d),
  del: (id: number) => api.del(`/style-presets/${id}`),
}
