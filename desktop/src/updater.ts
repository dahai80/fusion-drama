/**
 * In-app updater (no Apple signing scheme, same idea as the Tauri updater)
 *
 * - Feed: FUSION_UPDATE_FEED overrides the whole feed (only effective in unpackaged dev, D10);
 *   default is the single GitHub Releases source
 * - macOS: download zip (.app archive) -> verify sha256 -> unzip -> rename old bundle to .old
 *   backup -> move new bundle into place -> `open` the new app -> current instance quits;
 *   .old is cleaned up on next launch
 * - Windows: download Setup.exe -> verify sha256 -> detached silent install (/S) -> current instance quits
 * - Fully disabled in unpackaged (dev) mode
 */
import { app, ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as fsp from 'fs/promises'
import * as path from 'path'
import crypto from 'crypto'
import { spawn, execFile } from 'child_process'

// D10: FUSION_UPDATE_FEED is dev-only debug — packaged builds follow the default feed,
// preventing local env injection from hijacking the update source
const FEED_URLS = (process.env.FUSION_UPDATE_FEED && !app.isPackaged)
  ? [process.env.FUSION_UPDATE_FEED]
  : ['https://github.com/dahai80/fusion-drama/releases/latest/download/latest.json']

export interface UpdateState {
  status: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error'
  currentVersion: string
  latestVersion?: string
  notes?: string
  error?: string
  downloadProgress?: number
  downloadedFile?: string
}

let state: UpdateState = { status: 'idle', currentVersion: '' }
let mainWindow: () => BrowserWindow | null

function sendProgress(percent: number) {
  state.downloadProgress = percent
  mainWindow()?.webContents.send('fusion:update-progress', percent)
}

function setState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch }
}

// ---- Helpers ----

function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

async function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(file)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

/** Which platform key we are running on (matches the platforms keys in latest.json) */
function platformKey(): string {
  return `${process.platform}-${process.arch}`
}

/** Path to the installed app bundle (.app; only valid on macOS when packaged) */
function installedAppBundle(): string {
  // process.execPath = .../FusionDrama.app/Contents/MacOS/FusionDrama
  return path.resolve(path.dirname(process.execPath), '..', '..')
}

async function fetchFeed(): Promise<{ version: string, notes?: string, platforms: Record<string, { url: string, sha256: string, size?: number }> }> {
  let lastError: unknown
  for (const url of FEED_URLS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const feed = await res.json()
      // i18n: user-facing
      if (!feed?.version || !feed?.platforms) throw new Error('版本清单格式不正确')
      return feed
    } catch (err) {
      lastError = err
    }
  }
  // i18n: user-facing
  throw new Error(`版本清单请求失败（已尝试 ${FEED_URLS.length} 个源）：${(lastError as Error)?.message ?? ''}`)
}

// ---- Check ----

async function doCheck(): Promise<UpdateState> {
  if (!app.isPackaged) {
    // i18n: user-facing
    setState({ status: 'error', error: '开发模式不支持更新' })
    return state
  }
  setState({ status: 'checking', error: undefined })
  try {
    const feed = await fetchFeed()
    const latestVersion = feed.version.replace(/^v/, '')
    setState({
      status: compareVersions(latestVersion, app.getVersion()) > 0 ? 'available' : 'up-to-date',
      latestVersion,
      notes: feed.notes,
      error: undefined,
    })
  } catch (err) {
    setState({ status: 'error', error: (err as Error).message })
  }
  return state
}

// ---- Download ----

async function doDownload(): Promise<UpdateState> {
  if (state.status !== 'available' && state.status !== 'downloaded') {
    // i18n: user-facing
    throw new Error('当前没有可下载的更新')
  }
  const feed = await fetchFeed()
  const asset = feed.platforms[platformKey()]
  // i18n: user-facing
  if (!asset) throw new Error(`暂未提供 ${platformKey()} 平台的更新包`)

  setState({ status: 'downloading', downloadProgress: 0 })
  // No overall timeout for large downloads (progress is stream-driven); a network
  // interruption raises a fetch exception and lands in the error state
  const res = await fetch(asset.url)
  // i18n: user-facing
  if (!res.ok || !res.body) throw new Error(`更新包下载失败（HTTP ${res.status}）`)

  const total = asset.size || Number(res.headers.get('content-length')) || 0
  const dir = path.join(app.getPath('temp'), 'fusion-update')
  await fsp.mkdir(dir, { recursive: true })
  // D11: feed controls the download filename — clamp with basename to prevent path
  // escapes like `..%2F` out of the temp directory
  const fileName = path.basename(decodeURIComponent(asset.url.split('/').pop() || `update-${Date.now()}`))
  const dest = path.join(dir, fileName)

  let received = 0
  let lastReport = 0
  const out = fs.createWriteStream(dest)
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (!out.write(Buffer.from(value))) {
      await new Promise<void>(r => out.once('drain', r))
    }
    const now = Date.now()
    if (total && now - lastReport > 200) {
      lastReport = now
      sendProgress(Math.min(99, Math.round((received / total) * 100)))
    }
  }
  out.end()
  await new Promise<void>((resolve, reject) => {
    out.on('finish', resolve)
    out.on('error', reject)
  })

  // D5: sha256 must exist and match — refuse to install when the feed omits the checksum
  // (no verification = arbitrary code execution surface)
  const actual = await sha256(dest)
  if (!asset.sha256) {
    await fsp.rm(dest, { force: true })
    // i18n: user-facing
    throw new Error('更新清单缺少 sha256 校验和，已拒绝安装')
  }
  if (actual !== asset.sha256) {
    await fsp.rm(dest, { force: true })
    // i18n: user-facing
    throw new Error('更新包校验失败（sha256 不匹配），已取消安装')
  }

  setState({ status: 'downloaded', downloadProgress: 100, downloadedFile: dest })
  sendProgress(100)
  return state
}

