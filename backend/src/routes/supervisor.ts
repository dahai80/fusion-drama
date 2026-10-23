/**
 * Agent 监督层路由 — 开关/状态
 */
import { Hono } from 'hono'
import { isSupervisorEnabled, setSupervisorEnabled } from '../services/app-settings.js'
import { success } from '../utils/response.js'

const app = new Hono()

// GET /supervisor/status
app.get('/status', (c) => {
    return success(c, { enabled: isSupervisorEnabled() })
})

// PUT /supervisor/enabled  body: { enabled: boolean }
app.put('/enabled', async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const enabled = !!body?.enabled
    setSupervisorEnabled(enabled)
    return success(c, { enabled })
})

export default app
