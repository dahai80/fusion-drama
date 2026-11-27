/**
 * MySQL → SQLite data import (shared core for startup auto-migration + CLI script)
 *
 * Auto-migration trigger conditions (all must hold):
 * 1. MYSQL_AUTO_IMPORT is not 'false'
 * 2. MySQL is explicitly configured (DATABASE_URL or MYSQL_HOST; pure defaults do not trigger,
 *    avoiding accidental connections for desktop/new installs)
 * 3. SQLite business tables are empty (style_presets seeds excluded)
 * 4. No completion marker file <sqlite>.mysql-imported (written on successful import; not written
 *    when MySQL is unreachable, so the next startup retries)
 *
 * Import is two-phase: first read everything from MySQL into memory, then write inside a single
 * SQLite transaction; any failure rolls back the whole import, leaving no half-migrated state.
 */
import fs from 'fs'
import mysql from 'mysql2/promise'
import type { Database as SqliteDB } from 'better-sqlite3'

/** Dependency order: referenced tables written first (SQLite has no FKs enforced; keeps the import order readable) */
export const MIGRATE_TABLES = [
  'dramas',
  'characters',
  'props',
  'scenes',
  'episodes',
  'storyboards',
  'episode_characters',
  'episode_scenes',
  'episode_props',
  'storyboard_characters',
  'storyboard_props',
  'ai_service_configs',
  'ai_service_providers',
  'style_presets',
  'sys_task',
  'video_merges',
  'assets',
]

/** MySQL row → SQLite bindable value (boolean→0/1, undefined→null) */
export function sanitize(v: unknown): string | number | bigint | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return v
  return String(v)
}

/**
 * Returns the connection string only when MySQL is explicitly configured (DATABASE_URL or MYSQL_HOST).
 * Pure defaults never trigger, avoiding accidental connections to an unrelated local MySQL for
 * desktop/new installs.
 */
export function mysqlUrlFromEnv(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  if (!process.env.MYSQL_HOST) return null
  const host = process.env.MYSQL_HOST
  const port = process.env.MYSQL_PORT || '3306'
  const user = encodeURIComponent(process.env.MYSQL_USER || 'fusion')
  const password = encodeURIComponent(process.env.MYSQL_PASSWORD || 'fusion')
  const database = process.env.MYSQL_DATABASE || 'fusion_drama'
  return `mysql://${user}:${password}@${host}:${port}/${database}`
}

/** Whether the SQLite business tables are empty (style_presets startup seeds excluded) */
export function sqliteBusinessRowCount(sqlite: SqliteDB): number {
  return MIGRATE_TABLES
    .filter(t => t !== 'style_presets')
    .reduce((sum, t) => {
      const { n } = sqlite.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number }
      return sum + n
    }, 0)
}

/**
 * Two-phase import: read everything first, then write in a single transaction; a row-count
 * mismatch throws (rolling back the transaction).
 */
export async function importMysqlData(
  pool: mysql.Pool,
  sqlite: SqliteDB,
  log: (msg: string) => void = console.log,
): Promise<{ totalSrc: number; totalDst: number }> {
  // Phase 1: read out
  const dump: Record<string, Record<string, unknown>[]> = {}
  for (const table of MIGRATE_TABLES) {
    const [rows] = await pool.query(`SELECT * FROM \`${table}\``)
    dump[table] = rows as Record<string, unknown>[]
  }

  // Phase 2: write in a single transaction
  let totalSrc = 0
  let totalDst = 0
  const mismatch: string[] = []

  sqlite.transaction(() => {
    for (const table of MIGRATE_TABLES) {
      const data = dump[table]
      const columns = data.length ? Object.keys(data[0]) : null

      // Clear the target table before import: style_presets initial seeds would collide on UNIQUE(value); repeat runs stay idempotent
      if (data.length) {
        sqlite.prepare(`DELETE FROM "${table}"`).run()
      }

      if (columns) {
        const colList = columns.map(c => `"${c}"`).join(', ')
        const placeholders = columns.map(() => '?').join(', ')
        const stmt = sqlite.prepare(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`)
        for (const row of data) {
          stmt.run(...columns.map(c => sanitize(row[c])))
        }
      }

      const dst = (sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n
      totalSrc += data.length
      totalDst += dst
      log(`${data.length === dst ? '✓' : '✗'} ${table}: mysql=${data.length} sqlite=${dst}`)
      if (data.length !== dst) mismatch.push(table)
    }
  })()

  if (mismatch.length) {
    throw new Error(`Row count mismatch: ${mismatch.join(', ')}`)
  }
  return { totalSrc, totalDst }
}

/**
 * Auto-migrate at startup (conditions in the file header comment). Never throws: failures only
 * warn and roll back, never blocking service startup.
 */
export async function maybeAutoImportMysql(sqlite: SqliteDB, dbPath: string): Promise<void> {
  const tag = '[mysql-import]'
  if ((process.env.MYSQL_AUTO_IMPORT || 'true').toLowerCase() === 'false') return

  const url = mysqlUrlFromEnv()
  if (!url) return

  const marker = `${dbPath}.mysql-imported`
  if (fs.existsSync(marker)) return

  if (sqliteBusinessRowCount(sqlite) > 0) return // business data already present, skip silently

  let pool: mysql.Pool | null = null
  try {
    pool = mysql.createPool({ uri: url, connectionLimit: 4, charset: 'utf8mb4', connectTimeout: 3000 })
    await pool.query('SELECT 1')
  } catch (err) {
    console.warn(`${tag} MySQL configured but connection failed (${(err as Error).message}); skipping auto-migration this run, will retry on next startup`)
    await pool?.end().catch(() => {})
    return
  }

  try {
    // No business data on the MySQL side → write the marker to avoid probing on every startup
    const [rows] = await pool.query('SELECT (SELECT COUNT(*) FROM `dramas`) + (SELECT COUNT(*) FROM `ai_service_configs`) AS n')
    const mysqlRows = Number((rows as { n: number }[])[0]?.n || 0)
    if (mysqlRows === 0) {
      fs.writeFileSync(marker, `mysql source empty at ${new Date().toISOString()}\n`)
      return
    }

    console.log(`${tag} detected legacy MySQL data (${mysqlRows} rows in key tables), starting auto-migration to SQLite...`)
    if (fs.existsSync(dbPath)) {
      const backup = `${dbPath}.bak-${Date.now()}`
      fs.copyFileSync(dbPath, backup)
      console.log(`${tag} existing database backed up -> ${backup}`)
    }

    const { totalSrc, totalDst } = await importMysqlData(pool, sqlite, msg => console.log(`${tag} ${msg}`))
    fs.writeFileSync(marker, `imported ${totalSrc} rows at ${new Date().toISOString()}\n`)
    console.log(`${tag} migration complete (mysql=${totalSrc} sqlite=${totalDst})`)
    console.log(`${tag} note: if the old deployment's data/static media files are not on this machine, copy them manually, otherwise historical assets will be inaccessible`)
  } catch (err) {
    console.error(`${tag} auto-migration failed (rolled back, this startup unaffected, will retry on next startup):`, (err as Error).message)
  } finally {
    await pool.end().catch(() => {})
  }
}
