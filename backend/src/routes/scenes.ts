import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, now } from '../utils/response.js'

const app = new Hono()

// POST /scenes
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()
  const res = db.insert(schema.scenes).values({
    dramaId: body.drama_id,
    episodeId: body.episode_id,
    location: body.location,
    time: body.time || '',
    prompt: body.prompt || body.location,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const [result] = db.select().from(schema.scenes)
    .where(eq(schema.scenes.id, Number(res.lastInsertRowid))).all()
  return created(c, result)
})

// PUT /scenes/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  if (body.location !== undefined) updates.location = body.location
  if (body.time !== undefined) updates.time = body.time
  if (body.prompt !== undefined) updates.prompt = body.prompt
  db.update(schema.scenes).set(updates).where(eq(schema.scenes.id, id)).run()
  return success(c)
})

// DELETE /scenes/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  db.delete(schema.scenes).where(eq(schema.scenes.id, id)).run()
  return success(c)
})

export default app
