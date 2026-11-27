/**
 * Version check and update routes for server / Docker deployments (desktop updates go through the Electron bridge, not this route)
 */
import { Hono } from 'hono'
import { getServerUpdateState, checkServerUpdate, triggerWatchtowerUpdate } from '../services/server-update.js'
import { success, badRequest } from '../utils/response.js'

const app = new Hono()

// GET /state — current version + update mode + last check result
app.get('/state', (c) => success(c, getServerUpdateState()))

// POST /check — fetch the release feed and compare versions
app.post('/check', async (c) => success(c, await checkServerUpdate()))

// POST /apply — trigger Watchtower to pull a new image and recreate this container (watchtower mode only)
app.post('/apply', async (c) => {
  try {
    await triggerWatchtowerUpdate()
    return success(c, { triggered: true })
  } catch (err) {
    return badRequest(c, (err as Error).message)
  }
})

export default app
