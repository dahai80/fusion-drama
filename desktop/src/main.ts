/**
 * Electron main process — desktop shell
 *
 * Responsibilities: read storage config -> acquire a free port -> prepare the userData
 * directory (data + workspace template) -> utilityProcess.fork the backend (esbuild bundle)
 * -> poll health checks -> open the window.
 * Backend and window share the same origin (http://127.0.0.1:<port>); the frontend uses
 * relative paths exclusively, so there is no CORS problem.
 *
 * The backend is restartable (startBackend): storage location migration = stop backend ->
 * move files -> swap currentDataDir -> restart backend (see migrate.ts); while
 * backendRestarting, the "abnormal exit" dialog is suppressed.
 */
import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'
import { spawn } from 'child_process'
import * as crypto from 'crypto'
import * as net from 'net'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import * as os from 'os'
import { registerMigrationIpc } from './migrate'
import { registerUpdater, markQuitting } from './updater'

// Main process builds to CJS, so __dirname is naturally available (import.meta.url is undefined under CJS)
declare const __dirname: string
// desktop/dist -> desktop root
const DESKTOP_ROOT = path.resolve(__dirname, '..')
// Repository directories in dev mode
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '..')
const BACKEND_BUNDLE = path.join(DESKTOP_ROOT, 'build', 'backend.mjs')

/** Workspace template version: bumped when the bundled template updates, triggering a top-up of missing files in the user directory */
const TEMPLATE_VERSION = '4'
const STORAGE_CONFIG_FILE = 'storage-config.json'

let mainWindow: BrowserWindow | null = null
let backend: UtilityProcess | null = null
let quitting = false
let backendRestarting = false
let backendPort = 0
let currentDataDir = ''
// R4: auto-restart the backend on crash (exponential backoff), give up only after 3 consecutive
// failures — a single uncaught exception no longer takes the whole GUI down
let backendRestartAttempts = 0

// userData is explicitly separated by mode: packaged / dev builds stay independent (database,
// uploaded files, and single-instance lock are all isolated); we do not rely on package.json
// naming (a packaged build with the same name as dev would make the single-instance lock kill the wrong instance)
app.setPath('userData', path.join(
  app.getPath('appData'),
  app.isPackaged ? 'FusionDrama' : 'FusionDrama-Dev',
))

if (!app.requestSingleInstanceLock()) {
  // Two instances would fight over the SQLite write lock; just let the existing instance focus its window
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  // utilityProcess can only be created after app ready
  app.whenReady().then(bootstrap)
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo
      srv.close(() => resolve(addr.port))
    })
    srv.on('error', reject)
  })
}

