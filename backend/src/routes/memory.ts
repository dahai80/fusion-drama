/**
 * Cross-session memory routes — fusion-memory status/toggle/recall test
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

// GET /memory/recall?q=...  recall test ("Test Memory" button on the settings page)
app.get('/recall', async (c) => {
    const q = c.req.query('q') || ''
    if (!q.trim()) return success(c, { context: null })
    const context = await retrieveMemoryContext(q)
    return success(c, { context })
})

export default app
