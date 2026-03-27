import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, now } from '../utils/response.js'

const app = new Hono()

// POST /images — Generate image (placeholder)
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()
  const [result] = await db.insert(schema.imageGenerations).values({
    storyboardId: body.storyboard_id,
    dramaId: body.drama_id,
    prompt: body.prompt,
    model: body.model,
    status: 'pending',
    frameType: body.frame_type,
    createdAt: ts,
    updatedAt: ts,
  }).returning()
  return created(c, result)
})

// GET /images/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.imageGenerations)
    .where(eq(schema.imageGenerations.id, id))
  return success(c, row || null)
})

// DELETE /images/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.delete(schema.imageGenerations).where(eq(schema.imageGenerations.id, id))
  return success(c)
})

// POST /images/episode/:episode_id/batch (placeholder)
app.post('/episode/:episode_id/batch', async (c) => {
  return success(c, { message: 'Batch generation queued' })
})

export default app
