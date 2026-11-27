/**
 * App-level global settings (app_settings key-value table)
 * AI content language: the target language used uniformly by all Agent output (script/extraction/storyboard/prompts)
 * Layering constraint: this module depends only on db; never import agents/* in reverse (agents/context.ts imports this module)
 *
 * Note: deliberately a synchronous API (better-sqlite3 driver's .get()/.run()),
 * so agents/context.ts's synchronous buildAgentRequestContext can call it directly
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

/** Read the global content language; falls back to 'zh' when unset or invalid (keeps the historical default behavior) */
export function getContentLanguage(): ContentLanguage {
  const row = db.select().from(schema.appSettings)
    .where(eq(schema.appSettings.key, CONTENT_LANGUAGE_KEY))
    .get()
  return isContentLanguage(row?.value) ? row.value : 'zh'
}

/** Write the global content language (upsert) */
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

/** List of seen onboarding tour ids (stored as a JSON array); the desktop port changes across launches and localStorage is unreliable, so persist to DB */
export function getToursSeen(): string[] {
  const row = db.select().from(schema.appSettings)
    .where(eq(schema.appSettings.key, TOURS_SEEN_KEY))
    .get()
  try { return sanitizeTourIds(JSON.parse(row?.value || '[]')) } catch { return [] }
}

/** Write the list of seen onboarding tour ids (upsert) */
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

/** ONNX RAG toggle: default on (retrieval silently degrades to no context when the model is missing/load fails, without blocking Agents) */
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

/** Cross-session memory toggle (fusion-memory): default on; retrieval silently degrades to no memory block when fm-server is not running */
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

/** Agent supervisor toggle: default on; degrades to pass-through without blocking when the review model call fails */
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

/** Server API token auto-generated on first launch (used for external deployment when FUSION_API_TOKEN is not explicitly configured) */
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