async function waitHealthy(port: number, timeoutMs = 15000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastErr: unknown = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/health`)
      if (res.ok) return
    } catch (err) {
      lastErr = err
    }
    await new Promise(r => setTimeout(r, 300))
  }
  // i18n: user-facing
  throw new Error(`后端启动超时: ${String(lastErr)}`)
}

// ---- Storage config (userData/storage-config.json; must live outside the data directory) ----

function storageConfigPath(): string {
  return path.join(app.getPath('userData'), STORAGE_CONFIG_FILE)
}

/**
 * Reads the storage config and returns the current data directory. Fault-tolerance chain:
 * file missing -> default; parse failure/invalid -> warn + default (the broken file is left
 * untouched to preserve the scene); directory creation failure (disk absent/permissions) ->
 * warn + default. Never blocks startup.
 */
function loadStorageConfig(): string {
  const fallback = path.join(app.getPath('userData'), 'data')
  const file = storageConfigPath()
  if (!fs.existsSync(file)) return fallback
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    const dir = parsed?.dataDir
    if (typeof dir !== 'string' || !path.isAbsolute(dir)) throw new Error('dataDir is not an absolute path')
    fs.mkdirSync(dir, { recursive: true })
    return dir
  } catch (err) {
    console.warn(`[main] failed to read ${STORAGE_CONFIG_FILE}, falling back to default data directory: ${(err as Error).message}`)
    return fallback
  }
}

/** Atomically writes the storage config (tmp + rename); called only from the migration success path */
export function writeStorageConfig(dataDir: string): void {
  const file = storageConfigPath()
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, dataDir }, null, 2))
  fs.renameSync(tmp, file)
}

/** Lowercases paths for win32 comparisons */
export function normCase(p: string): string {
  return process.platform === 'win32' ? p.toLowerCase() : p
}

// ---- Workspace template ----

/**
 * Workspace template upgrade (checklist 1107 #6: hash-based three-way merge):
 * - First launch (no version marker) -> top-up copy of everything (force:false, never overwrite)
 * - Version upgrade -> per-file decision:
 *     destination identical to new version -> skip
 *     destination identical to "last deployed baseline" (user never edited it) -> overwrite with new version
 *     destination edited by the user -> keep the user version; new version lands as <file>.new
 *   The baseline lives in .template-hashes (sha256 of every file after the last deployment)
 * Fixes two defects of the old behavior: skills never updated (fixes never reached users),
 * prompts blindly overwritten (destroying user edits)
 */
function syncWorkspaceTemplate(templateDir: string, destDir: string) {
  const marker = path.join(destDir, '.template-version')
  const hashFile = path.join(destDir, '.template-hashes')
  const firstRun = !fs.existsSync(marker)
  if (!firstRun && fs.readFileSync(marker, 'utf8').trim() === TEMPLATE_VERSION) return

  const baseline = new Map<string, string>()
  if (fs.existsSync(hashFile)) {
    for (const line of fs.readFileSync(hashFile, 'utf8').split('\n')) {
      const idx = line.indexOf('  ')
      if (idx > 0) baseline.set(line.slice(idx + 2).trim(), line.slice(0, idx).trim())
    }
  }

  const walk = (dir: string): string[] => {
    const out: string[] = []
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) out.push(...walk(p))
      else if (e.isFile()) out.push(p)
    }
    return out
  }

  const sha256 = (f: string) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')
  const newHashes: string[] = []
  let copied = 0, overwritten = 0, keptNew = 0
  for (const abs of walk(templateDir)) {
    const rel = path.relative(templateDir, abs).replace(/\\/g, '/')
    const dest = path.join(destDir, rel)
    const newHash = sha256(abs)
    newHashes.push(`${newHash}  ${rel}`)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    if (firstRun || !fs.existsSync(dest)) {
      fs.cpSync(abs, dest, { force: false })
      copied++
      continue
    }
    const curHash = sha256(dest)
    if (curHash === newHash) continue
    const oldHash = baseline.get(rel)
    if (oldHash && curHash === oldHash) {
      fs.cpSync(abs, dest, { force: true })
      overwritten++
    } else {
      fs.cpSync(abs, `${dest}.new`, { force: true })
      keptNew++
      console.warn(`[main] workspace file user-modified, new template saved as ${rel}.new`)
    }
  }
  fs.writeFileSync(hashFile, newHashes.sort().join('\n') + '\n')
  fs.writeFileSync(marker, TEMPLATE_VERSION)
  console.log(`[main] workspace template synced: copied=${copied} overwritten=${overwritten} keptAsNew=${keptNew}`)
}

function resolveResourceDir(): string {
  // Under resources/ when packaged (extraResources); dev points straight at the repo directory
  return app.isPackaged ? process.resourcesPath : REPO_ROOT
}

// ---- Backend process (restartable) ----

/** Stops the backend and waits for exit (kill, then wait for the exit event, 5s timeout force-kill); sets backendRestarting to suppress the fatal dialog */
function stopBackend(): Promise<void> {
  return new Promise((resolve) => {
    const cur = backend
    if (!cur) return resolve()
    backendRestarting = true
    const timer = setTimeout(() => cur.kill(), 5000)
    cur.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    cur.kill()
  })
}

function startBackend(): void {
  const resources = resolveResourceDir()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(backendPort),
    FUSION_DESKTOP: '1',
    // Desktop backend binds loopback only: closes both the port-selection TOCTOU window and the LAN-reachable surface
    FUSION_BIND_HOST: '127.0.0.1',
    // Single source of truth for the data directory: after restart/migration only currentDataDir changes
    FUSION_DATA_DIR: currentDataDir,
    SQLITE_PATH: path.join(currentDataDir, 'fusion.sqlite3'),
    WORKSPACE_PATH: currentWorkspaceDir,
    FRONTEND_DIST: currentFrontendDist,
  }
  if (app.isPackaged) {
    const exe = process.platform === 'win32' ? '.exe' : ''
    env.FFMPEG_BIN = path.join(resources, 'bin', `ffmpeg${exe}`)
    env.FFPROBE_BIN = path.join(resources, 'bin', `ffprobe${exe}`)
  }

  backend = utilityProcess.fork(BACKEND_BUNDLE, [], {
    env,
    serviceName: 'fusion-backend',
    stdio: 'pipe',
  })
  console.log(`[main] backend forked from ${BACKEND_BUNDLE}`)
  // D9: the backend's actual bound port may degrade to an ephemeral port on preemption; the listening report message syncs it to all consumers
  backend.on('message', (msg: { type?: string, port?: number }) => {
    if (msg?.type === 'backend-port' && typeof msg.port === 'number' && msg.port !== backendPort) {
      console.log(`[main] backend reported actual port ${msg.port} (requested ${backendPort})`)
      backendPort = msg.port
    }
  })
  backend.stdout?.on('data', chunk => process.stdout.write(`[backend] ${chunk}`))
  backend.stderr?.on('data', chunk => process.stderr.write(`[backend] ${chunk}`))
  backend.on('exit', code => {
    backend = null
    // Exits during migration/restart are expected and handled by the caller
    if (!quitting && !backendRestarting) {
      backendRestartAttempts += 1
      if (backendRestartAttempts > 3) {
        // i18n: user-facing
        dialog.showErrorBox('Fuse 短剧', `后台服务多次异常退出（code ${code}），应用即将关闭。请重新启动。`)
        app.quit()
        return
      }
      const delay = 3_000 * 2 ** (backendRestartAttempts - 1)
      console.log(`[main] backend exited (code ${code}), restarting in ${Math.round(delay / 1000)}s (attempt ${backendRestartAttempts}/3)`)
      setTimeout(async () => {
        if (quitting || backendRestarting) return
        try {
          startBackend()
          await waitHealthy(backendPort, 30_000)
          backendRestartAttempts = 0
          console.log('[main] backend restarted healthy')
          // Reload to the new port page while the window is still open (the backend may have switched ports due to preemption; D9 IPC already synced backendPort)
          if (mainWindow) await mainWindow.loadURL(`http://127.0.0.1:${backendPort}`)
        } catch (err) {
          console.error('[main] backend restart failed:', err)
          // Failures recurse through the exit event counter; the dialog quits the app after 3 consecutive failures
        }
      }, delay)
    }
  })
}

