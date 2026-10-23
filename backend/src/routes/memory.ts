/**
 * 跨会话记忆路由 — fusion-memory 状态/开关/召回测试
 */
import { Hono } from 'hono'
import { isMemoryEnabled, setMemoryEnabled } from '../services/app-settings.js'
import { memoryStatus, retrieveMemoryContext } from '../services/agent-memory.js'
import { success } from '../utils/response.js'

const app = new Hono()

// GET /memory/status
app.get('/status', async (c) => {
    const status = await memoryStatus()
    return success(c, { ...status, enabled: isMemoryEnabled() })
})

// PUT /memory/enabled  body: { enabled: boolean }
app.put('/enabled', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const enabled = !!body?.enabled
    setMemoryEnabled(enabled)
    return success(c, { enabled })
})

// GET /memory/recall?q=...  召回测试（前端设置页「测试记忆」按钮）
app.get('/recall', async (c) => {
    const q = c.req.query('q') || ''
    if (!q.trim()) return success(c, { context: null })
    const context = await retrieveMemoryContext(q)
    return success(c, { context })
})

export default app
