/**
 * AI 服务抽象层 — 从数据库配置中获取 provider 和 API key
 */
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'

export interface AIConfig {
  provider: string
  baseUrl: string
  apiKey: string
  model: string
}

/**
 * 获取指定服务类型的活跃 AI 配置
 */
export function getActiveConfig(serviceType: 'text' | 'image' | 'video'): AIConfig | null {
  const rows = db.select().from(schema.aiServiceConfigs)
    .where(eq(schema.aiServiceConfigs.serviceType, serviceType))
    .all()

  const active = rows.find(r => r.isActive)
  if (!active) return null

  const models = active.model ? JSON.parse(active.model) : []
  return {
    provider: active.provider || '',
    baseUrl: active.baseUrl,
    apiKey: active.apiKey,
    model: models[0] || '',
  }
}

/**
 * 构建 Mastra 模型标识符
 * 格式：provider/model（如 openai/gpt-4o）
 * 对于 chatfire 等中转服务，使用 openai compatible 模式
 */
export function getModelId(serviceType: 'text' | 'image' | 'video' = 'text'): string {
  const config = getActiveConfig(serviceType)
  if (!config) throw new Error(`No active ${serviceType} AI config`)
  // chatfire/openrouter 等中转站用 openai compatible 模式
  return config.model
}

export function getTextConfig(): AIConfig {
  const config = getActiveConfig('text')
  if (!config) throw new Error('No active text AI config')
  return config
}
