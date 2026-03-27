import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db'
import { success, notFound, created, now } from '../utils/response'

const app = new Hono()

// POST /scenes
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()
  const [result] = await db.insert(schema.scenes).values({
    dramaId: body.drama_id,
    episodeId: body.episode_id,
    location: body.location,
    time: body.time,
    prompt: body.prompt,
    description: body.description,
    imageUrl: body.image_url,
    localPath: body.local_path,
    createdAt: ts,
    updatedAt: ts,
  }).returning()
  return created(c, result)
})

// PUT /scenes/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()
  await db.update(schema.scenes).set({
    location: body.location,
    time: body.time,
    prompt: body.prompt,
    description: body.description,
    imageUrl: body.image_url,
    localPath: body.local_path,
    updatedAt: now(),
  }).where(eq(schema.scenes.id, id))
  return success(c)
})

// DELETE /scenes/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  await db.delete(schema.scenes).where(eq(schema.scenes.id, id))
  return success(c)
})

export default app
