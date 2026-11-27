import 'dotenv/config'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import crypto from 'crypto'
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
import customProviders from './routes/custom-providers.js'
import rag from './routes/rag.js'
import memory from './routes/memory.js'
import supervisor from './routes/supervisor.js'
import stylePresets from './routes/stylePresets.js'
import prompts from './routes/prompts.js'
import agent from './routes/agent.js'
import merge from './routes/merge.js'
import skills from './routes/skills.js'
import props from './routes/props.js'
import settings from './routes/settings.js'
import novel from './routes/novel.js'
import storage from './routes/storage.js'
import serverUpdate from './routes/serverUpdate.js'
import { requestLogger, errorHandler } from './middleware/logger.js'
import { requireApiToken, requireSafeContentType, hasValidApiToken } from './middleware/auth.js'
import { db, schema } from './db/index.js'
import { eq } from 'drizzle-orm'
import { now, notFound } from './utils/response.js'
import { DATA_ROOT, STORAGE_ROOT } from './utils/paths.js'
import fs from 'fs'
import { sqlite } from './db/index.js'
import { currentVersion } from './db/migrations.js'
import { getActiveConfig } from './services/ai.js'
import { getServerApiToken, setServerApiToken } from './services/app-settings.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')

const app = new Hono()

// Middleware
// D18: the desktop window loads http://127.0.0.1:<dynamic port>, Origin is same-origin with
// the backend → CORS is not involved, no desktop whitelist needed; the whitelist only covers
// cross-origin dev (frontend 3013 / local backend 5679). Production is same-origin hosted,
// so the origin whitelist does not affect direct API tool access
app.use('*', cors({
  origin: ['http://localhost:3013', 'http://localhost:5679', 'http://127.0.0.1:3013', 'http://127.0.0.1:5679'],
  credentials: true,
}))
app.use('*', requestLogger)
app.use('*', errorHandler)

