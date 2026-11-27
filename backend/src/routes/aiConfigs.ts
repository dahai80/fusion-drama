import { Hono } from 'hono'
import { db, getInsertId, schema } from '../db/index.js'
import { success, notFound, created, badRequest, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { joinProviderUrl } from '../services/adapters/url.js'
import { isValidProvider, parseConfigTemperature } from '../services/ai.js'
import { isCustomProvider, customProviderName } from '../services/custom-providers.js'
import { and, eq } from 'drizzle-orm'

/**
 * custom:<name> config validity: the corresponding custom_providers row must exist, be enabled,
 * and match the service type — so a missing provider is caught up front instead of at
 * image/video generation time
 */
async function assertCustomProviderUsable(serviceType: string, provider: string) {
  if (!isCustomProvider(provider)) return
  const name = customProviderName(provider.toLowerCase())
  const [row] = await db.select().from(schema.customProviders)
    .where(and(eq(schema.customProviders.name, name), eq(schema.customProviders.type, serviceType)))
  // i18n: user-facing
  if (!row) throw new Error(`自定义 provider "${name}" 不存在（类型 ${serviceType}）`)
  // i18n: user-facing
  if (!row.enabled) throw new Error(`自定义 provider "${name}" 已停用，请先在设置中启用`)
}
import { redactUrl, logTaskError, logTaskProgress, logTaskSuccess } from '../utils/task-logger.js'

const app = new Hono()

/** Normalize the temperature input: null = unset; valid range 0~2; invalid values throw */
function normalizeTemperature(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0 || n > 2) throw new Error('invalid temperature')
  return n
}

/** Surface the temperature inside the settings JSON as a top-level field for easy frontend read/write */
function withParsedFields(r: any, { mask = false } = {}) {
  const parsed: Record<string, any> = {
    ...toSnakeCase(r),
    model: safeParseModels(r.model),
    temperature: parseConfigTemperature(r.settings),
  }
  if (mask) {
    // The plaintext key never leaves the backend: responses carry only the last 4 digits + has_key;
    // leaving the edit field empty = keep the original key
    parsed.api_key = r.apiKey ? `••••${r.apiKey.slice(-4)}` : ''
    parsed.has_key = !!r.apiKey
  }
  return parsed
}

/** model list parse guard: dirty data ("null"/non-array) must not poison getActiveConfig */
function safeParseModels(raw: any): any[] {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(v) ? v.filter((m) => typeof m === 'string') : []
  } catch {
    return []
  }
}

function bearerHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function geminiHeaders(apiKey?: string, withJson = false) {
  const headers: Record<string, string> = {}
  if (apiKey) {
    headers['x-goog-api-key'] = apiKey
  }
  if (withJson) headers['Content-Type'] = 'application/json'
  return headers
}

function buildProbe(serviceType: string, provider: string, baseUrl: string, model?: string, apiKey?: string) {
  const p = provider.toLowerCase()
  const m = model || ''

  if (p === 'gemini') {
    // Probes uniformly use generateContent: it is what the text runtime (AI SDK) uses, and both
    // official and relay hosts support it; many relays do not configure the interactions endpoint,
    // so probing it would falsely report 500.
    // Use a minimal valid request body rather than an empty one — an empty body triggers false
    // upstream auth-failure reports on some relays
    const modelName = m || 'gemini-3.1-pro-preview'
    const url = new URL(joinProviderUrl(baseUrl, '/v1beta', `/models/${modelName}:generateContent`))
    if (apiKey) url.searchParams.set('key', apiKey)
    return {
      method: 'POST',
      url: url.toString(),
      headers: geminiHeaders(apiKey, true),
      body: { contents: [{ parts: [{ text: 'hi' }] }] },
    }
  }

  if (p === 'openai') {
    return {
      method: 'GET',
      url: joinProviderUrl(baseUrl, '/v1', '/models'),
      headers: bearerHeaders(apiKey),
      body: undefined,
    }
  }

  if (p === 'volcengine') {
    const path = serviceType === 'video'
      ? '/contents/generations/tasks'
      : serviceType === 'text'
        ? '/chat/completions'
        : '/images/generations'
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v3', path),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'minimax') {
    // MiniMax only offers video; probe auth/endpoint reachability with an empty request body
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/v2', '/video_generation'),
      headers: bearerHeaders(apiKey, true),
      body: {},
    }
  }

  if (p === 'aliyun') {
    // Wan 3.0 only supports async submission; an empty request body creates no billed task and
    // is used only to verify that the regional endpoint and auth are reachable.
    return {
      method: 'POST',
      url: joinProviderUrl(baseUrl, '/api/v1', '/services/aigc/video-generation/video-synthesis'),
      headers: {
        ...bearerHeaders(apiKey, true),
        'X-DashScope-Async': 'enable',
      },
      body: {},
    }
  }

  return {
    method: 'GET',
    url: joinProviderUrl(baseUrl, '', m ? `/${m}` : '/'),
    headers: bearerHeaders(apiKey),
    body: undefined,
  }
}

