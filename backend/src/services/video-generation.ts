import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { getActiveConfig } from './ai.js'
import { now } from '../utils/response.js'
import { downloadFile } from '../utils/storage.js'

interface GenerateVideoParams {
  storyboardId?: number
  dramaId?: number
  prompt: string
  model?: string
  referenceMode?: string
  imageUrl?: string
  firstFrameUrl?: string
  lastFrameUrl?: string
  referenceImageUrls?: string[]
  duration?: number
  aspectRatio?: string
}

export async function generateVideo(params: GenerateVideoParams): Promise<number> {
  const ts = now()
  const config = getActiveConfig('video')
  if (!config) throw new Error('No active video AI config')

  const res = db.insert(schema.videoGenerations).values({
    storyboardId: params.storyboardId,
    dramaId: params.dramaId,
    prompt: params.prompt,
    model: params.model || config.model,
    provider: config.provider,
    referenceMode: params.referenceMode || 'none',
    imageUrl: params.imageUrl,
    firstFrameUrl: params.firstFrameUrl,
    lastFrameUrl: params.lastFrameUrl,
    referenceImageUrls: params.referenceImageUrls ? JSON.stringify(params.referenceImageUrls) : null,
    duration: params.duration || 5,
    aspectRatio: params.aspectRatio || '16:9',
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  }).run()

  const lastId = Number(res.lastInsertRowid)
  processVideoGeneration(lastId, config).catch(err => {
    console.error(`Video generation ${lastId} failed:`, err)
  })
  return lastId
}

async function processVideoGeneration(id: number, config: { baseUrl: string; apiKey: string; model: string }) {
  try {
    const rows = db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).all()
    const record = rows[0]
    if (!record) return

    let promptText = record.prompt || ''
    promptText += `  --ratio ${record.aspectRatio || '16:9'}  --dur ${record.duration || 5}`

    const content: any[] = [{ type: 'text', text: promptText }]
    if (record.referenceMode === 'single' && record.imageUrl) {
      content.push({ type: 'image_url', image_url: { url: record.imageUrl }, role: 'reference_image' })
    } else if (record.referenceMode === 'first_last') {
      if (record.firstFrameUrl) content.push({ type: 'image_url', image_url: { url: record.firstFrameUrl }, role: 'first_frame' })
      if (record.lastFrameUrl) content.push({ type: 'image_url', image_url: { url: record.lastFrameUrl }, role: 'last_frame' })
    } else if (record.referenceMode === 'multiple' && record.referenceImageUrls) {
      for (const url of JSON.parse(record.referenceImageUrls)) {
        content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
      }
    }

    const resp = await fetch(`${config.baseUrl}/video/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: record.model || config.model, content }),
    })

    if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`)
    const result = await resp.json() as any
    const taskId = result.task_id || result.id || result.data?.id

    if (!taskId) {
      const videoUrl = result.video_url || result.data?.video_url || result.content?.video_url
      if (videoUrl) {
        const localPath = await downloadFile(videoUrl, 'videos')
        db.update(schema.videoGenerations).set({ videoUrl, localPath, status: 'completed', updatedAt: now() }).where(eq(schema.videoGenerations.id, id)).run()
        updateStoryboardVideo(record.storyboardId, localPath, record.duration)
        return
      }
      throw new Error('No task_id or video_url in response')
    }

    db.update(schema.videoGenerations).set({ taskId, status: 'processing', updatedAt: now() }).where(eq(schema.videoGenerations.id, id)).run()
    pollVideoTask(id, config, taskId, record.storyboardId)
  } catch (err: any) {
    db.update(schema.videoGenerations).set({ status: 'failed', errorMsg: err.message, updatedAt: now() }).where(eq(schema.videoGenerations.id, id)).run()
  }
}

async function pollVideoTask(id: number, config: { baseUrl: string; apiKey: string }, taskId: string, storyboardId?: number | null) {
  for (let i = 0; i < 300; i++) {
    await new Promise(r => setTimeout(r, 10000))
    try {
      const resp = await fetch(`${config.baseUrl}/video/task/${taskId}`, {
        headers: { 'Authorization': `Bearer ${config.apiKey}` },
      })
      if (!resp.ok) continue
      const result = await resp.json() as any
      const status = result.status || result.data?.status

      if (status === 'completed' || status === 'succeeded') {
        const videoUrl = result.video_url || result.data?.video_url || result.content?.video_url
        if (!videoUrl) continue
        const localPath = await downloadFile(videoUrl, 'videos')
        const rows = db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id)).all()
        db.update(schema.videoGenerations).set({ videoUrl, localPath, status: 'completed', completedAt: now(), updatedAt: now() }).where(eq(schema.videoGenerations.id, id)).run()
        updateStoryboardVideo(rows[0]?.storyboardId || storyboardId, localPath, rows[0]?.duration || 0)
        return
      }
      if (status === 'failed' || status === 'error') throw new Error(result.error_msg || 'Task failed')
    } catch (err: any) {
      if (i === 299) {
        db.update(schema.videoGenerations).set({ status: 'failed', errorMsg: `Timeout: ${err.message}`, updatedAt: now() }).where(eq(schema.videoGenerations.id, id)).run()
      }
    }
  }
}

function updateStoryboardVideo(storyboardId: number | null | undefined, localPath: string, duration: number | null) {
  if (!storyboardId) return
  db.update(schema.storyboards).set({ videoUrl: localPath, duration: duration || undefined, updatedAt: now() }).where(eq(schema.storyboards.id, storyboardId)).run()
}
