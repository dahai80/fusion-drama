/**
 * Storage migration engine (main process)
 *
 * Sequence: validate -> stop backend -> move -> write config -> restart backend -> done
 * Iron rule: never delete the old directory before the copy verification passes; write
 * config only after files are moved; on any failure roll back and start the backend from the old directory.
 *
 * Progress is pushed via IPC 'fusion:migrate-progress' (80ms throttle; done/error always sent).
 */
import { app, dialog, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'

export interface MigrationDeps {
  getWindow(): BrowserWindow | null
  getDataDir(): string
  setDataDir(dir: string): void
  getPort(): number
  isBackendAlive(): boolean
  /** Stops the backend and waits for exit (sets backendRestarting internally to suppress the fatal dialog) */
  stopBackend(): Promise<void>
  startBackend(): void
  waitHealthy(port: number, timeoutMs: number): Promise<void>
  /** Resets the flag once the backend lifecycle settles (healthy again or recovered) */
  markRestartingFalse(): void
  writeConfig(dataDir: string): void
  configPath(): string
  normCase(p: string): string
}

export interface MigrateProgress {
  phase: 'validating' | 'stopping' | 'moving' | 'config' | 'restarting' | 'done' | 'error'
  message?: string
  copiedBytes?: number
  totalBytes?: number
}

export interface MigrateOptions {
  targetDir: string
  migrateFiles: boolean
}

export function registerMigrationIpc(deps: MigrationDeps): void {
  ipcMain.handle('fusion:start-migration', async (_event, opts: MigrateOptions) => {
    await runMigration(deps, opts)
    return { ok: true }
  })
}

// ---- Progress push (80ms throttle; done/error always sent) ----

function makeReporter(getWindow: () => BrowserWindow | null) {
  let lastSent = 0
  return (progress: MigrateProgress, force = false) => {
    const now = Date.now()
    if (!force && progress.phase !== 'done' && progress.phase !== 'error' && now - lastSent < 80) return
    lastSent = now
    getWindow()?.webContents.send('fusion:migrate-progress', progress)
  }
}

// ---- Validation ----

async function sameVolume(a: string, b: string): Promise<boolean> {
  try {
    const [sa, sb] = await Promise.all([fsp.statfs(a), fsp.statfs(b)])
    return sa.dev === sb.dev
  } catch {
    return false // undeterminable counts as cross-volume (per-file copy is the safer route)
  }
}

async function validateTarget(deps: MigrationDeps, target: string, currentDir: string): Promise<number> {
  const targetStat = await fsp.stat(target).catch(() => null)
  if (!targetStat) {
    await fsp.mkdir(target, { recursive: true })
  } else if (!targetStat.isDirectory()) {
    // i18n: user-facing
    throw new Error('目标路径不是目录')
  } else {
    const children = await fsp.readdir(target)
    // i18n: user-facing
    if (children.length > 0) throw new Error('目标目录必须为空')
  }

  // Writability probe
  const probe = path.join(target, `.fusion-probe-${Date.now()}`)
  await fsp.writeFile(probe, 'probe')
  await fsp.rm(probe)

  // Path relationships (win32 is case-insensitive)
  const a = deps.normCase(path.resolve(currentDir))
  const b = deps.normCase(path.resolve(target))
  // i18n: user-facing
  if (b === a) throw new Error('不能选择当前数据目录')
  // i18n: user-facing
  if (b.startsWith(a + path.sep)) throw new Error('目标目录在当前数据目录内部')
  // i18n: user-facing
  if (a.startsWith(b + path.sep)) throw new Error('目标目录是当前数据目录的上级目录')
  const userData = deps.normCase(path.resolve(path.dirname(currentDir))) // <userData>
  // i18n: user-facing
  if (b === userData || a.startsWith(b + path.sep)) throw new Error('不能选择应用数据目录及其上级目录')

  // Total size to move (shared by cross-volume space check and migration progress)
  let totalBytes = 0
  const collect = async (dir: string): Promise<void> => {
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) await collect(full)
      else if (e.isFile()) {
        const st = await fsp.stat(full).catch(() => null)
        if (st) totalBytes += st.size
      }
    }
  }
  await collect(currentDir)

  // Cross-volume space check (same-volume rename costs no extra space; skipped)
  if (!(await sameVolume(currentDir, target))) {
    const st = await fsp.statfs(target)
    const free = st.bavail * st.bsize
    if (free < totalBytes * 1.05) {
      const needGb = ((totalBytes * 1.05) / 1024 ** 3).toFixed(1)
      const freeGb = (free / 1024 ** 3).toFixed(1)
      // i18n: user-facing
      throw new Error(`目标磁盘空间不足：需要约 ${needGb} GB，剩余 ${freeGb} GB`)
    }
  }
  return totalBytes
}

// ---- Move ----

async function collectFileList(dir: string, base = dir, out: FileEntry[] = []): Promise<FileEntry[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) await collectFileList(full, base, out)
    else if (e.isFile()) {
      const st = await fsp.stat(full)
      out.push({ rel: path.relative(base, full), size: st.size })
    }
  }
  return out
}

interface FileEntry {
  rel: string
  size: number
}

