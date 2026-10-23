import { Hono } from 'hono'
import { isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, badRequest } from '../utils/response.js'
import { isRagEnabled, setRagEnabled } from '../services/app-settings.js'
import { indexDrama, ragStatus, searchDrama } from '../services/rag.js'
import { logTaskError } from '../utils/task-logger.js'

const app = new Hono()

// GET /rag/status — 模型加载状态 + 索引量
app.get('/status', async (c) => {
    const status = await ragStatus()
    return success(c, { ...status, enabled: isRagEnabled() })
})

// PUT /rag/enabled — 开关（关闭时 Agent 不注入检索上下文）
app.put('/enabled', async (c) => {
    const body = await c.req.json()
    if (typeof body.enabled !== 'boolean') return badRequest(c, 'enabled 须为布尔值')
    return success(c, { enabled: setRagEnabled(body.enabled) })
})

// POST /rag/index/:dramaId — 手动全量重建某 drama 的索引
app.post('/index/:dramaId', async (c) => {
    const dramaId = Number(c.req.param('dramaId'))
    if (!Number.isInteger(dramaId) || dramaId <= 0) return badRequest(c, 'dramaId 不合法')
    try {
        const chunks = await indexDrama(dramaId)
        return success(c, { dramaId, chunks })
    } catch (err: any) {
        return badRequest(c, `索引构建失败: ${err.message}`)
    }
})

// POST /rag/index-all — 重建全部 drama 的索引（设置页「立即重建」按钮）
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
        return badRequest(c, `索引构建失败: ${err.message}`)
    }
})

// GET /rag/search?drama_id=1&q=... — 检索调试（前端展示命中块与得分）
app.get('/search', async (c) => {
    const dramaId = Number(c.req.query('drama_id'))
    const q = c.req.query('q') || ''
    if (!Number.isInteger(dramaId) || dramaId <= 0) return badRequest(c, 'drama_id 不合法')
    if (!q.trim()) return badRequest(c, 'q 不能为空')
    const hits = await searchDrama(dramaId, q)
    return success(c, { hits: hits || [] })
})

export default app
