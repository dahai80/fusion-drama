/**
 * 存储位置信息路由 — 设置页「存储位置」卡片数据源
 *
 * GET / → 当前模式(desktop/server)、目录路径、磁盘占用（分桶）与剩余空间。
 * 占用计算较重（全目录 walk）：内存缓存 60s TTL + stale-while-revalidate，
 * 过期时立即返回旧值并后台单飞重算（computing 防并发）；首次无值才同步等待。
 */
import { Hono } from 'hono'
import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { DATA_ROOT, STORAGE_ROOT } from '../utils/paths.js'
import { dbPath, sqlite } from '../db/index.js'
import { dirUsage, volumeFreeBytes } from '../utils/dirsize.js'
import { success, badRequest } from '../utils/response.js'

const app = new Hono()

const USAGE_TTL_MS = 60_000

interface UsageCache {
  usage: Awaited<ReturnType<typeof dirUsage>> | null
  computedAt: string | null
  computing: boolean
}
const cache: UsageCache = { usage: null, computedAt: null, computing: false }

async function computeUsage() {
  if (cache.computing) return
  cache.computing = true
  try {
    const usage = await dirUsage(DATA_ROOT, dbPath)
    cache.usage = usage
    cache.computedAt = new Date().toISOString()
  } finally {
    cache.computing = false
  }
}

// 启动 10s 后后台预热一次，用户进设置页时大概率已命中缓存
const warmup = setTimeout(() => { void computeUsage() }, 10_000)
warmup.unref?.()

app.get('/', async (c) => {
  const fresh = cache.computedAt && (Date.now() - new Date(cache.computedAt).getTime()) < USAGE_TTL_MS
  let usageStale = false
  if (!fresh) {
    if (cache.usage) {
      // stale-while-revalidate：先回旧值，后台重算
      usageStale = true
      void computeUsage()
    } else {
      // 首次无值，同步等待首算（保证进入页面必有数据）
      await computeUsage()
    }
  }

  const mode = process.env.FUSION_DESKTOP === '1' ? 'desktop' : 'server'
  return success(c, {
    mode,
    dataDir: DATA_ROOT,
    storageRoot: STORAGE_ROOT,
    sqlitePath: dbPath,
    usage: cache.usage,
    usageStale: usageStale || cache.computing,
    computedAt: cache.computedAt,
    freeBytes: await volumeFreeBytes(DATA_ROOT),
  })
})

// ===== FR-BIZ-6 服务器版 DB 备份（桌面版恢复/迁移走主进程 migration 桥）=====

const MAX_BACKUPS = 10

function backupDir(): string {
  return path.join(path.dirname(dbPath), 'backups')
}

/** 立即备份（FR-BIZ-6/NFR-DATA-3）：DB 快照 + storage 目录打包 tar.gz（保留最近 10 份） */
app.post('/backup', async (c) => {
  const dir = backupDir()
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  // 步骤 1：VACUUM INTO 快照（WAL 一致性由 SQLite 保证）——快照文件同时是
  // 步骤 2 tar 的输入，备份失败时留 .sqlite 单库快照兜底（仍是可用备份）
  const snap = path.join(dir, `manual-${stamp}.sqlite`)
  try {
    sqlite.prepare(`VACUUM INTO '${snap.replace(/'/g, "''")}'`).run()
  } catch (err: any) {
    console.error('[storage] backup snapshot failed:', err?.message)
    return badRequest(c, `备份失败：${err?.message || '数据库快照写入异常'}`)
  }
  // 步骤 2：DB + static/ 打包 tar.gz（换机恢复=解压 + 按目录摆回，见 README）
  const bundle = path.join(dir, `bundle-${stamp}.tar.gz`)
  const packed = await new Promise<boolean>(resolve => {
    const tar = spawn('tar', ['-czf', bundle, '-C', path.dirname(snap), path.basename(snap), '-C', path.dirname(STORAGE_ROOT), path.basename(STORAGE_ROOT)])
    tar.on('error', (err) => { console.error('[storage] tar spawn failed:', err.message); resolve(false) })
    tar.on('close', (code) => resolve(code === 0))
  })
  if (packed) {
    // 全量包成功：单库快照已完成使命，删除避免双份占用
    fs.rmSync(snap, { force: true })
    pruneOldBackups(dir)
    const size = fs.statSync(bundle).size
    console.log(`[storage] manual backup created: ${path.basename(bundle)} (${size} bytes)`)
    return success(c, { file: path.basename(bundle), size, includes: ['database', 'static'] })
  }
  // tar 不可用（极端精简镜像）：退化为仅 DB 快照，功能可用但不含静态文件
  pruneOldBackups(dir)
  console.warn(`[storage] tar unavailable, DB-only backup kept: ${path.basename(snap)}`)
  return success(c, { file: path.basename(snap), size: fs.statSync(snap).size, includes: ['database'] })
})

app.get('/backups', (c) => {
  const dir = backupDir()
  let files: string[] = []
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.sqlite') || f.endsWith('.tar.gz')).sort().reverse()
  } catch { /* 目录不存在 = 无备份 */ }
  const items = files.map(f => {
    let size = 0
    try { size = fs.statSync(path.join(dir, f)).size } catch { /* 文件被清理 */ }
    return { file: f, size }
  })
  return success(c, items)
})

function pruneOldBackups(dir: string) {
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sqlite') || f.endsWith('.tar.gz')).sort()
    while (files.length > MAX_BACKUPS) {
      const oldest = files.shift()
      if (oldest) fs.rmSync(path.join(dir, oldest), { force: true })
    }
  } catch { /* 清理失败不阻断 */ }
}

export default app
