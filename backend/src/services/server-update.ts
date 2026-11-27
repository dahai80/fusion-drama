/**
 * Version check and update triggering for server / Docker deployments
 *
 * - Version check: reuses the same release feed as the desktop build (latest.json of FUSION_UPDATE_FEED)
 * - Current version: FUSION_VERSION injected at build time (Docker ARG / env var), falls back to package.json
 * - One-click update: only available when Watchtower is configured (FUSION_WATCHTOWER_URL) — containers are immutable;
 *   self-updating inside the container is an anti-pattern; the correct path is Watchtower pulling a new image and
 *   recreating this container. When unconfigured, the frontend shows manual update instructions (docker compose pull && up -d)
 */
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Dual source: COS (direct connection in China) first, GitHub (overseas) fallback; FUSION_UPDATE_FEED overrides entirely
const FEED_URLS = process.env.FUSION_UPDATE_FEED
  ? [process.env.FUSION_UPDATE_FEED]
  : ['https://github.com/dahai80/fusion-drama/releases/latest/download/latest.json']

const WATCHTOWER_URL = process.env.FUSION_WATCHTOWER_URL?.replace(/\/+$/, '')
const WATCHTOWER_TOKEN = process.env.FUSION_WATCHTOWER_TOKEN || ''

export type ServerUpdateMode = 'watchtower' | 'manual'

export interface ServerUpdateState {
  status: 'idle' | 'up-to-date' | 'available' | 'error'
  currentVersion: string
  latestVersion?: string
  notes?: string
  error?: string
  updateMode: ServerUpdateMode
}

let lastState: Omit<ServerUpdateState, 'updateMode'> | null = null

function currentVersion(): string {
  if (process.env.FUSION_VERSION) return process.env.FUSION_VERSION.replace(/^v/, '')
  try {
    const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../package.json')
    return JSON.parse(readFileSync(pkg, 'utf-8')).version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export function updateMode(): ServerUpdateMode {
  return WATCHTOWER_URL ? 'watchtower' : 'manual'
}

/** Three-segment numeric comparison, same rules as the desktop updater.ts */
function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const pb = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

/** GET /state — current version + update mode + last check result (no network requests) */
export function getServerUpdateState(): ServerUpdateState {
  return {
    status: lastState?.status ?? 'idle',
    currentVersion: currentVersion(),
    latestVersion: lastState?.latestVersion,
    notes: lastState?.notes,
    error: lastState?.error,
    updateMode: updateMode(),
  }
}

/** POST /check — fetch the release feed and compare versions (dual sources tried in order) */
export async function checkServerUpdate(): Promise<ServerUpdateState> {
  try {
    let feed: any
    let lastError: unknown
    for (const url of FEED_URLS) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        feed = await res.json()
        // i18n: user-facing
        if (!feed?.version) throw new Error('版本清单格式不正确')
        break
      } catch (err) {
        lastError = err
      }
    }
    // i18n: user-facing
    if (!feed) throw new Error(`版本清单请求失败（已尝试 ${FEED_URLS.length} 个源）：${(lastError as Error)?.message ?? ''}`)
    const latestVersion = String(feed.version).replace(/^v/, '')
    lastState = {
      status: compareVersions(latestVersion, currentVersion()) > 0 ? 'available' : 'up-to-date',
      currentVersion: currentVersion(),
      latestVersion,
      notes: feed.notes,
    }
  } catch (err) {
    lastState = {
      status: 'error',
      currentVersion: currentVersion(),
      error: (err as Error).message,
    }
  }
  return getServerUpdateState()
}

/**
 * POST /apply — triggers Watchtower to check immediately and recreate this container.
 * Watchtower runs async: pull new image → recreate container; this process gets replaced
 * shortly after, so the caller only learns "triggered".
 */
export async function triggerWatchtowerUpdate(): Promise<void> {
  // i18n: user-facing
  if (!WATCHTOWER_URL) throw new Error('未配置 Watchtower（FUSION_WATCHTOWER_URL），无法应用内更新')
  const res = await fetch(`${WATCHTOWER_URL}/v1/update`, {
    method: 'POST',
    headers: WATCHTOWER_TOKEN ? { Authorization: `Bearer ${WATCHTOWER_TOKEN}` } : {},
    signal: AbortSignal.timeout(15_000),
  })
  // i18n: user-facing
  if (!res.ok) throw new Error(`Watchtower 触发失败（HTTP ${res.status}）`)
}
