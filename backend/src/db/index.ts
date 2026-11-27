import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'
import { initSqliteSchema } from './sqlite-schema.js'
import { runMigrations } from './migrations.js'
import { maybeAutoImportMysql } from './mysql-import.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// src/db -> three levels up is the repo root (same inference depth as utils/paths.ts)
const repoRoot = path.resolve(__dirname, '../../..')

// Desktop build gets SQLITE_PATH injected by the Electron main process (under userData); dev defaults to data/ at the repo root
// Note: do not reuse the early legacy SQLite database file name (overlapping table names but different columns)
export const dbPath = process.env.SQLITE_PATH || path.join(repoRoot, 'data', 'fusion.sqlite3')
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

export const sqlite: Database.Database = new Database(dbPath)

// WAL: generation-task polling and page reads do not block each other under concurrency; busy_timeout backstops write-lock contention
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('busy_timeout = 5000')
sqlite.pragma('synchronous = NORMAL')

/** Startup schema setup (idempotent DDL replay + seed backfill). SQLite has no connection-readiness issue, no retry needed */
export function initDb() {
  initSqliteSchema(sqlite)
  // NFR-OPS-3: user_version-based versioned migrations (auto DB-file backup before DDL-changing migrations)
  const applied = runMigrations(sqlite, dbPath)
  if (applied.length > 0) console.log(`[db] schema at v${Number(sqlite.pragma('user_version', { simple: true }) ?? 0)} (${applied.join(', ')})`)
}

initDb()

// One-time automatic migration for legacy MySQL users: triggers only with explicit MySQL config + empty DB + no marker (see mysql-import.ts header)
await maybeAutoImportMysql(sqlite, dbPath)

/** better-sqlite3's lastInsertRowid may be a bigint; normalize to number */
export function getInsertId(result: unknown) {
  const res = result as { lastInsertRowid?: number | bigint } | undefined
  if (res?.lastInsertRowid === undefined || res.lastInsertRowid === null) {
    throw new Error('SQLite insert did not return lastInsertRowid')
  }
  return Number(res.lastInsertRowid)
}

export const db = drizzle(sqlite, { schema })

export { schema }
export type DB = typeof db
