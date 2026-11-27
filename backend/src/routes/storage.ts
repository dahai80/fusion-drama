/**
 * Storage location info routes — data source for the "Storage" card on the settings page
 *
 * GET / → current mode (desktop/server), directory paths, disk usage (bucketed) and free space.
 * Usage computation is heavy (full directory walk): in-memory cache with 60s TTL + stale-while-revalidate.
 * When expired, the old value is returned immediately and a single background recompute is kicked off
 * (computing flag prevents concurrency); only the very first call with no value waits synchronously.
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

// Warm up once in the background 10s after startup so users opening the settings page mostly hit the cache
const warmup = setTimeout(() => { void computeUsage() }, 10_000)
warmup.unref?.()

app.get('/', async (c) => {
  const fresh = cache.computedAt && (Date.now() - new Date(cache.computedAt).getTime()) < USAGE_TTL_MS
  let usageStale = false
  if (!fresh) {
    if (cache.usage) {
      // stale-while-revalidate: return the old value first, recompute in the background
      usageStale = true
      void computeUsage()
    } else {
      // First call with no value: wait synchronously for the initial computation (guarantees data on page entry)
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

// ===== FR-BIZ-6 server DB backup (desktop restore/migration goes through the main-process migration bridge) =====

const MAX_BACKUPS = 10

function backupDir(): string {
  return path.join(path.dirname(dbPath), 'backups')
}

/** Backup now (FR-BIZ-6/NFR-DATA-3): DB snapshot + storage directory packed as tar.gz (keeps the last 10) */
app.post('/backup', async (c) => {
  const dir = backupDir()
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  // Step 1: VACUUM INTO snapshot (WAL consistency guaranteed by SQLite) — the snapshot file is
  // also the input for the step-2 tar; if the backup fails, the .sqlite single-file snapshot is
  // kept as a fallback (still a usable backup)
  const snap = path.join(dir, `manual-${stamp}.sqlite`)
  try {
    sqlite.prepare(`VACUUM INTO '${snap.replace(/'/g, "''")}'`).run()
  } catch (err: any) {
    console.error('[storage] backup snapshot failed:', err?.message)
    return badRequest(c, `Backup failed: ${err?.message || 'database snapshot write error'}`)
  }
  // Step 2: pack DB + static/ as tar.gz (machine-migration restore = extract + put directories back in place, see README)
  const bundle = path.join(dir, `bundle-${stamp}.tar.gz`)
  const packed = await new Promise<boolean>(resolve => {
    const tar = spawn('tar', ['-czf', bundle, '-C', path.dirname(snap), path.basename(snap), '-C', path.dirname(STORAGE_ROOT), path.basename(STORAGE_ROOT)])
    tar.on('error', (err) => { console.error('[storage] tar spawn failed:', err.message); resolve(false) })
    tar.on('close', (code) => resolve(code === 0))
  })
  if (packed) {
    // Full bundle succeeded: the single-file snapshot has served its purpose; delete it to avoid double storage
    fs.rmSync(snap, { force: true })
    pruneOldBackups(dir)
    const size = fs.statSync(bundle).size
    console.log(`[storage] manual backup created: ${path.basename(bundle)} (${size} bytes)`)
    return success(c, { file: path.basename(bundle), size, includes: ['database', 'static'] })
  }
  // tar unavailable (extremely minimal images): degrade to DB snapshot only — functional but without static files
  pruneOldBackups(dir)
  console.warn(`[storage] tar unavailable, DB-only backup kept: ${path.basename(snap)}`)
  return success(c, { file: path.basename(snap), size: fs.statSync(snap).size, includes: ['database'] })
})

app.get('/backups', (c) => {
  const dir = backupDir()
  let files: string[] = []
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.sqlite') || f.endsWith('.tar.gz')).sort().reverse()
  } catch { /* directory missing = no backups */ }
  const items = files.map(f => {
    let size = 0
    try { size = fs.statSync(path.join(dir, f)).size } catch { /* file cleaned up */ }
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
  } catch { /* prune failure is non-blocking */ }
}

export default app