// GET /ai-configs?service_type=text
app.get('/', async (c) => {
  const serviceType = c.req.query('service_type')
  let rows = await db.select().from(schema.aiServiceConfigs)
  if (serviceType) rows = rows.filter(r => r.serviceType === serviceType)

  const parsed = rows.map((r) => withParsedFields(r, { mask: true }))
  return success(c, parsed)
})

// POST /ai-configs
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()

  // Validate required fields
  // i18n: user-facing
  if (!body.service_type || !body.provider) {
    // i18n: user-facing
    return badRequest(c, '需要 service_type 与 provider')
  }
  // i18n: user-facing
  if (!isValidProvider(body.service_type, body.provider)) {
    // i18n: user-facing
    return badRequest(c, '不支持的 service_type/provider')
  }
  try {
    await assertCustomProviderUsable(body.service_type, body.provider)
  } catch (err: any) {
    return badRequest(c, err.message)
  }

  let temperature: number | null = null
  if ('temperature' in body) {
    try {
      temperature = normalizeTemperature(body.temperature)
    } catch {
      // i18n: user-facing
      return badRequest(c, 'temperature 须为 0 到 2 之间的数字')
    }
  }

  const modelList = body.model ?? []
  // i18n: user-facing
  if (!Array.isArray(modelList) || !modelList.every((m: any) => typeof m === 'string')) {
    // i18n: user-facing
    return badRequest(c, 'model 须为字符串数组')
  }

  const res = await db.insert(schema.aiServiceConfigs).values({
    serviceType: body.service_type,
    provider: body.provider,
    name: body.name || `${body.provider}-${body.service_type}`,
    baseUrl: body.base_url || '',
    apiKey: body.api_key || '',
    model: JSON.stringify(modelList),
    priority: body.priority || 0,
    isActive: true,
    settings: temperature !== null ? JSON.stringify({ temperature }) : null,
    createdAt: ts,
    updatedAt: ts,
  })

  const [row] = await db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.id, getInsertId(res)))

  return created(c, withParsedFields(row, { mask: true }))
})

// POST /ai-configs/test
app.post('/test', async (c) => {
  const body = await c.req.json()
  // i18n: user-facing
  if (!body.service_type || !body.provider || !body.base_url) {
    // i18n: user-facing
    return badRequest(c, '需要 service_type、provider 与 base_url')
  }
  // i18n: user-facing
  if (!isValidProvider(body.service_type, body.provider)) {
    // i18n: user-facing
    return badRequest(c, '不支持的 service_type/provider')
  }

  // F1/B11 mask coordination: GET /ai-configs returns a masked key, so when the frontend tests
  // a saved config it cannot send back a plaintext key — when config_id is passed, probe using
  // the stored key looked up by id (body.api_key is ignored)
  let apiKey = body.api_key
  if (body.config_id) {
    const [row] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, Number(body.config_id)))
    // i18n: user-facing
    if (!row) return badRequest(c, '配置不存在')
    if (row.apiKey) apiKey = row.apiKey
  }
  const model = Array.isArray(body.model) ? body.model[0] : body.model
  const probe = buildProbe(body.service_type, body.provider, body.base_url, model, apiKey)
  const probeUrl = redactUrl(probe.url)

  logTaskProgress('AIConfig', 'probe-start', {
    serviceType: body.service_type,
    provider: body.provider,
    method: probe.method,
    url: probeUrl,
  })

  try {
    const resp = await fetch(probe.url, {
      method: probe.method,
      headers: probe.headers,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
    })
    const text = await resp.text()
    const reachable = [200, 204, 400, 401, 403].includes(resp.status)
    const payload = {
      ok: resp.ok,
      reachable,
      status: resp.status,
      status_text: resp.statusText,
      method: probe.method,
      url: probeUrl,
      // i18n: user-facing
      message: reachable
        // i18n: user-facing
        ? (resp.ok ? '端点可访问，认证与路径基本正常' : '端点已响应，请根据状态码判断认证或路径是否正确')
        // i18n: user-facing
        : '端点未按预期响应，请检查 Base URL 和代理前缀',
      response_preview: text.slice(0, 240),
    }
    if (reachable) {
      logTaskSuccess('AIConfig', 'probe-done', {
        provider: body.provider,
        status: resp.status,
        url: probeUrl,
      })
    } else {
      logTaskError('AIConfig', 'probe-unexpected', {
        provider: body.provider,
        status: resp.status,
        url: probeUrl,
      })
    }
    return success(c, payload)
  } catch (error: any) {
    logTaskError('AIConfig', 'probe-failed', {
      provider: body.provider,
      url: probeUrl,
      error: error.message,
    })
    return success(c, {
      ok: false,
      reachable: false,
      method: probe.method,
      url: probeUrl,
      // i18n: user-facing
      message: error.message || '请求失败',
      response_preview: '',
    })
  }
})