// ---- fm-server (cross-session memory, optional bootstrap) ----
// The desktop shell auto-starts fusion-memory: if already running (manual/cluster), reuse it; otherwise spawn it from
// packaged resources (bin/fm-server) or the dev machine's fusion-memory build output. Missing binary / spawn failure
// always degrades gracefully — memory feature off, settings page shows offline, main flow unaffected.
let fmServerProc: ReturnType<typeof spawn> | null = null

async function probeFmServer(timeoutMs = 2000): Promise<boolean> {
    try {
        const res = await fetch('http://127.0.0.1:11435/healthz', { signal: AbortSignal.timeout(timeoutMs) })
        return res.ok
    } catch {
        return false
    }
}

function fmServerBinCandidates(): string[] {
    const exe = process.platform === 'win32' ? '.exe' : ''
    return [
        path.join(resolveResourceDir(), 'bin', `fm-server${exe}`),
        path.join(os.homedir(), 'fusion', 'fusion-memory', 'target', 'release', `fm-server${exe}`),
    ]
}

async function ensureFmServer(): Promise<void> {
    if (await probeFmServer()) {
        console.log('[main] fm-server already running on :11435, reuse')
        return
    }
    for (const bin of fmServerBinCandidates()) {
        if (!fs.existsSync(bin)) continue
        console.log(`[main] spawning fm-server from ${bin}`)
        fmServerProc = spawn(bin, [], { stdio: 'pipe' })
        fmServerProc.stdout?.on('data', chunk => process.stdout.write(`[fm-server] ${chunk}`))
        fmServerProc.stderr?.on('data', chunk => process.stderr.write(`[fm-server] ${chunk}`))
        fmServerProc.on('exit', code => {
            console.log(`[main] fm-server exited (code ${code})`)
            fmServerProc = null
        })
        // Startup wait (sled open + HTTP listen, seconds locally; 15s cap)
        for (let i = 0; i < 30; i++) {
            if (await probeFmServer(1000)) {
                console.log('[main] fm-server healthy, cross-session memory available')
                return
            }
            if (fmServerProc === null) break
            await new Promise(r => setTimeout(r, 500))
        }
        console.warn('[main] fm-server spawned but did not become healthy, memory degrades')
        return
    }
    console.warn('[main] fm-server binary not found, cross-session memory unavailable (settings shows offline)')
}

function stopFmServer(): void {
    if (fmServerProc) {
        console.log('[main] stopping fm-server')
        fmServerProc.kill()
        fmServerProc = null
    }
}

