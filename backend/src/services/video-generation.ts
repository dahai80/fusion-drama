/**
 * 视频生成服务 — 调用 Chatfire/Doubao compatible API 生成视频
 */
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

  const [record] = db.insert(schema.videoGenerations).values({
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
  }).returning()

  // 异步处理
  processVideoGeneration(record.id, config).catch(err => {
    console.error(`Video generation ${record.id} failed:`, err)
  })

  return record.id
}

async function processVideoGeneration(id: number, config: { baseUrl: string; apiKey: string; model: string }) {
  try {
    const [record] = db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id))
    if (!record) return

    // 构建 prompt（拼接参数）
    let promptText = record.prompt || ''
    const dur = record.duration || 5
    const ratio = record.aspectRatio || '16:9'
    promptText += `  --ratio ${ratio}  --dur ${dur}`

    // 构建 content 数组（Doubao/Chatfire 格式）
    const content: any[] = [{ type: 'text', text: promptText }]

    // 参考图
    if (record.referenceMode === 'single' && record.imageUrl) {
      content.push({ type: 'image_url', image_url: { url: record.imageUrl }, role: 'reference_image' })
    } else if (record.referenceMode === 'first_last') {
      if (record.firstFrameUrl) content.push({ type: 'image_url', image_url: { url: record.firstFrameUrl }, role: 'first_frame' })
      if (record.lastFrameUrl) content.push({ type: 'image_url', image_url: { url: record.lastFrameUrl }, role: 'last_frame' })
    } else if (record.referenceMode === 'multiple' && record.referenceImageUrls) {
      const urls = JSON.parse(record.referenceImageUrls) as string[]
      for (const url of urls) {
        content.push({ type: 'image_url', image_url: { url }, role: 'reference_image' })
      }
    }

    const body = { model: record.model || config.model, content }

    const resp = await fetch(`${config.baseUrl}/video/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`API error ${resp.status}: ${errText}`)
    }

    const result = await resp.json() as any
    const taskId = result.task_id || result.id || result.data?.id

    if (!taskId) {
      // 同步结果
      const videoUrl = result.video_url || result.data?.video_url || result.content?.video_url
      if (videoUrl) {
        const localPath = await downloadFile(videoUrl, 'videos')
        db.update(schema.videoGenerations)
          .set({ videoUrl, localPath, status: 'completed', updatedAt: now() })
          .where(eq(schema.videoGenerations.id, id))
          .run()
        updateStoryboardVideo(record.storyboardId, localPath, dur)
        return
      }
      throw new Error('No task_id or video_url in response')
    }

    // 异步任务 — 开始轮询
    db.update(schema.videoGenerations)
      .set({ taskId, status: 'processing', updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()

    pollVideoTask(id, config, taskId, record.storyboardId)
  } catch (err: any) {
    db.update(schema.videoGenerations)
      .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
      .where(eq(schema.videoGenerations.id, id))
      .run()
  }
}

async function pollVideoTask(id: number, config: { baseUrl: string; apiKey: string }, taskId: string, storyboardId?: number | null) {
  const maxAttempts = 300
  const interval = 10000

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, interval))

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
        const [record] = db.select().from(schema.videoGenerations).where(eq(schema.videoGenerations.id, id))

        db.update(schema.videoGenerations)
          .set({ videoUrl, localPath, status: 'completed', completedAt: now(), updatedAt: now() })
          .where(eq(schema.videoGenerations.id, id))
          .run()

        updateStoryboardVideo(record?.storyboardId || storyboardId, localPath, record?.duration || 0)
        return
      }

      if (status === 'failed' || status === 'error') {
        throw new Error(result.error_msg || result.message || 'Task failed')
      }
    } catch (err: any) {
      if (i === maxAttempts - 1) {
        db.update(schema.videoGenerations)
          .set({ status: 'failed', errorMsg: `Polling timeout: ${err.message}`, updatedAt: now() })
          .where(eq(schema.videoGenerations.id, id))
          .run()
      }
    }
  }
}

function updateStoryboardVideo(storyboardId: number | null | undefined, localPath: string, duration: number | null) {
  if (!storyboardId) return
  db.update(schema.storyboards)
    .set({ videoUrl: localPath, duration: duration || undefined, updatedAt: now() })
    .where(eq(schema.storyboards.id, storyboardId))
    .run()
}
