import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { success, created, now } from '../utils/response.js'

const app = new Hono()

// POST /storyboards
app.post('/', async (c) => {
  const body = await c.req.json()
  const ts = now()
  const res = db.insert(schema.storyboards).values({
    episodeId: body.episode_id,
    storyboardNumber: body.storyboard_number || 1,
    title: body.title,
    description: body.description,
    action: body.action,
    dialogue: body.dialogue,
    sceneId: body.scene_id,
    duration: body.duration || 10,
    createdAt: ts,
    updatedAt: ts,
  }).run()
  const [result] = db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.id, Number(res.lastInsertRowid))).all()
  return created(c, result)
})

// PUT /storyboards/:id
app.put('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()

  const fieldMap: Record<string, string> = {
    title: 'title', description: 'description', shot_type: 'shotType',
    angle: 'angle', movement: 'movement', action: 'action',
    dialogue: 'dialogue', duration: 'duration', video_prompt: 'videoPrompt',
    image_prompt: 'imagePrompt', scene_id: 'sceneId', location: 'location',
    time: 'time', atmosphere: 'atmosphere', result: 'result',
    bgm_prompt: 'bgmPrompt', sound_effect: 'soundEffect',
  }

  const updates: Record<string, any> = { updatedAt: now() }
  for (const [snakeKey, camelKey] of Object.entries(fieldMap)) {
    if (snakeKey in body) updates[camelKey] = body[snakeKey]
  }

  db.update(schema.storyboards).set(updates).where(eq(schema.storyboards.id, id)).run()
  return success(c)
})

// DELETE /storyboards/:id
app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'))
  db.delete(schema.storyboards).where(eq(schema.storyboards.id, id)).run()
  return success(c)
})

export default app
