import { Hono } from 'hono'
import { isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest } from '../utils/response.js'
import { isRagEnabled, setRagEnabled } from '../services/app-settings.js'
import { indexDrama, ragStatus, searchDrama } from '../services/rag.js'
import { logTaskError } from '../utils/task-logger.js'

const app = new Hono()

// GET /rag/status — model load status + index size
app.get('/status', async (c) => {
    const status = await ragStatus()
    return success(c, { ...status, enabled: isRagEnabled() })
})

// PUT /rag/enabled — toggle (when off, agents do not inject retrieval context)
app.put('/enabled', async (c) => {
    const body = await c.req.json()
    if (typeof body.enabled !== 'boolean') return badRequest(c, 'enabled must be a boolean')
    return success(c, { enabled: setRagEnabled(body.enabled) })
})

// POST /rag/index/:dramaId — manually rebuild the full index for one drama
app.post('/index/:dramaId', async (c) => {
    const dramaId = Number(c.req.param('dramaId'))
    if (!Number.isInteger(dramaId) || dramaId <= 0) return badRequest(c, 'Invalid dramaId')
    try {
        const chunks = await indexDrama(dramaId)
        return success(c, { dramaId, chunks })
    } catch (err: any) {
        return badRequest(c, `Index build failed: ${err.message}`)
    }
})

// POST /rag/index-all — rebuild the index for all dramas ("Rebuild Now" button on the settings page)
app.post('/index-all', async (c) => {
    try {
        const dramas = await db.select({ id: schema.dramas.id }).from(schema.dramas)
            .where(isNull(schema.dramas.deletedAt))
        const results: { dramaId: number; chunks: number }[] = []
        let failed = 0
        for (const d of dramas) {
            try {
                const chunks = await indexDrama(d.id)
                results.push({ dramaId: d.id, chunks })
            } catch (err: any) {
                failed++
                logTaskError('RAG', 'index-all-drama-failed', { dramaId: d.id, error: err.message })
            }
        }
        return success(c, { dramas: results.length, chunks: results.reduce((s, r) => s + r.chunks, 0), failed })
    } catch (err: any) {
        return badRequest(c, `Index build failed: ${err.message}`)
    }
})

// GET /rag/search?drama_id=1&q=... — retrieval debug (frontend shows hit chunks and scores)
app.get('/search', async (c) => {
    const dramaId = Number(c.req.query('drama_id'))
    const q = c.req.query('q') || ''
    if (!Number.isInteger(dramaId) || dramaId <= 0) return badRequest(c, 'Invalid drama_id')
    if (!q.trim()) return badRequest(c, 'q is required')
    const hits = await searchDrama(dramaId, q)
    return success(c, { hits: hits || [] })
})

export default app
