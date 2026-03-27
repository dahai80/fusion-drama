import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, notFound, now } from '../utils/response.js'

const app = new Hono()

// PUT /characters/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  const updates: Record<string, any> = { updatedAt: now() }
  for (const key of ['name', 'role', 'description', 'appearance', 'personality', 'voiceStyle', 'imageUrl', 'localPath']) {
    const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    if (snakeKey in body) updates[key] = body[snakeKey]
    else if (key in body) updates[key] = body[key]
  }
  await db.update(schema.characters).set(updates).where(eq(schema.characters.id, id))
  return success(c)
})

// DELETE /characters/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.update(schema.characters).set({ deletedAt: now() }).where(eq(schema.characters.id, id))
  return success(c)
})

// POST /characters/:id/generate-image (placeholder)
app.post('/:id/generate-image', async (c) => {
  const id = Number(c.req.param('id'))
  await db.update(schema.characters)
    .set({ imageGenerationStatus: 'pending', updatedAt: now() })
    .where(eq(schema.characters.id, id))
  return success(c, { message: 'Image generation queued' })
})

// POST /characters/batch-generate-images (placeholder)
app.post('/batch-generate-images', async (c) => {
  const body = await c.req.json()
  const ids = body.character_ids || []
  return success(c, { message: `Queued ${ids.length} characters`, count: ids.length })
})

export default app
