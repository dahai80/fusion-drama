/**
 * API 客户端 — 统一的请求封装
 */
const BASE = '/api/v1'

async function request<T = any>(method: string, path: string, body?: any): Promise<T> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) opts.body = JSON.stringify(body)

  const resp = await fetch(`${BASE}${path}`, opts)
  const json = await resp.json()

  if (!resp.ok || (json.code && json.code >= 400)) {
    throw new Error(json.message || `Request failed: ${resp.status}`)
  }
  return json.data ?? json
}

export const api = {
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body?: any) => request<T>('POST', path, body),
  put: <T = any>(path: string, body?: any) => request<T>('PUT', path, body),
  del: <T = any>(path: string) => request<T>('DELETE', path),
}

// ===== Drama =====
export const dramaAPI = {
  list: (params?: Record<string, any>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : ''
    return api.get<{ items: any[]; pagination: any }>(`/dramas${qs}`)
  },
  get: (id: number) => api.get(`/dramas/${id}`),
  create: (data: any) => api.post('/dramas', data),
  update: (id: number, data: any) => api.put(`/dramas/${id}`, data),
  del: (id: number) => api.del(`/dramas/${id}`),
}

// ===== Episode =====
export const episodeAPI = {
  update: (id: number, data: any) => api.put(`/episodes/${id}`, data),
  getStoryboards: (episodeId: number) => api.get(`/episodes/${episodeId}/storyboards`),
}

// ===== Storyboard =====
export const storyboardAPI = {
  create: (data: any) => api.post('/storyboards', data),
  update: (id: number, data: any) => api.put(`/storyboards/${id}`, data),
  del: (id: number) => api.del(`/storyboards/${id}`),
}

// ===== AI Config =====
export const aiConfigAPI = {
  list: (serviceType?: string) => {
    const qs = serviceType ? `?service_type=${serviceType}` : ''
    return api.get<any[]>(`/ai-configs${qs}`)
  },
  create: (data: any) => api.post('/ai-configs', data),
  update: (id: number, data: any) => api.put(`/ai-configs/${id}`, data),
  del: (id: number) => api.del(`/ai-configs/${id}`),
  providers: () => api.get<any[]>('/ai-providers'),
}

// ===== Agent SSE =====
export async function* streamAgent(agentType: string, message: string, dramaId: number, episodeId: number) {
  const resp = await fetch(`${BASE}/agent/${agentType}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, drama_id: dramaId, episode_id: episodeId }),
  })
  if (!resp.ok || !resp.body) throw new Error('Agent request failed')

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try { yield JSON.parse(line.slice(6)) } catch {}
      }
    }
  }
}
