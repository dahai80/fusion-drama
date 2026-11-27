/**
 * Programmable provider — user-defined image/video adapters
 *
 * JS code is stored in the DB (custom_providers table), evaluated in the sandbox and wrapped into a standard
 * ImageProviderAdapter / VideoProviderAdapter, then hot-registered into the adapter registry,
 * with provider id `custom:<name>`. Any vendor can be onboarded without code changes or restarts.
 * Sandbox evaluation/validation lives in custom-provider-sandbox.ts (pure module, no DB dependency).
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

// Reused by routes (immediate validation on create/update)
export { evaluateCustomProviderCode, validateCustomProviderExports }

/** Adapter cache: the same id + code hash is evaluated only once; invalidated automatically when code is edited */
const adapterCache = new Map<string, { adapter: any; hash: string }>()

function cacheKey(id: number, type: string) {
    return `${type}:${id}`
}

async function loadCustomProvider(name: string, type: string) {
    const [row] = await db.select().from(schema.customProviders)
        .where(eq(schema.customProviders.name, name))
    // i18n: user-facing
    if (!row) throw new Error(`自定义 provider "${name}" 不存在`)
    // i18n: user-facing
    if (row.type !== type) throw new Error(`自定义 provider "${name}" 类型是 ${row.type}，此处需要 ${type}`)
    // i18n: user-facing
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

/** Dry run: evaluate + validate + call buildGenerateRequest with sample input; returns the built request (headers redacted) */
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

/** Get the custom image adapter for a provider id (`custom:<name>`) */
export async function getCustomImageAdapter(provider: string): Promise<ImageProviderAdapter> {
    const row = await loadCustomProvider(customProviderName(provider), 'image')
    return buildCachedAdapter(row) as ImageProviderAdapter
}

/** Get the custom video adapter for a provider id (`custom:<name>`) */
export async function getCustomVideoAdapter(provider: string): Promise<VideoProviderAdapter> {
    const row = await loadCustomProvider(customProviderName(provider), 'video')
    return buildCachedAdapter(row) as VideoProviderAdapter
}

/** Invalidate the cache after CRUD (edit/disable/delete take effect immediately) */
export function invalidateCustomProviderCache(id: number, type: string) {
    adapterCache.delete(cacheKey(id, type))
}