// GET /ai-configs/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  if (!row) return notFound(c)
  return success(c, withParsedFields(row, { mask: true }))
})

// PUT /ai-configs/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const [existing] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  if (!existing) return notFound(c)

  const serviceType = 'service_type' in body ? body.service_type : existing.serviceType
  const provider = 'provider' in body ? body.provider : existing.provider
  // i18n: user-facing
  if (!isValidProvider(serviceType, provider)) {
    // i18n: user-facing
    return badRequest(c, '不支持的 service_type/provider')
  }
  try {
    await assertCustomProviderUsable(serviceType, provider)
  } catch (err: any) {
    return badRequest(c, err.message)
  }

  const updates: Record<string, any> = { updatedAt: now() }

  if ('service_type' in body) updates.serviceType = body.service_type
  if ('provider' in body) updates.provider = body.provider
  if ('name' in body) updates.name = body.name
  if ('base_url' in body) updates.baseUrl = body.base_url
  // Empty value = keep the original key (plaintext never leaves the backend; an empty edit field keeps it)
  if ('api_key' in body) updates.apiKey = body.api_key ? body.api_key : existing.apiKey
  // model must be a string array: dirty data (null etc.) would poison getActiveConfig and break the whole generation pipeline
  if ('model' in body) {
    // i18n: user-facing
    if (!Array.isArray(body.model) || !body.model.every((m: any) => typeof m === 'string')) {
      // i18n: user-facing
      return badRequest(c, 'model 须为字符串数组')
    }
    updates.model = JSON.stringify(body.model)
  }
  if ('priority' in body) updates.priority = body.priority
  if ('is_active' in body) updates.isActive = body.is_active
  if ('temperature' in body) {
    let temperature: number | null
    try {
      temperature = normalizeTemperature(body.temperature)
    } catch {
      // i18n: user-facing
      return badRequest(c, 'temperature 须为 0 到 2 之间的数字')
    }
    // Merge with existing settings; a cleared temperature is removed from the JSON
    let settings: Record<string, any> = {}
    try { settings = existing.settings ? JSON.parse(existing.settings) : {} } catch { settings = {} }
    if (temperature === null) delete settings.temperature
    else settings.temperature = temperature
    updates.settings = Object.keys(settings).length ? JSON.stringify(settings) : null
  }

  await db.update(schema.aiServiceConfigs).set(updates).where(eq(schema.aiServiceConfigs.id, id))
  return success(c)
})

// DELETE /ai-configs/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.delete(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, id))
  return success(c)
})

// GET /ai-providers
export const aiProviders = new Hono()
aiProviders.get('/', async (c) => {
  const rows = await db.select().from(schema.aiServiceProviders)
  const parsed = rows.map(r => ({
    ...toSnakeCase(r),
    preset_models: r.presetModels ? JSON.parse(r.presetModels) : [],
  }))
  return success(c, parsed)
})

export default app
