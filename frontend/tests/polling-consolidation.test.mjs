/**
 * FR-P2-4 polling consolidation structure test: usePolling centrally manages in-component
 * polling with automatic cleanup on unmount; callers must no longer use bare setInterval
 * (self-terminating recursive setTimeout ticks are unrestricted). Asserts source text patterns.
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
