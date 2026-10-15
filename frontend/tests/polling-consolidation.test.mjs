/**
 * FR-P2-4 轮询收敛结构测试：usePolling 统一托管组件内轮询，
 * unmount 自动清理；调用方不得再裸用 setInterval（setTimeout 递归
 * 自终止 tick 不受限）。断言源码文本模式。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'app')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('usePolling composable exists with auto cleanup on unmount', () => {
  const s = read('composables/usePolling.ts')
  assert.match(s, /onUnmounted\(\(\) => stopAll\(\)\)/)
  assert.match(s, /export function usePolling/)
  assert.match(s, /function stopAll/)
})

test('episode.vue task/merge polling routed through usePolling', () => {
  const s = read('views/drama/episode.vue')
  assert.match(s, /const \{ start: startPoll, stop: stopPoll \} = usePolling\(\)/)
  assert.match(s, /genTasksTimer = startPoll\(/)
  assert.match(s, /const poll = startPoll\(/)
  assert.doesNotMatch(s, /setInterval\(/, 'raw setInterval forbidden — route through usePolling')
})

test('settings.vue usage polling routed through usePolling', () => {
  const s = read('pages/settings.vue')
  assert.match(s, /usagePollTimer = startPoll\(/)
  assert.doesNotMatch(s, /setInterval\(/, 'raw setInterval forbidden — route through usePolling')
  assert.doesNotMatch(s, /onBeforeUnmount\(stopUsagePoll\)/, 'unmount cleanup owned by usePolling')
})
