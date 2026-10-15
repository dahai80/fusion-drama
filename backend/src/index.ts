import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import path from 'path'
import { fileURLToPath } from 'url'

import dramas from './routes/dramas.js'
import episodes from './routes/episodes.js'
import storyboards from './routes/storyboards.js'
import scenes from './routes/scenes.js'
import characters from './routes/characters.js'
import tasks from './routes/tasks.js'
import upload from './routes/upload.js'
import aiConfigs, { aiProviders } from './routes/aiConfigs.js'
import stylePresets from './routes/stylePresets.js'
import prompts from './routes/prompts.js'
import agent from './routes/agent.js'
import merge from './routes/merge.js'
import skills from './routes/skills.js'
import props from './routes/props.js'
import settings from './routes/settings.js'
import storage from './routes/storage.js'
import serverUpdate from './routes/serverUpdate.js'
import { requestLogger, errorHandler } from './middleware/logger.js'
import { requireApiToken, requireSafeContentType } from './middleware/auth.js'
import { db, schema } from './db/index.js'
import { eq } from 'drizzle-orm'
import { now } from './utils/response.js'
import { DATA_ROOT, STORAGE_ROOT } from './utils/paths.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

const app = new Hono()

// Middleware
// D18: 桌面版窗口加载 http://127.0.0.1:<动态端口>，Origin 与后端同源 → CORS 不参与，无需为桌面版加白名单；
// 白名单仅覆盖 dev 前端(3013)/本机后端(5679)跨源开发场景。生产部署同源托管，origin 白名单不影响 API 工具直连
app.use('*', cors({
  origin: ['http://localhost:3013', 'http://localhost:5679', 'http://127.0.0.1:3013', 'http://127.0.0.1:5679'],
  credentials: true,
}))
app.use('*', requestLogger)
app.use('*', errorHandler)

// Health check（version 供部署巡检/更新检查核对当前运行版本）
app.get('/api/v1/health', (c) => c.json({
  status: 'ok',
  version: process.env.FUSION_VERSION || undefined,
  timestamp: new Date().toISOString(),
}))

// API routes — 写方法 Content-Type 白名单 + 可选 Bearer 鉴权（FUSION_API_TOKEN）
const api = new Hono()
api.use('*', requireSafeContentType)
api.use('*', requireApiToken)
api.route('/dramas', dramas)
api.route('/episodes', episodes)
api.route('/storyboards', storyboards)
api.route('/scenes', scenes)
api.route('/characters', characters)
api.route('/tasks', tasks)
api.route('/upload', upload)
api.route('/ai-configs', aiConfigs)
api.route('/ai-providers', aiProviders)
api.route('/style-presets', stylePresets)
api.route('/prompts', prompts)
api.route('/agent', agent)
api.route('/merge', merge)
api.route('/skills', skills)
api.route('/props', props)
api.route('/storage', storage)
api.route('/settings', settings)
api.route('/server-update', serverUpdate)

app.route('/api/v1', api)

// Serve static files (storage) — 仅服务 STORAGE_ROOT（DATA_ROOT/static），
// 绝不能服务 DATA_ROOT 本身：否则 /static/fusion.sqlite3 可整库下载（含明文 API key）
// 生成的图片/视频按 uuid 命名、内容不变，标记为 immutable 让浏览器长缓存
app.use('/static/*', async (c, next) => {
  await next()
  if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable')
  // C3: MIME 按扩展名返回，禁嗅探防止把上传物嗅探成 text/html 执行
  c.header('X-Content-Type-Options', 'nosniff')
})
app.use('/static/*', serveStatic({ root: STORAGE_ROOT, rewriteRequestPath: p => p.replace(/^\/static/, '') || '/' }))

// Serve frontend (production build) — 桌面版由主进程注入 FRONTEND_DIST（resources/frontend）
const distPath = process.env.FRONTEND_DIST || path.join(projectRoot, 'frontend', 'dist')
app.use('*', serveStatic({ root: distPath }))
app.get('*', serveStatic({ root: distPath, path: 'index.html' }))

const port = Number(process.env.PORT || 5679)
console.log(`🚀 Fusion Drama TS server on http://localhost:${port}`)

// 进程重启后内存中的轮询线程全部丢失,残留的 processing 任务永远不会完成,
// 启动时统一标记为 failed,避免前端一直显示"生成中"
db.update(schema.sysTask)
  .set({ status: 'failed', errorMsg: '服务重启，生成任务中断，请重试', updatedAt: now() })
  .where(eq(schema.sysTask.status, 'processing'))
  .then(res => {
    const affected = res?.changes ?? 0
    if (affected > 0) console.log(`🔁 已清理 ${affected} 个中断的生成任务`)
  })
  .catch(err => console.error('清理中断任务失败:', err?.message))

// video_merges 同样存在重启孤儿：merge 由 doMerge 异步执行，进程重启后永远停在 processing
db.update(schema.videoMerges)
  .set({ status: 'failed', errorMsg: '服务重启，拼接任务中断，请重试' })
  .where(eq(schema.videoMerges.status, 'processing'))
  .then(res => {
    const affected = res?.changes ?? 0
    if (affected > 0) console.log(`🔁 已清理 ${affected} 个中断的拼接任务`)
  })
  .catch(err => console.error('清理中断拼接任务失败:', err?.message))

// 绑定地址：desktop 模式（主进程注入 FUSION_BIND_HOST）只听回环，杜绝局域网可达；
// 服务器部署默认全网卡（Docker 需要），配合 FUSION_API_TOKEN 鉴权
const hostname = process.env.FUSION_BIND_HOST || undefined

// D9: 主进程 getFreePort 与后端 bind 之间有 TOCTOU 窗口，端口被抢占时桌面模式下
// 降级到临时端口并把实际端口经 utilityProcess IPC 回传主进程；服务器部署直接报错退出
const ppGlobal = (process as unknown as { parentPort?: { postMessage: (m: unknown) => void } }).parentPort

function reportPort(actual: number) {
  // utilityProcess 子进程运行时注入 process.parentPort（Node 类型未声明）
  const pp = (process as unknown as { parentPort?: { postMessage: (m: unknown) => void } }).parentPort
  if (pp) {
    pp.postMessage({ type: 'backend-port', port: actual })
  }
}

const primaryServer = serve({ fetch: app.fetch, port, hostname })
primaryServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code !== 'EADDRINUSE' || !ppGlobal) {
    console.error(`[server] listen failed on port ${port}:`, err)
    process.exit(1)
  }
  console.warn(`[server] port ${port} occupied, falling back to ephemeral port`)
  const fallback = serve({ fetch: app.fetch, port: 0, hostname })
  fallback.on('error', (err2: NodeJS.ErrnoException) => {
    console.error('[server] ephemeral listen failed:', err2)
    process.exit(1)
  })
  const addr = fallback.address()
  if (addr && typeof addr === 'object') {
    reportPort(addr.port)
    console.log(`🚀 Fusion Drama TS server on http://localhost:${addr.port}`)
  }
})
reportPort(port)
