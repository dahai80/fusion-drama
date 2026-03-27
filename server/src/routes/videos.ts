import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, now } from '../utils/response.js'

const app = new Hono()

// POST /videos — Generate video (placeholder)
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()
  const [result] = await db.insert(schema.videoGenerations).values({
    storyboardId: body.storyboard_id,
    dramaId: body.drama_id,
    prompt: body.prompt,
    model: body.model,
    referenceMode: body.reference_mode,
    imageUrl: body.image_url,
    status: 'pending',
    createdAt: ts,
    updatedAt: ts,
  }).returning()
  return created(c, result)
})

// GET /videos/:id
app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const [row] = await db.select().from(schema.videoGenerations)
    .where(eq(schema.videoGenerations.id, id))
  return success(c, row || null)
})

// DELETE /videos/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.delete(schema.videoGenerations).where(eq(schema.videoGenerations.id, id))
  return success(c)
})

export default app
