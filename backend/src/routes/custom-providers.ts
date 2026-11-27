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

/** name spec: lowercase letters/digits/hyphens, part of the provider id `custom:<name>` */
const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

function parseType(v: any): 'image' | 'video' | null {
    return v === 'image' || v === 'video' ? v : null
}

// GET /custom-providers — list (no full code; fetched separately for editing)
app.get('/', async (c) => {
    const rows = await db.select().from(schema.customProviders)
    const parsed = rows.map(r => ({
        ...toSnakeCase(r),
        code_preview: (r.code || '').slice(0, 80),
        code: undefined,
    }))
    return success(c, parsed)
})

// GET /custom-providers/:id — single entry (for editing, includes full code)
app.get('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const [row] = await db.select().from(schema.customProviders)
        .where(eq(schema.customProviders.id, id))
    if (!row) return notFound(c)
    return success(c, toSnakeCase(row))
})

// POST /custom-providers — create (code evaluated/validated on the fly; bad code is never persisted)
app.post('/', async (c) => {
    const body = await c.req.json()
    const name = String(body.name || '').trim().toLowerCase()
    const type = parseType(body.type)
    const code = String(body.code || '')
    if (!NAME_RE.test(name)) {
        return badRequest(c, 'name must be lowercase letters/digits/hyphens (<=64 characters)')
    }
    if (!type) return badRequest(c, 'type must be image or video')
    if (!code.trim()) return badRequest(c, 'code must not be empty')

    const [dup] = await db.select().from(schema.customProviders)
        .where(eq(schema.customProviders.name, name))
    if (dup) return badRequest(c, `Custom provider "${name}" already exists`)

    try {
        const mod = evaluateCustomProviderCode(code, name)
        validateCustomProviderExports(mod, type)
    } catch (err: any) {
        logTaskError('CustomProvider', 'create-validate-failed', { name, error: err.message })
        return badRequest(c, `Code validation failed: ${err.message}`)
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

// PUT /custom-providers/:id — update (code changes validated on the fly + cache invalidation)
app.put('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const body = await c.req.json()
    const [existing] = await db.select().from(schema.customProviders)
        .where(eq(schema.customProviders.id, id))
    if (!existing) return notFound(c)

    const updates: Record<string, any> = { updatedAt: now() }
    const type = 'type' in body ? parseType(body.type) : (existing.type as 'image' | 'video')
    if ('type' in body && !type) return badRequest(c, 'type must be image or video')
    if (type) updates.type = type

    if ('code' in body) {
        const code = String(body.code || '')
        if (!code.trim()) return badRequest(c, 'code must not be empty')
        try {
            const mod = evaluateCustomProviderCode(code, existing.name)
            validateCustomProviderExports(mod, type || existing.type)
        } catch (err: any) {
            logTaskError('CustomProvider', 'update-validate-failed', { id, error: err.message })
            return badRequest(c, `Code validation failed: ${err.message}`)
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

// DELETE /custom-providers/:id — delete (AI configs referencing it are cleaned up by the user)
app.delete('/:id', async (c) => {
    const id = Number(c.req.param('id'))
    const [existing] = await db.select().from(schema.customProviders)
        .where(eq(schema.customProviders.id, id))
    if (existing) invalidateCustomProviderCache(id, existing.type)
    await db.delete(schema.customProviders).where(eq(schema.customProviders.id, id))
    logTaskProgress('CustomProvider', 'deleted', { id, name: existing?.name })
    return success(c)
})

// POST /custom-providers/test — dry run (unsaved draft): evaluate + validate + sample request build
// Fixed routes must be registered before /:id (Hono matches in registration order)
app.post('/test', async (c) => {
    const body = await c.req.json()
    const type = parseType(body.type)
    if (!type) return badRequest(c, 'type must be image or video')
    const code = String(body.code || '')
    if (!code.trim()) return badRequest(c, 'code must not be empty')
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
        // Audit 1107 F-13: dry-run failure is a 4xx, not a 200-wrapped ok:false —
        // silent success shape hides breakage from API consumers and monitoring
        return c.json({ code: 400, message: err.message, ok: false }, 400)
    }
})

// POST /custom-providers/:id/test — dry run of a saved entry (code fetched by id)
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
        // Audit 1107 F-13: same as /test — failure must not masquerade as 200 ok
        return c.json({ code: 400, message: err.message, ok: false }, 400)
    }
})

export default app
