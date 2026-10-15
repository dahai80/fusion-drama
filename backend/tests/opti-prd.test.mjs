/**
 * PRD 优化落地（docs/opti-plan-1015.md）结构测试：
 * 断言源码文本模式，锁住 M1/M2/M4 批次的关键行为锚点。
 * 重构源码破坏断言时改测试，别改源码（项目规则）。
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
    // 取消终态乐观条件：仅 processing 可落 cancelled
    assert.match(gen, /status: 'cancelled'[^]*?eq\(schema\.sysTask\.status, 'processing'\)/)
    // failTask 乐观条件
    assert.match(gen, /async function failTask[^]*?eq\(schema\.sysTask\.status, 'processing'\)/)
    // completed 回写乐观条件（3 处防幽灵完成）
    const completedCount = (gen.match(/status: 'completed'[^]*?eq\(schema\.sysTask\.status, 'processing'\)/g) || []).length
    assert.ok(completedCount >= 3, `completed optimistic guards: ${completedCount}`)
    // 执行入口短路：非 processing 不执行
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
    assert.match(s, /该剧集已有进行中的拼接任务/)
    assert.match(s, /eq\(schema\.videoMerges\.status, 'processing'\)/)
})

test('FR-P0-1b/BIZ-1: destructive deletes require confirm + cascade', () => {
    const dramas = read('routes/dramas.ts')
    assert.match(dramas, /confirm=true（query 或 body）/)
    assert.match(dramas, /eq\(schema\.episodes\.dramaId, id\)/)
    const episodes = read('routes/episodes.ts')
    assert.match(episodes, /confirm=true（query 或 body）/)
    assert.match(episodes, /所属剧集已删除，任务中断/)
})

test('NFR-OPS-3: versioned migrations with auto backup', () => {
    const mig = read('db/migrations.ts')
    assert.match(mig, /user_version/)
    assert.match(mig, /VACUUM INTO/)
    assert.match(mig, /MAX_BACKUPS = 10/)
    const idx = read('db/index.ts')
    assert.match(idx, /runMigrations\(sqlite, dbPath\)/)
})
