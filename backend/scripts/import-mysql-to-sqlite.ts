/**
 * MySQL → SQLite one-shot data migration script (CLI)
 *
 * Usage: cd backend && npx tsx scripts/import-mysql-to-sqlite.ts [--force]
 *
 * - Source: MySQL (reads DATABASE_URL or MYSQL_* env vars, compatible with backend/.env)
 * - Target: SQLITE_PATH env var, defaults to repo-root data/fusion.sqlite3
 * - Table structure is created idempotently by initSqliteSchema; data is written with
 *   explicit ids (after inserting into AUTOINCREMENT tables, sqlite_sequence automatically
 *   aligns to max(id))
 * - If the target DB already has business data, --force is required to write; a .bak backup
 *   is made unconditionally before writing
 * - Per-table row counts are compared; a mismatch exits non-zero
 *
 * Note: the server already has the same auto-migration built in at startup
 * (src/db/mysql-import.ts, triggered when MySQL is explicitly configured and the DB is
 * empty); this script is for manual/forced scenarios.
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'
import Database from 'better-sqlite3'
import { initSqliteSchema } from '../src/db/sqlite-schema.js'
import { importMysqlData, mysqlUrlFromEnv, sqliteBusinessRowCount } from '../src/db/mysql-import.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const force = process.argv.includes('--force')

const repoRoot = path.resolve(__dirname, '../..')
const sqlitePath = process.env.SQLITE_PATH || path.join(repoRoot, 'data', 'fusion.sqlite3')

async function main() {
  const url = mysqlUrlFromEnv()
  if (!url) {
    console.error('no MySQL configuration detected (DATABASE_URL or MYSQL_HOST)')
    process.exit(1)
  }
  const mysqlPool = mysql.createPool({ uri: url, connectionLimit: 4, charset: 'utf8mb4' })

  // back up the existing target DB (--force is only needed when the file exists and is
  // non-empty; the backup runs unconditionally)
  if (fs.existsSync(sqlitePath)) {
    const backup = `${sqlitePath}.bak-${Date.now()}`
    fs.copyFileSync(sqlitePath, backup)
    console.log(`backed up existing DB → ${backup}`)
  }
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true })
  const sqlite = new Database(sqlitePath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  initSqliteSchema(sqlite)

  // non-empty target DB requires --force
  const existing = sqliteBusinessRowCount(sqlite)
  if (existing > 0 && !force) {
    console.error(`target DB already contains ${existing} business rows. Pass --force to confirm overwrite (a backup was made)`)
    process.exit(1)
  }

  const { totalSrc, totalDst } = await importMysqlData(mysqlPool, sqlite)

  // autoincrement sequence alignment check (after explicit-id inserts, sqlite_sequence
  // should be >= max(id))
  const seq = sqlite.prepare(`SELECT name, seq FROM sqlite_sequence`).all() as { name: string; seq: number }[]
  console.log(`\nsqlite_sequence registered ${seq.length} autoincrement tables`)

  await mysqlPool.end()
  sqlite.close()

  console.log(`\ntotal: mysql=${totalSrc} sqlite=${totalDst}`)
  console.log('migration complete ✓')
}

main().catch(err => {
  console.error('migration failed:', err)
  process.exit(1)
})
