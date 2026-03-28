const BASE = '/api/v1'

async function req<T = any>(method: string, path: string, body?: any): Promise<T> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } }
  if (body) opts.body = JSON.stringify(body)
  const resp = await fetch(`${BASE}${path}`, opts)
  const json = await resp.json()
  if (!resp.ok || (json.code && json.code >= 400)) throw new Error(json.message || `${resp.status}`)
  return json.data ?? json
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
  update: (id: number, data: any) => api.put(`/episodes/${id}`, data),
  storyboards: (id: number) => api.get(`/episodes/${id}/storyboards`),
  pipelineStatus: (id: number) => api.get(`/episodes/${id}/pipeline-status`),
}

export const storyboardAPI = {
  create: (data: any) => api.post('/storyboards', data),
  update: (id: number, data: any) => api.put(`/storyboards/${id}`, data),
}

export const characterAPI = {
  update: (id: number, data: any) => api.put(`/characters/${id}`, data),
  voiceSample: (id: number) => api.post(`/characters/${id}/generate-voice-sample`),
}

export const imageAPI = { generate: (d: any) => api.post('/images', d) }
export const videoAPI = { generate: (d: any) => api.post('/videos', d) }
export const composeAPI = {
  shot: (id: number) => api.post(`/compose/storyboards/${id}/compose`),
  all: (epId: number) => api.post(`/compose/episodes/${epId}/compose-all`),
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
}

export async function* streamAgent(type: string, msg: string, dramaId: number, episodeId: number) {
  const r = await fetch(`${BASE}/agent/${type}/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, drama_id: dramaId, episode_id: episodeId }),
  })
  if (!r.ok || !r.body) throw new Error('Agent failed')
  const reader = r.body.getReader(), dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n'); buf = lines.pop() || ''
    for (const l of lines) {
      if (l.startsWith('data: ')) try { yield JSON.parse(l.slice(6)) } catch {}
    }
  }
}