// ---- Window ----

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    // i18n: user-facing
    title: 'Fuse 短剧',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  // The page title already carries the product name; prevent fallback to a file-path title
  mainWindow.on('page-title-updated', e => e.preventDefault())
  mainWindow.on('closed', () => { mainWindow = null })
  // External links always go to the system browser: no new in-app windows (e.g. the settings page "visit bench.dpdns.org to get a Key")
  const isAppUrl = (url: string) => url.startsWith(`http://127.0.0.1:${backendPort}`)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !isAppUrl(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  // Intercept and redirect to the browser when the main window unexpectedly navigates to an external address
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (isAppUrl(url)) return
    e.preventDefault()
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
  return mainWindow.loadURL(`http://127.0.0.1:${backendPort}`)
}

// ---- Bootstrap ----

let currentWorkspaceDir = ''
let currentFrontendDist = ''

async function bootstrap() {
  try {
    backendPort = await getFreePort()
    const userData = app.getPath('userData')
    console.log(`[main] port=${backendPort} userData=${userData}`)

    // Storage config is read first (decides the data directory); on a broken config fall back to the default without blocking startup
    currentDataDir = loadStorageConfig()
    fs.mkdirSync(currentDataDir, { recursive: true })

    const resources = resolveResourceDir()
    const templateDir = app.isPackaged
      ? path.join(resources, 'workspace-template')
      : path.join(REPO_ROOT, 'backend', 'workspace')
    currentWorkspaceDir = app.isPackaged
      ? path.join(userData, 'workspace')
      : templateDir
    if (app.isPackaged) syncWorkspaceTemplate(templateDir, currentWorkspaceDir)

    currentFrontendDist = app.isPackaged
      ? path.join(resources, 'frontend')
      : path.join(REPO_ROOT, 'frontend', '.output', 'public')

    startBackend()
    await waitHealthy(backendPort)
    backendRestartAttempts = 0
    console.log('[main] backend healthy, opening window')
    // fm-server bootstrap does not block window opening: on slow/failed spawn the window opens anyway and memory degrades gracefully
    void ensureFmServer()
    await createWindow()
  } catch (err) {
    console.error('[main] bootstrap failed:', err)
    // i18n: user-facing
    dialog.showErrorBox('Fuse 短剧', `启动失败：\n${(err as Error)?.message || err}`)
    app.quit()
  }
}

// ---- IPC: storage location ----

/** Writability probe */
async function assertWritable(dir: string): Promise<void> {
  const probe = path.join(dir, `.fusion-probe-${Date.now()}`)
  await fsp.writeFile(probe, 'probe')
  await fsp.rm(probe)
}

ipcMain.handle('fusion:pick-directory', async () => {
  // i18n: user-facing
  if (!mainWindow) return { ok: false, error: '窗口未就绪' }
  const res = await dialog.showOpenDialog(mainWindow, {
    // i18n: user-facing
    title: '选择数据存储目录',
    properties: ['openDirectory', 'createDirectory'],
  })
  if (res.canceled || !res.filePaths[0]) return { ok: false, canceled: true }
  const target = path.resolve(res.filePaths[0])

  // Light validation (full validation re-runs in the migration engine at start-migration time)
  const a = normCase(path.resolve(currentDataDir))
  const b = normCase(target)
  // i18n: user-facing
  if (b === a) return { ok: false, error: '不能选择当前数据目录' }
  // i18n: user-facing
  if (b.startsWith(a + path.sep)) return { ok: false, error: '目标目录在当前数据目录内部' }
  // i18n: user-facing
  if (a.startsWith(b + path.sep)) return { ok: false, error: '目标目录是当前数据目录的上级目录' }
  try {
    await assertWritable(target)
  } catch {
    // i18n: user-facing
    return { ok: false, error: '目标目录不可写' }
  }

  let freeBytes: number | null = null
  try {
    const st = await fsp.statfs(target)
    freeBytes = st.bavail * st.bsize
  } catch { /* statfs unavailable: skip the free-space display */ }
  return { ok: true, path: target, freeBytes }
})

// Storage migration IPC (validation/move/restart sequence in migrate.ts)
const migrationDeps = {
  getWindow: () => mainWindow,
  getDataDir: () => currentDataDir,
  setDataDir: (d: string) => { currentDataDir = d },
  getPort: () => backendPort,
  isBackendAlive: () => backend !== null,
  stopBackend,
  startBackend,
  waitHealthy,
  markRestartingFalse: () => { backendRestarting = false },
  writeConfig: writeStorageConfig,
  configPath: storageConfigPath,
  normCase,
}
registerMigrationIpc(migrationDeps)
registerUpdater(() => mainWindow)

app.on('before-quit', () => {
  quitting = true
  markQuitting()
  backend?.kill()
  stopFmServer()
})

app.on('window-all-closed', () => {
  app.quit()
})
