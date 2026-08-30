/**
 * Electron 主进程 — 桌面壳
 *
 * 职责：取空闲端口 → 准备 userData 目录（数据 + workspace 模板）→
 * utilityProcess.fork 拉起后端（esbuild bundle）→ 轮询健康检查 → 开窗口。
 * 后端与窗口同源（http://127.0.0.1:<port>），前端全部相对路径，无 CORS 问题。
 */
import { app, BrowserWindow, dialog, utilityProcess } from 'electron'
import type { UtilityProcess } from 'electron'
import * as net from 'net'
import * as fs from 'fs'
import * as path from 'path'

// 主进程打 CJS 产物，__dirname 天然可用（import.meta.url 在 CJS 下为 undefined）
declare const __dirname: string
// desktop/dist → desktop 根
const DESKTOP_ROOT = path.resolve(__dirname, '..')
// dev 模式下仓库各目录
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '..')
const BACKEND_BUNDLE = path.join(DESKTOP_ROOT, 'build', 'backend.mjs')

/** workspace 模板版本：内置模板更新时递增，触发向用户目录补缺失文件 */
const TEMPLATE_VERSION = '1'

let mainWindow: BrowserWindow | null = null
let backend: UtilityProcess | null = null
let quitting = false

if (!app.requestSingleInstanceLock()) {
  // 双开会抢 SQLite 写锁；让已有实例聚焦窗口即可
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
  // utilityProcess 要求 app ready 之后才能创建
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
  throw new Error(`后端启动超时: ${String(lastErr)}`)
}

/**
 * workspace 模板拷贝（copy-once + 版本标记）：
 * - 目标无版本标记（首启动）或版本较旧 → 只补缺失文件，永不覆盖用户编辑
 * - 版本一致 → 跳过
 */
function syncWorkspaceTemplate(templateDir: string, destDir: string) {
  const marker = path.join(destDir, '.template-version')
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === TEMPLATE_VERSION) return
  fs.cpSync(templateDir, destDir, { recursive: true, force: false, errorOnExist: false })
  fs.writeFileSync(marker, TEMPLATE_VERSION)
}

function resolveResourceDir(): string {
  // 打包后在 resources/（extraResources）；dev 直指仓库目录
  return app.isPackaged ? process.resourcesPath : REPO_ROOT
}

async function bootstrap() {
  try {
    const port = await getFreePort()
    const userData = app.getPath('userData')
    const dataDir = path.join(userData, 'data')
    fs.mkdirSync(dataDir, { recursive: true })
    console.log(`[main] port=${port} userData=${userData}`)

    const resources = resolveResourceDir()
    const templateDir = app.isPackaged
      ? path.join(resources, 'workspace-template')
      : path.join(REPO_ROOT, 'backend', 'workspace')
    const workspaceDir = app.isPackaged
      ? path.join(userData, 'workspace')
      : templateDir
    if (app.isPackaged) syncWorkspaceTemplate(templateDir, workspaceDir)

    const frontendDist = app.isPackaged
      ? path.join(resources, 'frontend')
      : path.join(REPO_ROOT, 'frontend', '.output', 'public')

    // ffmpeg：打包后用随包二进制（resources/bin）；dev 交给 ffmpeg-static 默认解析
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(port),
      HUOBAO_DESKTOP: '1',
      HUOBAO_DATA_DIR: dataDir,
      SQLITE_PATH: path.join(dataDir, 'huobao.sqlite3'),
      WORKSPACE_PATH: workspaceDir,
      FRONTEND_DIST: frontendDist,
    }
    if (app.isPackaged) {
      env.FFMPEG_BIN = path.join(resources, 'bin', 'ffmpeg')
      env.FFPROBE_BIN = path.join(resources, 'bin', 'ffprobe')
    }

    backend = utilityProcess.fork(BACKEND_BUNDLE, [], {
      env,
      serviceName: 'huobao-backend',
      stdio: 'pipe',
    })
    console.log(`[main] backend forked from ${BACKEND_BUNDLE}`)
    backend.stdout?.on('data', chunk => process.stdout.write(`[backend] ${chunk}`))
    backend.stderr?.on('data', chunk => process.stderr.write(`[backend] ${chunk}`))
    backend.on('exit', code => {
      backend = null
      if (!quitting) {
        dialog.showErrorBox('火宝短剧', `后台服务异常退出（code ${code}），应用即将关闭。请重新启动。`)
        app.quit()
      }
    })

    await waitHealthy(port)
    console.log('[main] backend healthy, opening window')

    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      title: '火宝短剧',
      show: false,
    })
    mainWindow.once('ready-to-show', () => mainWindow?.show())
    // 页面标题自带产品名，避免文件路径兜底标题
    mainWindow.on('page-title-updated', e => e.preventDefault())
    await mainWindow.loadURL(`http://127.0.0.1:${port}`)
  } catch (err) {
    console.error('[main] 启动失败:', err)
    dialog.showErrorBox('火宝短剧', `启动失败：\n${(err as Error)?.message || err}`)
    app.quit()
  }
}

app.on('before-quit', () => {
  quitting = true
  backend?.kill()
})

app.on('window-all-closed', () => {
  app.quit()
})
