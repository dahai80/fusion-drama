import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { getActiveConfig } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile } from '../utils/storage.js'

interface GenerateImageParams {
  storyboardId?: number
  dramaId?: number
  sceneId?: number
  characterId?: number
  prompt: string
  model?: string
  size?: string
  referenceImages?: string[]
  frameType?: string
}

export async function generateImage(params: GenerateImageParams): Promise<number> {
  const ts = now()
  const config = getActiveConfig('image')
  if (!config) throw new Error('No active image AI config')

  const res = db.insert(schema.imageGenerations).values({
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    sceneId: params.sceneId,
    characterId: params.characterId,
    prompt: params.prompt,
    model: params.model || config.model,
    provider: config.provider,
    size: params.size || '1920x1080',
    frameType: params.frameType,
    referenceImages: params.referenceImages ? JSON.stringify(params.referenceImages) : null,
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const lastId = Number(res.lastInsertRowid)
  processImageGeneration(lastId, config).catch(err => {
    console.error(`Image generation ${lastId} failed:`, err)
  })
  return lastId
}

async function processImageGeneration(id: number, config: { baseUrl: string; apiKey: string; model: string }) {
  try {
    const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
    const record = rows[0]
    if (!record) return

    const body: any = { model: record.model || config.model, prompt: record.prompt, size: record.size || '1920x1080', n: 1 }
    if (record.referenceImages) {
      const refs = JSON.parse(record.referenceImages)
      if (refs.length > 0) body.image = refs
    }

    const resp = await fetch(`${config.baseUrl}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify(body),
    })

    if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`)
    const result = await resp.json() as any

    if (result.task_id || result.id) {
      const taskId = result.task_id || result.id
      db.update(schema.imageGenerations).set({ taskId, status: 'processing', updatedAt: now() }).where(eq(schema.imageGenerations.id, id)).run()
      pollImageTask(id, config, taskId)
      return
    }

    const imageUrl = result.data?.[0]?.url || result.url
    if (!imageUrl) throw new Error('No image URL in response')

    const localPath = await downloadFile(imageUrl, 'images')
    db.update(schema.imageGenerations).set({ imageUrl, localPath, status: 'completed', updatedAt: now() }).where(eq(schema.imageGenerations.id, id)).run()

    if (record.storyboardId) {
      db.update(schema.storyboards).set({ composedImage: localPath, updatedAt: now() }).where(eq(schema.storyboards.id, record.storyboardId)).run()
    }
  } catch (err: any) {
    db.update(schema.imageGenerations).set({ status: 'failed', errorMsg: err.message, updatedAt: now() }).where(eq(schema.imageGenerations.id, id)).run()
  }
}

async function pollImageTask(id: number, config: { baseUrl: string; apiKey: string }, taskId: string) {
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000))
    try {
      const resp = await fetch(`${config.baseUrl}/images/task/${taskId}`, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      })
      if (!resp.ok) continue
      const result = await resp.json() as any
      const status = result.status || result.data?.status

      if (status === 'completed' || status === 'succeeded') {
        const imageUrl = result.image_url || result.data?.image_url || result.url || result.data?.url
        if (!imageUrl) continue
        const localPath = await downloadFile(imageUrl, 'images')
        const rows = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id)).all()
        db.update(schema.imageGenerations).set({ imageUrl, localPath, status: 'completed', updatedAt: now() }).where(eq(schema.imageGenerations.id, id)).run()
        if (rows[0]?.storyboardId) {
          db.update(schema.storyboards).set({ composedImage: localPath, updatedAt: now() }).where(eq(schema.storyboards.id, rows[0].storyboardId)).run()
        }
        return
      }
      if (status === 'failed' || status === 'error') throw new Error(result.error_msg || 'Task failed')
    } catch (err: any) {
      if (i === 59) {
        db.update(schema.imageGenerations).set({ status: 'failed', errorMsg: `Timeout: ${err.message}`, updatedAt: now() }).where(eq(schema.imageGenerations.id, id)).run()
      }
    }
  }
}
