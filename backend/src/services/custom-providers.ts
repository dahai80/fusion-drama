/**
 * 可编程 Provider — 用户自定义图片/视频适配器
 *
 * JS 代码存 DB（custom_providers 表），沙箱求值后包装成标准
 * ImageProviderAdapter / VideoProviderAdapter，热注册进适配器注册表，
 * provider 标识为 `custom:<name>`。无需改代码、无需重启即可接入任意厂商。
 * 沙箱求值/校验见 custom-provider-sandbox.ts（纯模块，无 DB 依赖）。
 */
import crypto from 'node:crypto'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import type { ImageProviderAdapter, VideoProviderAdapter } from './adapters/types.js'
import {
    evaluateCustomProviderCode,
    validateCustomProviderExports,
    wrapAdapterMethods,
} from './custom-provider-sandbox.js'

export const CUSTOM_PROVIDER_PREFIX = 'custom:'

export function isCustomProvider(provider: string | null | undefined): boolean {
    return typeof provider === 'string' && provider.toLowerCase().startsWith(CUSTOM_PROVIDER_PREFIX)
}

export function customProviderName(provider: string): string {
    return provider.slice(CUSTOM_PROVIDER_PREFIX.length).trim()
}

// 供路由复用（创建/更新时即时校验）
export { evaluateCustomProviderCode, validateCustomProviderExports }

/** 适配器缓存：同 id + 代码哈希只求值一次；编辑代码后自动失效 */
const adapterCache = new Map<string, { adapter: any; hash: string }>()

function cacheKey(id: number, type: string) {
    return `${type}:${id}`
}

async function loadCustomProvider(name: string, type: string) {
    const [row] = await db.select().from(schema.customProviders)
        .where(eq(schema.customProviders.name, name))
    if (!row) throw new Error(`自定义 provider "${name}" 不存在`)
    if (row.type !== type) throw new Error(`自定义 provider "${name}" 类型是 ${row.type}，此处需要 ${type}`)
    if (!row.enabled) throw new Error(`自定义 provider "${name}" 已停用`)
    return row
}

function buildCachedAdapter(row: typeof schema.customProviders.$inferSelect) {
    const key = cacheKey(row.id, row.type)
    const hash = crypto.createHash('sha256').update(row.code).digest('hex').slice(0, 16)
    const cached = adapterCache.get(key)
    if (cached && cached.hash === hash) return cached.adapter
    const mod = evaluateCustomProviderCode(row.code, row.name)
    const fns = validateCustomProviderExports(mod, row.type)
    const adapter = { provider: `custom:${row.name}`, ...wrapAdapterMethods(mod, fns, row.name) }
    adapterCache.set(key, { adapter, hash })
    return adapter
}

/** 干跑：求值 + 校验 + 用样例入参调用 buildGenerateRequest，返回构建出的请求（脱敏 headers） */
export async function dryRunCustomProvider(opts: { code: string; name: string; type: string; baseUrl?: string; apiKey?: string; model?: string }) {
    const mod = evaluateCustomProviderCode(opts.code, opts.name)
    const fns = validateCustomProviderExports(mod, opts.type)
    const config = { provider: `custom:${opts.name}`, baseUrl: opts.baseUrl || 'https://example.com', apiKey: opts.apiKey || 'test-key', model: opts.model || 'test-model' }
    const sampleRecord = opts.type === 'image'
        ? { id: 0, model: config.model, prompt: 'a cat', size: '1024x1024', frameType: 'composed' }
        : { id: 0, model: config.model, prompt: 'a cat walking', duration: 5, aspectRatio: '16:9' }
    const req = wrapAdapterMethods(mod, fns, opts.name).buildGenerateRequest(config, sampleRecord)
    const headers: Record<string, string> = {}
    for (const [k, v] of Object.entries(req.headers || {})) {
        headers[k] = /authorization|api-?key|token/i.test(k) ? '••••' : String(v)
    }
    return { ok: true, exports: fns, request: { url: req.url, method: req.method, headers, body: req.body ?? null } }
}

/** 按 provider 标识取自定义图片适配器（`custom:<name>`） */
export async function getCustomImageAdapter(provider: string): Promise<ImageProviderAdapter> {
    const row = await loadCustomProvider(customProviderName(provider), 'image')
    return buildCachedAdapter(row) as ImageProviderAdapter
}

/** 按 provider 标识取自定义视频适配器（`custom:<name>`） */
export async function getCustomVideoAdapter(provider: string): Promise<VideoProviderAdapter> {
    const row = await loadCustomProvider(customProviderName(provider), 'video')
    return buildCachedAdapter(row) as VideoProviderAdapter
}

/** CRUD 后失效缓存（编辑/停用/删除后立即生效） */
export function invalidateCustomProviderCache(id: number, type: string) {
    adapterCache.delete(cacheKey(id, type))
}
