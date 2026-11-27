/**
 * PRD optimization landing (docs/opti-plan-1015.md) structure tests:
 * Asserts source text patterns, locking in the key behavior anchors of the M1/M2/M4 batches.
 * When a refactor breaks assertions, change the test, not the source (project rule).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FR-P0-1: server mode refuses to start without >=32B token', () => {
    const s = read('index.ts')
    assert.match(s, /FUSION_API_TOKEN[^]*?length < 32/)
    assert.match(s, /isLoopbackOnly[^]*?process\.exit\(1\)/)
})

test('FR-P0-5a: task cancel — registry + optimistic terminal write', () => {
    const gen = read('services/generation.ts')
    assert.match(gen, /const activeCancels = new Map<number, AbortController>\(\)/)
    assert.match(gen, /export function requestTaskCancel/)
    assert.match(gen, /export async function cancelTask/)
    // Cancel terminal-state optimistic condition: only processing may become cancelled
    assert.match(gen, /status: 'cancelled'[^]*?eq\(schema\.sysTask\.status, 'processing'\)/)
    // failTask optimistic condition
    assert.match(gen, /async function failTask[^]*?eq\(schema\.sysTask\.status, 'processing'\)/)
    // completed write-back optimistic conditions (3 spots against ghost completions)
    const completedCount = (gen.match(/status: 'completed'[^]*?eq\(schema\.sysTask\.status, 'processing'\)/g) || []).length
    assert.ok(completedCount >= 3, `completed optimistic guards: ${completedCount}`)
    // Execution-entry short-circuit: non-processing records do not execute
    assert.match(gen, /record\.status !== 'processing'/)
})

test('FR-P0-5a: cancel route exists with terminal-state guard', () => {
    const s = read('routes/tasks.ts')
    assert.match(s, /app\.post\('\/:id\/cancel'/)
    assert.match(s, /TERMINAL\.has\(row\.status \|\| ''\)/)
    assert.match(s, /requestTaskCancel\(id\)/)
})

test('FR-P0-5b: merge reentry guard', () => {
    const s = read('services/ffmpeg-merge.ts')
    assert.match(s, /该剧集已有进行中的拼接任务/) // i18n: user-facing
    assert.match(s, /eq\(schema\.videoMerges\.status, 'processing'\)/)
})

test('FR-P0-1b/BIZ-1: destructive deletes require confirm + cascade', () => {
    const dramas = read('routes/dramas.ts')
    assert.match(dramas, /confirm=true（query 或 body）/) // i18n: user-facing
    assert.match(dramas, /cascadeDeleteDrama\(id\)/)
    const episodes = read('routes/episodes.ts')
    assert.match(episodes, /confirm=true（query 或 body）/) // i18n: user-facing
    assert.match(episodes, /cascadeDeleteEpisode\(id\)/)
    // Cascade cleanup lives in utils/cascade.ts: DB row deletion + artifact file deletion (jail assertions)
    const cascade = read('utils/cascade.ts')
    assert.match(cascade, /export async function cascadeDeleteDrama/)
    assert.match(cascade, /export async function cascadeDeleteEpisode/)
    assert.match(cascade, /deleteStoredFile\(p\)/)
    assert.match(cascade, /sysTask/)
})

test('NFR-OPS-3: versioned migrations with auto backup', () => {
    const mig = read('db/migrations.ts')
    assert.match(mig, /user_version/)
    assert.match(mig, /VACUUM INTO/)
    assert.match(mig, /MAX_BACKUPS = 10/)
    const idx = read('db/index.ts')
    assert.match(idx, /runMigrations\(sqlite, dbPath\)/)
})

test('FR-P1-1: task events table + SSE endpoint + instrumentation', () => {
    const mig = read('db/migrations.ts')
    assert.match(mig, /sys_task_events/)
    assert.match(mig, /idx_sys_task_events_task_id/)
    const util = read('utils/task-events.ts')
    assert.match(util, /appendTaskEvent/)
    assert.match(util, /Last-Event-ID|afterSeq/)
    const routes = read('routes/tasks.ts')
    assert.match(routes, /app\.get\('\/:id\/events'/)
    assert.match(routes, /Last-Event-ID/)
    const gen = read('services/generation.ts')
    assert.match(gen, /appendTaskEvent\(id, 'started'/)
    assert.match(gen, /appendTaskEvent\(id, 'failed'/)
    const completedCount = (gen.match(/appendTaskEvent\(record\.id, 'completed'/g) || []).length
    assert.ok(completedCount >= 3, `completed events: ${completedCount}`)
})

test('FR-BIZ-3: script history keep-5 + rollback endpoint', () => {
    const tool = read('agents/tools/script-tools.ts')
    assert.match(tool, /scriptHistory/)
    assert.match(tool, /while \(history\.length > 5\) history\.shift\(\)/)
    const ep = read('routes/episodes.ts')
    assert.match(ep, /rollback-script/)
    assert.match(ep, /manual script overwrites also keep a history draft/)
})

test('FR-BIZ-2a: first-frame selection owned by host only', () => {
    const adapter = read('services/adapters/fusion-video.ts')
    assert.ok(!/pickReferenceUrl|firstReferenceUrl/.test(adapter), 'adapter must not keep its own selection impl')
    assert.match(adapter, /record\.firstFrameUrl \|\| record\.imageUrl/)
    const gen = read('services/generation.ts')
    assert.match(gen, /resolveI2vSubjectUrl/)
    assert.match(gen, /i2v-subject-fallback-last/)
})

test('FR-BIZ-6: manual DB backup API', () => {
    const s = read('routes/storage.ts')
    assert.match(s, /app\.post\('\/backup'/)
    assert.match(s, /app\.get\('\/backups'/)
    assert.match(s, /VACUUM INTO/)
    assert.match(s, /MAX_BACKUPS = 10/)
})

test('NFR-OPS-2: health self-check fields', () => {
    const s = read('index.ts')
    assert.match(s, /schemaVersion/)
    assert.match(s, /storageWritable/)
    assert.match(s, /engineOk/)
})

test('FR-P1-1 gap: agent-level events (episode dim) — tool instrumentation + SSE', () => {
    const mig = read('db/migrations.ts')
    assert.match(mig, /version: 4, name: 'task-events-episode-dim'/)
    assert.match(mig, /episode_id INTEGER/)
    const util = read('utils/task-events.ts')
    assert.match(util, /export async function appendEpisodeEvent/)
    assert.match(util, /export async function readEpisodeEvents/)
    const agents = read('agents/index.ts')
    assert.match(agents, /function instrumentTools/)
    assert.match(agents, /appendEpisodeEvent\(episodeId, 'tool_call'/)
    assert.match(agents, /appendEpisodeEvent\(episodeId, 'tool_result'/)
    const ep = read('routes/episodes.ts')
    assert.match(ep, /app\.get\('\/:id\/events'/)
    assert.match(ep, /readEpisodeEvents/)
    const chat = read('routes/agent.ts')
    assert.match(chat, /appendEpisodeEvent\(episode_id, 'agent_started'/)
    assert.match(chat, /appendEpisodeEvent\(episode_id, 'agent_finished'/)
})

test('FR-BIZ-6 gap: backup bundles DB + storage (tar.gz)', () => {
    const s = read('routes/storage.ts')
    assert.match(s, /bundle-\$\{stamp\}\.tar\.gz/)
    assert.match(s, /STORAGE_ROOT/)
    assert.match(s, /includes: \['database', 'static'\]/)
    // Falls back to a DB-only snapshot when tar is unavailable (no hard failure)
    assert.match(s, /DB-only backup kept/)
})

test('NFR-REL-4 gap: queue position feedback + queue depth endpoint', () => {
    const q = read('services/gpu-queue.ts')
    assert.match(q, /onQueued\?: \(position: number\) => void/)
    assert.match(q, /opts\.onQueued\?\.\(queueDepth\)/)
    const gen = read('services/generation.ts')
    assert.match(gen, /appendTaskEvent\(id, 'queued', \{ position \}\)/)
    const routes = read('routes/tasks.ts')
    assert.match(routes, /app\.get\('\/queue'/)
    assert.match(routes, /gpuQueueDepth\(\)/)
})

test('PRD §10.2 gap: retry provenance + retry-stats endpoint', () => {
    const mig = read('db/migrations.ts')
    assert.match(mig, /version: 5, name: 'task-retry-of'/)
    assert.match(mig, /ADD COLUMN retry_of INTEGER/)
    const routes = read('routes/tasks.ts')
    assert.match(routes, /app\.get\('\/retry-stats'/)
    assert.match(routes, /retrySuccessRate/)
    assert.match(routes, /retryOf: body\.retry_of/)
})
