import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { success, notFound, created, badRequest, now } from '../utils/response.js'
import { toSnakeCase } from '../utils/transform.js'
import { logTaskError, logTaskProgress, logTaskSuccess } from '../utils/task-logger.js'
import {
    dryRunCustomProvider,
    evaluateCustomProviderCode,
    invalidateCustomProviderCache,
    validateCustomProviderExports,
} from '../services/custom-providers.js'

const app = new Hono()

/** name 规范：小写字母/数字/中划线，作为 provider 标识 `custom:<name>` 的组成部分 */
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

function parseType(v: any): 'image' | 'video' | null {
    return v === 'image' || v === 'video' ? v : null
}

// GET /custom-providers — 列表（不含代码全文，编辑时单独取）
app.get('/', async (c) => {
    const rows = await db.select().from(schema.customProviders)
    const parsed = rows.map(r => ({
        ...toSnakeCase(r),
        code_preview: (r.code || '').slice(0, 80),
        code: undefined,
    }))
    return success(c, parsed)
})

// GET /custom-providers/:id — 单条（编辑用，含代码全文）
app.get('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const [row] = await db.select().from(schema.customProviders)
        .where(eq(schema.customProviders.id, id))
    if (!row) return notFound(c)
    return success(c, toSnakeCase(row))
})

// POST /custom-providers — 创建（代码即时求值校验，坏代码不落库）
app.post('/', async (c) => {
    const body = await c.req.json()
    const name = String(body.name || '').trim().toLowerCase()
    const type = parseType(body.type)
    const code = String(body.code || '')
    if (!NAME_RE.test(name)) {
        return badRequest(c, 'name 须为小写字母/数字/中划线（≤64 字符）')
    }
    if (!type) return badRequest(c, 'type 须为 image 或 video')
    if (!code.trim()) return badRequest(c, 'code 不能为空')

    const [dup] = await db.select().from(schema.customProviders)
        .where(eq(schema.customProviders.name, name))
    if (dup) return badRequest(c, `自定义 provider "${name}" 已存在`)

    try {
        const mod = evaluateCustomProviderCode(code, name)
        validateCustomProviderExports(mod, type)
    } catch (err: any) {
        logTaskError('CustomProvider', 'create-validate-failed', { name, error: err.message })
        return badRequest(c, `代码校验失败: ${err.message}`)
    }

    const ts = now()
    const res = await db.insert(schema.customProviders).values({
        name,
        type,
        code,
        enabled: body.enabled !== false,
        createdAt: ts,
        updatedAt: ts,
    })
    const id = getInsertId(res)
    logTaskSuccess('CustomProvider', 'created', { id, name, type })
    return created(c, { id, name, type })
})

// PUT /custom-providers/:id — 更新（代码变更即时校验 + 缓存失效）
app.put('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    const [existing] = await db.select().from(schema.customProviders)
        .where(eq(schema.customProviders.id, id))
    if (!existing) return notFound(c)

    const updates: Record<string, any> = { updatedAt: now() }
    const type = 'type' in body ? parseType(body.type) : (existing.type as 'image' | 'video')
    if ('type' in body && !type) return badRequest(c, 'type 须为 image 或 video')
    if (type) updates.type = type

    if ('code' in body) {
        const code = String(body.code || '')
        if (!code.trim()) return badRequest(c, 'code 不能为空')
        try {
            const mod = evaluateCustomProviderCode(code, existing.name)
            validateCustomProviderExports(mod, type || existing.type)
        } catch (err: any) {
            logTaskError('CustomProvider', 'update-validate-failed', { id, error: err.message })
            return badRequest(c, `代码校验失败: ${err.message}`)
        }
        updates.code = code
    }
    if ('enabled' in body) updates.enabled = !!body.enabled

    await db.update(schema.customProviders).set(updates)
        .where(eq(schema.customProviders.id, id))
    invalidateCustomProviderCache(id, String(type))
    logTaskProgress('CustomProvider', 'updated', { id, fields: Object.keys(updates).filter(k => k !== 'updatedAt') })
    return success(c)
})

// DELETE /custom-providers/:id — 删除（引用它的 AI 配置由用户自行清理）
app.delete('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const [existing] = await db.select().from(schema.customProviders)
        .where(eq(schema.customProviders.id, id))
    if (existing) invalidateCustomProviderCache(id, existing.type)
    await db.delete(schema.customProviders).where(eq(schema.customProviders.id, id))
    logTaskProgress('CustomProvider', 'deleted', { id, name: existing?.name })
    return success(c)
})

// POST /custom-providers/test — 干跑（未保存草稿）：求值 + 校验 + 样例请求构建
// 固定路由必须挂在 /:id 之前（Hono 按注册顺序匹配）
app.post('/test', async (c) => {
    const body = await c.req.json()
    const type = parseType(body.type)
    if (!type) return badRequest(c, 'type 须为 image 或 video')
    const code = String(body.code || '')
    if (!code.trim()) return badRequest(c, 'code 不能为空')
    const name = String(body.name || 'draft').trim().toLowerCase()
    try {
        const result = await dryRunCustomProvider({
            code,
            name,
            type,
            baseUrl: body.base_url,
            apiKey: body.api_key,
            model: Array.isArray(body.model) ? body.model[0] : body.model,
        })
        logTaskSuccess('CustomProvider', 'dry-run-ok', { name, type })
        return success(c, result)
    } catch (err: any) {
        logTaskError('CustomProvider', 'dry-run-failed', { name, type, error: err.message })
        return success(c, { ok: false, error: err.message })
    }
})

// POST /custom-providers/:id/test — 已存条目干跑（按 id 取代码）
app.post('/:id/test', async (c) => {
    const id = Number(c.req.param('id'))
    const [row] = await db.select().from(schema.customProviders)
        .where(eq(schema.customProviders.id, id))
    if (!row) return notFound(c)
    const body = await c.req.json().catch(() => ({}))
    try {
        const result = await dryRunCustomProvider({
            code: row.code,
            name: row.name,
            type: row.type,
            baseUrl: body.base_url,
            apiKey: body.api_key,
            model: Array.isArray(body.model) ? body.model[0] : body.model,
        })
        logTaskSuccess('CustomProvider', 'dry-run-ok', { id, name: row.name })
        return success(c, result)
    } catch (err: any) {
        logTaskError('CustomProvider', 'dry-run-failed', { id, name: row.name, error: err.message })
        return success(c, { ok: false, error: err.message })
    }
})

export default app