// Health check (version lets deployment inspection / update checks verify the running version)
// NFR-OPS-2: extended self-check — schema version / storage writable / local engine reachability
// (engineOk is only probed when a fusion local engine is configured; best-effort, never 503)
app.get('/api/v1/health', async (c) => {
  let storageWritable = true
  try {
    const probe = path.join(DATA_ROOT, `.health-probe-${Date.now()}`)
    fs.writeFileSync(probe, 'ok')
    fs.rmSync(probe, { force: true })
  } catch { storageWritable = false }

  let engineOk: boolean | null = null
  try {
    const cfg = await getActiveConfig('video')
    if (cfg && cfg.provider === 'fusion' && cfg.baseUrl) {
      // fusion-mlx with auth enabled: a missing Authorization header always 401s → engineOk stays false
      const headers = cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : undefined
      const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/v1/models`, { headers, signal: AbortSignal.timeout(2000) })
      engineOk = res.ok
    }
  } catch { engineOk = false }

  return c.json({
    status: 'ok',
    version: process.env.FUSION_VERSION || undefined,
    schemaVersion: currentVersion(sqlite),
    storageWritable,
    engineOk,
  })
})

// API routes — write-method Content-Type whitelist + optional Bearer auth (FUSION_API_TOKEN)
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
api.route('/custom-providers', customProviders)
api.route('/rag', rag)
api.route('/memory', memory)
api.route('/supervisor', supervisor)
api.route('/style-presets', stylePresets)
api.route('/prompts', prompts)
api.route('/agent', agent)
api.route('/merge', merge)
api.route('/skills', skills)
api.route('/props', props)
api.route('/storage', storage)
api.route('/settings', settings)
api.route('/novel', novel)
api.route('/server-update', serverUpdate)

app.route('/api/v1', api)

// Serve static files (storage) — only serve STORAGE_ROOT (DATA_ROOT/static),
// never DATA_ROOT itself: otherwise /static/fusion.sqlite3 would allow downloading
// the whole DB (including plaintext API keys). Generated images/videos are uuid-named
// and immutable in content, so mark them immutable for long browser caching
// Audit 1107 F-7: /static must honor the API token too — generated media is user
// data and the whole DB download risk was already excluded above, but images/
// videos are still per-tenant assets. Token accepted via header (fetch), cookie
// (img/video tags can't set headers — frontend mirrors token into cookie), or
// ?token= (download links). Unset token = loopback/desktop mode, no gate.
app.use('/static/*', async (c, next) => {
  const API_TOKEN = process.env.FUSION_API_TOKEN || ''
  if (API_TOKEN && !hasValidApiToken(c)) {
    console.warn(`[auth] unauthorized static request ${c.req.path}`)
    return c.json({ code: 401, message: 'Unauthorized' }, 401)
  }
  await next()
  if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable')
  // C3: serve MIME by extension, disable sniffing so uploads cannot be sniffed into executable text/html
  c.header('X-Content-Type-Options', 'nosniff')
})
app.use('/static/*', serveStatic({ root: STORAGE_ROOT, rewriteRequestPath: p => p.replace(/^\/static/, '') || '/' }))

// Serve frontend (production build) — desktop injects FRONTEND_DIST via the main process (resources/frontend)
const distPath = process.env.FRONTEND_DIST || path.join(projectRoot, 'frontend', 'dist')
// API 404 hard gate: unmatched /api/v1/* routes return a JSON 404, never fall through to the
// SPA index.html fallback below — silently returning HTML masks caller path/param errors as
// "success responses" (debugging shows a frontend page fragment; real-world pitfall, see
// audit/fusion-drama-audit-1024.md §4)
// i18n: user-facing
app.use('/api/v1/*', async (c) => notFound(c, `API 路由不存在: ${c.req.method} ${c.req.path}`))
app.use('*', serveStatic({ root: distPath }))
app.get('*', serveStatic({ root: distPath, path: 'index.html' }))

const port = Number(process.env.PORT || 5679)
console.log(`🚀 Fusion Drama TS server on http://localhost:${port}`)

// After a process restart all in-memory polling threads are lost; leftover processing
// tasks would never finish, so mark them failed at startup to keep the frontend
// from showing "generating" forever
// T3: listen on the port only after the cleanup await completes — without the await,
// "cleanup marks failed" races with late write-backs from tasks in flight before the
// restart (if cleanup lands first the write-back is blocked by isStaleTarget/status
// checks; the other order produces ghost completions)
try {
  const [t, m] = await Promise.all([
    db.update(schema.sysTask)
      // i18n: user-facing
      .set({ status: 'failed', errorMsg: '服务重启，生成任务中断，请重试', updatedAt: now() })
      .where(eq(schema.sysTask.status, 'processing')),
    db.update(schema.videoMerges)
      // i18n: user-facing
      .set({ status: 'failed', errorMsg: '服务重启，拼接任务中断，请重试' })
      .where(eq(schema.videoMerges.status, 'processing')),
  ])
  const ta = t?.changes ?? 0
  const ma = m?.changes ?? 0
  if (ta > 0 || ma > 0) console.log(`🔁 cleaned up ${ta} interrupted generation tasks and ${ma} interrupted merge tasks`)

  // E6: on kill -9, merge's finally cleanup never runs and stale concat list files
  // remain in static/temp — clear them all at startup (the directory itself is
  // rebuilt per merge and only holds one-shot lists)
  const tempDir = path.join(STORAGE_ROOT, 'temp')
  try {
    const stale = fs.readdirSync(tempDir)
    for (const f of stale) fs.rmSync(path.join(tempDir, f), { force: true })
    if (stale.length) console.log(`🔁 cleaned up ${stale.length} leftover merge temp files`)
  } catch { /* missing directory = nothing leftover */ }
} catch (err: any) {
  console.error('failed to clean up interrupted tasks:', err?.message)
}

// Bind address: desktop mode (main process injects FUSION_BIND_HOST) listens on loopback
// only, keeping LAN unreachable; server deployments default to all interfaces (required
// by Docker), paired with FUSION_API_TOKEN auth
const hostname = process.env.FUSION_BIND_HOST || undefined

// FR-P0-1: external deployments (not bound to 127.0.0.1) must have a >=32B token —
// desktop/dev (127.0.0.1 binding) keep working without auth.
// Audit 1107 F-1: derive loopback from the VALUE, not mere presence —
// FUSION_BIND_HOST=0.0.0.0 must bind all interfaces AND keep token enforcement.
// P3 first-boot auto-generation (audit 1024): when not explicitly configured, generate a
// 64 hex token persisted to app_settings.server_api_token (reused across restarts, does
// not overwrite the user's explicit config in the DB) so no unauthenticated exposure
const bindHost = process.env.FUSION_BIND_HOST || ''
const isLoopbackOnly = bindHost === '127.0.0.1' || bindHost === 'localhost' || bindHost === '::1'
if (!isLoopbackOnly && (process.env.FUSION_API_TOKEN || '').length < 32) {
    const existing = getServerApiToken()
    if (existing && existing.length >= 32) {
        process.env.FUSION_API_TOKEN = existing
        console.log('[server] using the API token generated on first boot (app_settings.server_api_token); delete that row to reset it')
    } else {
        const token = crypto.randomBytes(32).toString('hex')
        try {
            setServerApiToken(token)
            process.env.FUSION_API_TOKEN = token
            console.log('[server] API token auto-generated and persisted to app_settings.server_api_token; external calls must carry Authorization: Bearer <token>')
            // Audit 1107 F-8: never print the full token to logs, prefix only
            console.log(`[server] token: ${token.slice(0, 8)}…`)
        } catch (err: any) {
            console.error(`[server] FUSION_API_TOKEN is not set and auto-generation failed (${err?.message}): external deployments (non-127.0.0.1 binding) require a strong token to start. For local dev set FUSION_BIND_HOST=127.0.0.1`)
            process.exit(1)
        }
    }
}

// D9: there is a TOCTOU window between the main process's getFreePort and the backend
// bind; if the port is taken, desktop mode falls back to an ephemeral port and reports
// the actual port back to the main process via utilityProcess IPC; server deployments
// exit with an error directly
const ppGlobal = (process as unknown as { parentPort?: { postMessage: (m: unknown) => void } }).parentPort

function reportPort(actual: number) {
  // utilityProcess children get process.parentPort injected at runtime (not declared in Node types)
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
    void registerShellManifest(addr.port)
    console.log(`🚀 Fusion Drama TS server on http://localhost:${addr.port}`)
  }
})
reportPort(port)

// Union Web integration (PRD R-8①/§5.2): when FUSION_SHELL_GATEWAY is set, register
// web/manifest.json with the host Shell registry (idempotent upsert, overwrite by id).
// Best-effort — gateway down/unreachable only warns once and does not affect standalone
// operation modes (desktop/dev/single-host server)
async function registerShellManifest(actualPort: number) {
  const gateway = process.env.FUSION_SHELL_GATEWAY
  if (!gateway) return
  try {
    const manifestPath = path.join(projectRoot, 'web', 'manifest.json')
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    // overwrite health/backend with the actual port (desktop mode assigns ports
    // dynamically; defaults baked into the static file are unreliable)
    manifest.health = `http://localhost:${actualPort}/api/v1/health`
    manifest.backend = `http://localhost:${actualPort}/api/v1`
    manifest.version = process.env.FUSION_VERSION || manifest.version
    // fusion-drama#16 gap 2: registration must include upstream, otherwise the gateway
    // shellProxy cannot route /shell/fusion-drama/*
    // (module_not_found: no proxy upstream configured).
    manifest.upstream = `http://127.0.0.1:${actualPort}`
    // fusion-drama#16 gap 1: the registration endpoint requires auth (master_key /
    // web_shell.admin_key / this module's fm- key); bare POSTs always get 403 manifest_forbidden.
    const adminKey = process.env.FUSION_SHELL_ADMIN_KEY || ''
    const res = await fetch(`${gateway.replace(/\/$/, '')}/api/v1/shell/manifests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(adminKey ? { Authorization: `Bearer ${adminKey}` } : {}),
      },
      body: JSON.stringify(manifest),
      signal: AbortSignal.timeout(3000),
    })
    if (res.ok) console.log(`🔗 registered with Union Web Shell (${gateway})`)
    else console.warn(`[shell] registration failed: HTTP ${res.status}`, await res.text().catch(() => ''))
  } catch (err: any) {
    console.warn(`[shell] failed to register with Union Web Shell (standalone operation unaffected): ${err?.message}`)
  }
}
void registerShellManifest(port)
