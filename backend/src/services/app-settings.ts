/**
 * 应用级全局设置（app_settings key-value 表）
 * AI 内容语言：所有 Agent 产出（剧本/提取/分镜/提示词）统一使用的目标语言
 * 层次约束：本模块只依赖 db，严禁反向 import agents/*（agents/context.ts 会引用本模块）
 *
 * 注意：刻意做成同步 API（better-sqlite3 驱动的 .get()/.run()），
 * 供 agents/context.ts 的同步 buildAgentRequestContext 内部直接调用
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'

export const CONTENT_LANGUAGES = ['zh', 'en', 'ja', 'ko'] as const
export type ContentLanguage = typeof CONTENT_LANGUAGES[number]

const CONTENT_LANGUAGE_KEY = 'content_language'

function isContentLanguage(v: unknown): v is ContentLanguage {
  return typeof v === 'string' && (CONTENT_LANGUAGES as readonly string[]).includes(v)
}

/** 读取全局内容语言；未设置或值非法时回退 'zh'（保持历史默认行为） */
export function getContentLanguage(): ContentLanguage {
  const row = db.select().from(schema.appSettings)
    .where(eq(schema.appSettings.key, CONTENT_LANGUAGE_KEY))
    .get()
  return isContentLanguage(row?.value) ? row.value : 'zh'
}

/** 写入全局内容语言（upsert） */
export function setContentLanguage(lang: ContentLanguage): ContentLanguage {
  if (!isContentLanguage(lang)) throw new Error(`Invalid content language: ${lang}`)
  db.insert(schema.appSettings)
    .values({ key: CONTENT_LANGUAGE_KEY, value: lang, updatedAt: now() })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: lang, updatedAt: now() },
    })
    .run()
  return lang
}

const TOURS_SEEN_KEY = 'tours_seen'
const MAX_TOURS_SEEN = 64

function sanitizeTourIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return [...new Set(ids.filter(v => typeof v === 'string' && v.length > 0 && v.length <= 100))].slice(0, MAX_TOURS_SEEN)
}

/** 已看过的引导漫游 id 列表（JSON 数组存储）；桌面端端口随启动变化，localStorage 不可靠，故落库 */
export function getToursSeen(): string[] {
  const row = db.select().from(schema.appSettings)
    .where(eq(schema.appSettings.key, TOURS_SEEN_KEY))
    .get()
  try { return sanitizeTourIds(JSON.parse(row?.value || '[]')) } catch { return [] }
}

/** 写入已看过的引导漫游 id 列表（upsert） */
export function setToursSeen(ids: unknown): string[] {
  const clean = sanitizeTourIds(ids)
  const value = JSON.stringify(clean)
  db.insert(schema.appSettings)
    .values({ key: TOURS_SEEN_KEY, value, updatedAt: now() })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value, updatedAt: now() },
    })
    .run()
  return clean
}

const RAG_ENABLED_KEY = 'rag_enabled'

/** ONNX RAG 开关：默认开（模型缺失/加载失败时检索静默降级为无上下文，不阻断 Agent） */
export function isRagEnabled(): boolean {
  const row = db.select().from(schema.appSettings)
    .where(eq(schema.appSettings.key, RAG_ENABLED_KEY))
    .get()
  return row?.value !== 'false'
}

export function setRagEnabled(enabled: boolean): boolean {
  db.insert(schema.appSettings)
    .values({ key: RAG_ENABLED_KEY, value: enabled ? 'true' : 'false', updatedAt: now() })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: enabled ? 'true' : 'false', updatedAt: now() },
    })
    .run()
  return enabled
}

const MEMORY_ENABLED_KEY = 'agent_memory_enabled'

/** 跨会话记忆开关（fusion-memory）：默认开；fm-server 未启时检索静默降级为无记忆块 */
export function isMemoryEnabled(): boolean {
  const row = db.select().from(schema.appSettings)
    .where(eq(schema.appSettings.key, MEMORY_ENABLED_KEY))
    .get()
  return row?.value !== 'false'
}

export function setMemoryEnabled(enabled: boolean): boolean {
  db.insert(schema.appSettings)
    .values({ key: MEMORY_ENABLED_KEY, value: enabled ? 'true' : 'false', updatedAt: now() })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: enabled ? 'true' : 'false', updatedAt: now() },
    })
    .run()
  return enabled
}

const SUPERVISOR_ENABLED_KEY = 'agent_supervisor_enabled'

/** Agent 监督层开关：默认开；审阅模型调用失败时降级为 pass-through 不阻断 */
export function isSupervisorEnabled(): boolean {
  const row = db.select().from(schema.appSettings)
    .where(eq(schema.appSettings.key, SUPERVISOR_ENABLED_KEY))
    .get()
  return row?.value !== 'false'
}

export function setSupervisorEnabled(enabled: boolean): boolean {
  db.insert(schema.appSettings)
    .values({ key: SUPERVISOR_ENABLED_KEY, value: enabled ? 'true' : 'false', updatedAt: now() })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: enabled ? 'true' : 'false', updatedAt: now() },
    })
    .run()
  return enabled
}

const SERVER_TOKEN_KEY = 'server_api_token'

/** 首启自动生成的服务器 API token（对外部署未显式配 FUSION_API_TOKEN 时用） */
export function getServerApiToken(): string | null {
    const row = db.select().from(schema.appSettings)
        .where(eq(schema.appSettings.key, SERVER_TOKEN_KEY))
        .get()
    return row?.value || null
}

export function setServerApiToken(token: string): void {
    db.insert(schema.appSettings)
        .values({ key: SERVER_TOKEN_KEY, value: token, updatedAt: now() })
        .onConflictDoUpdate({
            target: schema.appSettings.key,
            set: { value: token, updatedAt: now() },
        })
        .run()
}