/**
 * Moves the data directory contents. Iron rule: never delete the old directory before re-verification passes.
 * Same volume: rename top-level entries one by one (fall back to per-file copy on EXDEV);
 * cross volume: manifest copy + byte re-verification + delete old.
 */
async function moveData(
  oldDir: string,
  newDir: string,
  report: (p: MigrateProgress, force?: boolean) => void,
): Promise<void> {
  await fsp.mkdir(newDir, { recursive: true })
  const topEntries = await fsp.readdir(oldDir, { withFileTypes: true })

  if (await sameVolume(oldDir, newDir)) {
    for (const e of topEntries) {
      const src = path.join(oldDir, e.name)
      const dst = path.join(newDir, e.name)
      try {
        fs.renameSync(src, dst)
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException)?.code === 'EXDEV') {
          await copyAcross([src], oldDir, newDir, report)
        } else throw err
      }
    }
    await fsp.rm(oldDir, { recursive: true, force: true })
    return
  }

  // Cross volume: full manifest -> per-file copy -> byte re-verification -> delete old
  const files = await collectFileList(oldDir)
  const totalBytes = files.reduce((s, f) => s + f.size, 0)
  let copied = 0
  for (const f of files) {
    const dst = path.join(newDir, f.rel)
    await fsp.mkdir(path.dirname(dst), { recursive: true })
    await fsp.copyFile(path.join(oldDir, f.rel), dst)
    copied += f.size
    report({ phase: 'moving', copiedBytes: copied, totalBytes })
  }
  // Byte re-verification
  const copiedFiles = await collectFileList(newDir)
  const copiedTotal = copiedFiles.reduce((s, f) => s + f.size, 0)
  if (copiedFiles.length !== files.length || copiedTotal !== totalBytes) {
    // i18n: user-facing
    throw new Error(`迁移校验失败：文件数 ${copiedFiles.length}/${files.length}，字节 ${copiedTotal}/${totalBytes}`)
  }
  await fsp.rm(oldDir, { recursive: true, force: true })
}

/** Falls back to cross-volume copy for individual top-level entries when rename hits EXDEV (rare path; simplified progress) */
async function copyAcross(sources: string[], oldDir: string, newDir: string, report: (p: MigrateProgress, force?: boolean) => void): Promise<void> {
  let total = 0
  const files: string[] = []
  for (const src of sources) {
    const list = await collectFileList(src, oldDir)
    files.push(...list.map(f => f.rel))
    total += list.reduce((s, f) => s + f.size, 0)
  }
  let done = 0
  for (const rel of files) {
    const dst = path.join(newDir, rel)
    await fsp.mkdir(path.dirname(dst), { recursive: true })
    await fsp.copyFile(path.join(oldDir, rel), dst)
    done += 1
    report({ phase: 'moving', copiedBytes: done, totalBytes: total })
  }
}

// ---- Main flow ----

export async function runMigration(deps: MigrationDeps, opts: MigrateOptions): Promise<void> {
  const report = makeReporter(deps.getWindow)
  const oldDir = path.resolve(deps.getDataDir())
  const target = path.resolve(opts.targetDir)
  const backendWasAlive = deps.isBackendAlive()

  try {
    report({ phase: 'validating' }, true)
    const totalBytes = await validateTarget(deps, target, oldDir)

    if (backendWasAlive) {
      report({ phase: 'stopping' }, true)
      await deps.stopBackend()
    }

    if (opts.migrateFiles) {
      report({ phase: 'moving', copiedBytes: 0, totalBytes }, true)
      await moveData(oldDir, target, report)
    } else {
      await fsp.mkdir(target, { recursive: true })
    }

    // Config is written only after files are moved; on write failure roll back to the old
    // value (or delete = back to the default directory)
    report({ phase: 'config' }, true)
    const configExisted = fs.existsSync(deps.configPath())
    const oldConfigRaw = configExisted ? fs.readFileSync(deps.configPath(), 'utf8') : null
    try {
      deps.writeConfig(target)
    } catch (err) {
      if (oldConfigRaw !== null) fs.writeFileSync(deps.configPath(), oldConfigRaw)
      else fs.rmSync(deps.configPath(), { force: true })
      throw err
    }

    report({ phase: 'restarting' }, true)
    deps.setDataDir(target)
    deps.startBackend()
    await deps.waitHealthy(deps.getPort(), 20_000)
    deps.markRestartingFalse()
    report({ phase: 'done' }, true)
  } catch (err) {
    const message = (err as Error)?.message || String(err)
    report({ phase: 'error', message }, true)

    // Recovery: the backend should be running; if recovery fails, exit the app explicitly
    // and leave no zombie window behind
    if (backendWasAlive && !deps.isBackendAlive()) {
      deps.setDataDir(oldDir)
      try {
        deps.startBackend()
        await deps.waitHealthy(deps.getPort(), 20_000)
        deps.markRestartingFalse()
      } catch (recoverErr) {
        console.error('[migrate] failed to recover backend:', recoverErr)
        // i18n: user-facing
        dialog.showErrorBox('Fuse 短剧', `存储迁移失败且恢复后台服务失败，应用即将关闭。\n原始错误：${message}`)
        app.quit()
        return
      }
    } else {
      deps.markRestartingFalse()
    }
    throw err
  }
}
