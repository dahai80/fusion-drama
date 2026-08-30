/**
 * MySQL → SQLite 一次性数据迁移脚本
 *
 * 用法：cd backend && npx tsx scripts/import-mysql-to-sqlite.ts [--force]
 *
 * - 源：MySQL（读取 DATABASE_URL 或 MYSQL_* 环境变量，兼容 backend/.env）
 * - 目标：SQLITE_PATH 环境变量，默认仓库根 data/huobao.sqlite3
 * - 表结构由 initSqliteSchema 幂等创建；数据显式带 id 写入（AUTOINCREMENT 表
 *   插入后 sqlite_sequence 自动对齐 max(id)）
 * - 目标库已有业务数据时须 --force 才允许写入；写入前自动备份 .bak
 * - 逐表行数对照，不一致则非零退出
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mysql from 'mysql2/promise'
import Database from 'better-sqlite3'
import { initSqliteSchema } from '../src/db/sqlite-schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const force = process.argv.includes('--force')

// ---- 连接配置（与 db/index.ts 原逻辑同源）----
function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const host = process.env.MYSQL_HOST || '127.0.0.1'
  const port = process.env.MYSQL_PORT || '3306'
  const user = encodeURIComponent(process.env.MYSQL_USER || 'huobao')
  const password = encodeURIComponent(process.env.MYSQL_PASSWORD || 'huobao')
  const database = process.env.MYSQL_DATABASE || 'huobao_drama'
  return `mysql://${user}:${password}@${host}:${port}/${database}`
}

const repoRoot = path.resolve(__dirname, '../..')
const sqlitePath = process.env.SQLITE_PATH || path.join(repoRoot, 'data', 'huobao.sqlite3')

/** 依赖序：被引用表先写（SQLite 未开外键时仅为可读性约定，保持导入顺序清晰） */
const TABLES = [
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

/** MySQL 行 → SQLite 可绑定值（boolean→0/1，undefined→null） */
function sanitize(v: unknown): string | number | bigint | null {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'bigint') return v
  return String(v)
}

async function main() {
  const mysqlPool = mysql.createPool({ uri: databaseUrl(), connectionLimit: 4, charset: 'utf8mb4' })

  // 备份已有目标库（仅当文件存在且非空库时才需要 --force，备份无条件做）
  if (fs.existsSync(sqlitePath)) {
    const backup = `${sqlitePath}.bak-${Date.now()}`
    fs.copyFileSync(sqlitePath, backup)
    console.log(`已备份现有库 → ${backup}`)
  }
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true })
  const sqlite = new Database(sqlitePath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  initSqliteSchema(sqlite)

  // 非空目标库须 --force（style_presets 种子属正常初始化，不计）
  const businessTables = TABLES.filter(t => t !== 'style_presets')
  const existing = businessTables.reduce((sum, t) => {
    const { n } = sqlite.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number }
    return sum + n
  }, 0)
  if (existing > 0 && !force) {
    console.error(`目标库已含 ${existing} 行业务数据。确认覆盖请加 --force（已自动备份）`)
    process.exit(1)
  }

  let totalSrc = 0
  let totalDst = 0
  const mismatch: string[] = []

  for (const table of TABLES) {
    const [rows] = await mysqlPool.query(`SELECT * FROM \`${table}\``)
    const data = rows as Record<string, unknown>[]
    const columns = data.length ? Object.keys(data[0]) : null

    // 导入前清空目标表：style_presets 的初始化种子会撞 UNIQUE(value)；
    // --force 覆盖旧数据；重复执行保持幂等
    if (data.length) {
      sqlite.prepare(`DELETE FROM "${table}"`).run()
    }

    sqlite.transaction(() => {
      if (columns) {
        const colList = columns.map(c => `"${c}"`).join(', ')
        const placeholders = columns.map(() => '?').join(', ')
        const stmt = sqlite.prepare(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`)
        for (const row of data) {
          stmt.run(...columns.map(c => sanitize(row[c])))
        }
      }
    })()

    const dst = (sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get() as { n: number }).n
    totalSrc += data.length
    totalDst += dst
    const ok = data.length === dst ? '✓' : '✗'
    console.log(`${ok} ${table}: mysql=${data.length} sqlite=${dst}`)
    if (data.length !== dst) mismatch.push(table)
  }

  // 自增序列对齐检查（显式 id 插入后 sqlite_sequence 应 >= max(id)）
  const seq = sqlite.prepare(`SELECT name, seq FROM sqlite_sequence`).all() as { name: string; seq: number }[]
  console.log(`\nsqlite_sequence 已登记 ${seq.length} 张自增表`)

  await mysqlPool.end()
  sqlite.close()

  console.log(`\n合计: mysql=${totalSrc} sqlite=${totalDst}`)
  if (mismatch.length) {
    console.error(`行数不一致: ${mismatch.join(', ')}，迁移失败`)
    process.exit(1)
  }
  console.log('迁移完成 ✓')
}

main().catch(err => {
  console.error('迁移失败:', err)
  process.exit(1)
})