// ---- Apply (current instance quits on success; does not return) ----

/** Convert raw errors from the swap phase into actionable user-facing messages (EPERM is the most common: macOS App Management privacy permission) */
function describeApplyError(err: unknown): string {
  const e = err as NodeJS.ErrnoException
  if (e?.code === 'EPERM' || e?.code === 'EACCES') {
    // i18n: user-facing
    return `系统权限不足（${e.code}）：请在 系统设置 → 隐私与安全性 → App 管理 中允许 FusionDrama 后重试；或下载最新 dmg 覆盖安装（数据不受影响）`
  }
  if (e?.code === 'EROFS') {
    // i18n: user-facing
    return '应用正运行在只读位置（可能直接在 dmg 挂载卷里），请先把 FusionDrama 拖入「应用程序」再更新'
  }
  return e?.message || String(err)
}

async function doApply(): Promise<void> {
  if (state.status !== 'downloaded' || !state.downloadedFile) {
    // No "find stale artifacts in temp" fallback: running unverified leftovers outside
    // the state machine is a security shortcut we refuse to take
    // i18n: user-facing
    throw new Error('请先下载更新')
  }
  const downloaded = state.downloadedFile

  if (process.platform === 'darwin') {
    const bundle = installedAppBundle()
    const tmpExtract = path.join(app.getPath('temp'), `fusion-update-extract-${Date.now()}`)
    try {
      await new Promise<void>((resolve, reject) => {
        execFile('unzip', ['-q', '-o', downloaded, '-d', tmpExtract], err => (err ? reject(err) : resolve()))
      })
      const newApp = path.join(tmpExtract, 'FusionDrama.app')
      // i18n: user-facing
      if (!fs.existsSync(newApp)) throw new Error('更新包内容异常（未找到 FusionDrama.app）')

      const oldBundle = `${bundle}.old`
      fs.rmSync(oldBundle, { recursive: true, force: true })
      fs.renameSync(bundle, oldBundle)
      try {
        fs.renameSync(newApp, bundle)
      } catch (err) {
        // Move-into-place failed: roll back the old bundle
        fs.renameSync(oldBundle, bundle)
        throw err
      }
      // Launch the new app detached, then the current instance quits; .old backup is cleaned up on next launch
      spawn('open', [bundle], { detached: true, stdio: 'ignore' }).unref()
      app.quit()
      return
    } catch (err) {
      throw new Error(describeApplyError(err))
    } finally {
      // No failure path may leave extraction leftovers (the old implementation leaked the whole .app when rename failed)
      fs.rmSync(tmpExtract, { recursive: true, force: true })
    }
  }

  if (process.platform === 'win32') {
    // NSIS silent install: launch the installer detached, then quit the current instance
    spawn(downloaded, ['/S'], { detached: true, stdio: 'ignore' }).unref()
    app.quit()
    return
  }

  // i18n: user-facing
  throw new Error(`不支持的平台: ${process.platform}`)
}

// ---- Registration ----

export function registerUpdater(getWindow: () => BrowserWindow | null): void {
  mainWindow = getWindow
  state.currentVersion = app.getVersion()

  ipcMain.handle('fusion:update-state', () => state)
  ipcMain.handle('fusion:update-check', () => doCheck())
  ipcMain.handle('fusion:update-download', async () => {
    try {
      return await doDownload()
    } catch (err) {
      setState({ status: 'error', error: (err as Error).message })
      throw err
    }
  })
  ipcMain.handle('fusion:update-apply', async () => {
    try {
      await doApply()
    } catch (err) {
      // Persist the error into state so the renderer error row shows the concrete reason
      // (otherwise users only see a generic "install failed" toast)
      setState({ status: 'error', error: (err as Error).message })
      throw err
    }
  })

  // Silent check once after startup (when a new version is found the renderer is notified
  // via update-state polling/toast)
  setTimeout(() => { if (!quittingApp()) void doCheck() }, 20_000).unref?.()

  // Clean up the .old backup bundle left by the previous update. Delay 3s: on the first
  // launch after an update the old instance may still be exiting, and deleting immediately
  // could race its final writes; failure is non-blocking (retried on next launch)
  if (app.isPackaged && process.platform === 'darwin') {
    setTimeout(() => {
      const oldBundle = `${installedAppBundle()}.old`
      try {
        if (fs.existsSync(oldBundle)) fs.rmSync(oldBundle, { recursive: true, force: true })
      } catch { /* leftover retried on next launch */ }
    }, 3000).unref?.()
  }
}

function quittingApp(): boolean {
  // updater holds no quitting state of its own to avoid a circular dependency: main.ts sets and injects the global
  return (globalThis as { __fusionQuitting?: boolean }).__fusionQuitting === true
}

/** Called by main.ts on before-quit */
export function markQuitting(): void {
  ;(globalThis as { __fusionQuitting?: boolean }).__fusionQuitting = true
}
