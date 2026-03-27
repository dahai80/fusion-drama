import { Hono } from 'hono'
import { eq, isNull } from 'drizzle-orm'
import { db, schema } from '../db'
import { success, notFound, now } from '../utils/response'

const app = new Hono()

// GET /agent-configs
app.get('/', async (c) => {
  const rows = await db.select().from(schema.agentConfigs).where(isNull(schema.agentConfigs.deletedAt))
  return success(c, rows)
})

// GET /agent-configs/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.agentConfigs).where(eq(schema.agentConfigs.id, id))
  if (!row) return notFound(c)
  return success(c, row)
})

// PUT /agent-configs/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  for (const key of ['model', 'temperature', 'maxTokens', 'maxIterations', 'isActive', 'systemPrompt', 'name', 'description']) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    if (snakeKey in body) updates[key] = body[snakeKey]
    else if (key in body) updates[key] = body[key]
  }
  await db.update(schema.agentConfigs).set(updates).where(eq(schema.agentConfigs.id, id))
  return success(c)
})

// DELETE /agent-configs/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.update(schema.agentConfigs).set({ deletedAt: now() }).where(eq(schema.agentConfigs.id, id))
  return success(c)
})

export default app
