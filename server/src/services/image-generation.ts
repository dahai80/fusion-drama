/**
 * 图片生成服务 — 调用 OpenAI compatible API 生成图片
 */
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

  // 创建记录
  const [record] = db.insert(schema.imageGenerations).values({
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
  }).returning()

  // 异步处理
  processImageGeneration(record.id, config).catch(err => {
    console.error(`Image generation ${record.id} failed:`, err)
  })

  return record.id
}

async function processImageGeneration(id: number, config: { baseUrl: string; apiKey: string; model: string }) {
  try {
    const [record] = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id))
    if (!record) return

    // 构建请求
    const body: any = {
      model: record.model || config.model,
      prompt: record.prompt,
      size: record.size || '1920x1080',
      n: 1,
    }

    // 参考图
    if (record.referenceImages) {
      const refs = JSON.parse(record.referenceImages)
      if (refs.length > 0) body.image = refs
    }

    const resp = await fetch(`${config.baseUrl}/images/generations`, {
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

    // 检查是否异步任务
    if (result.task_id || result.id) {
      const taskId = result.task_id || result.id
      db.update(schema.imageGenerations)
        .set({ taskId, status: 'processing', updatedAt: now() })
        .where(eq(schema.imageGenerations.id, id))
        .run()

      // 开始轮询
      pollImageTask(id, config, taskId)
      return
    }

    // 同步结果
    const imageUrl = result.data?.[0]?.url || result.url
    if (!imageUrl) throw new Error('No image URL in response')

    const localPath = await downloadFile(imageUrl, 'images')

    db.update(schema.imageGenerations)
      .set({ imageUrl, localPath, status: 'completed', updatedAt: now() })
      .where(eq(schema.imageGenerations.id, id))
      .run()

    // 更新关联的 storyboard
    if (record.storyboardId) {
      db.update(schema.storyboards)
        .set({ composedImage: localPath, updatedAt: now() })
        .where(eq(schema.storyboards.id, record.storyboardId))
        .run()
    }
  } catch (err: any) {
    db.update(schema.imageGenerations)
      .set({ status: 'failed', errorMsg: err.message, updatedAt: now() })
      .where(eq(schema.imageGenerations.id, id))
      .run()
  }
}

async function pollImageTask(id: number, config: { baseUrl: string; apiKey: string }, taskId: string) {
  const maxAttempts = 60
  const interval = 5000

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, interval))

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
        const [record] = db.select().from(schema.imageGenerations).where(eq(schema.imageGenerations.id, id))

        db.update(schema.imageGenerations)
          .set({ imageUrl, localPath, status: 'completed', updatedAt: now() })
          .where(eq(schema.imageGenerations.id, id))
          .run()

        if (record?.storyboardId) {
          db.update(schema.storyboards)
            .set({ composedImage: localPath, updatedAt: now() })
            .where(eq(schema.storyboards.id, record.storyboardId))
            .run()
        }
        return
      }

      if (status === 'failed' || status === 'error') {
        throw new Error(result.error_msg || result.message || 'Task failed')
      }
    } catch (err: any) {
      if (i === maxAttempts - 1) {
        db.update(schema.imageGenerations)
          .set({ status: 'failed', errorMsg: `Polling timeout: ${err.message}`, updatedAt: now() })
          .where(eq(schema.imageGenerations.id, id))
          .run()
      }
    }
  }
}
