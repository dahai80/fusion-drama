import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('agent SSE streaming route: streamSSE + delta/tool events + done payload shape', () => {
    const route = read('src/routes/agent.ts')
    assert.match(route, /import \{ streamSSE \} from 'hono\/streaming'/)
    assert.match(route, /app\.post\('\/:type\/chat\/stream'/)
    // Mastra chunk mapping: text deltas / tool calls / tool results each as separate SSE events
    assert.match(route, /case 'text-delta':/)
    assert.match(route, /case 'tool-call':/)
    assert.match(route, /case 'tool-result':/)
    // done event payload is shape-identical to the non-streaming response (frontend run reuses the same review/toast logic)
    assert.match(route, /event: 'done', data: JSON\.stringify\(\{\s*type: 'done', text: text \|\| ''/)
    // Failure paths must send an explicit error event, never silently break the stream
    assert.match(route, /event: 'error', data: JSON\.stringify\(\{ type: 'error', message/)
    // The GPU serial queue must span the stream consumption window (local models cannot run concurrently with image/video generation)
    assert.match(route, /enqueueGpuWork\(`Agent-\$\{agentType\}`, async \(\) => \{/)
    // Supervisor review / memory commit / event stream identical to the non-streaming version
    assert.match(route, /Supervisor-\$\{agentType\}/)
    assert.match(route, /commitAgentMemory\(/)
})

test('frontend useAgent consumes the stream endpoint and surfaces live deltas', () => {
    const composable = read('../frontend/app/composables/useAgent.ts')
    assert.match(composable, /\/agent\/\$\{type\}\/chat\/stream/)
    // SSE event parsing: delta accumulation + tool records + done convergence + error throw
    assert.match(composable, /event === 'delta'/)
    assert.match(composable, /event === 'tool'/)
    assert.match(composable, /event === 'done'/)
    assert.match(composable, /event === 'error'/)
    // Streaming state exposed to AgentStreamPanel
    assert.match(composable, /const streamText = ref\(''\)/)
    assert.match(composable, /const streamTools = ref<string\[\]>\(\[\]\)/)
    assert.match(composable, /return \{ running, runningType, run, streamText, streamTools \}/)

    const panel = read('../frontend/app/components/AgentStreamPanel.vue')
    assert.match(panel, /useAgent\(\)/)
    assert.match(panel, /streamText/)
    assert.match(panel, /streamTools/)

    // All three Agent call sites in episode.vue use the streaming run (prompt_generator must no longer hit the non-streaming endpoint)
    const page = read('../frontend/app/views/drama/episode.vue')
    assert.match(page, /runAgent\('script_rewriter'/)
    assert.match(page, /runAgent\('storyboard_breaker'/)
    assert.match(page, /runAgent\('prompt_generator'/)
    assert.doesNotMatch(page, /api\.post\(`\/agent\/prompt_generator\/chat`/)
    assert.match(page, /<AgentStreamPanel \/>/)
})

test('desktop main process bootstraps fm-server with graceful degrade', () => {
    const main = read('../desktop/src/main.ts')
    // Probe and reuse a running instance first, then spawn from candidate paths
    assert.match(main, /async function probeFmServer\(/)
    assert.match(main, /function fmServerBinCandidates\(\)/)
    assert.match(main, /async function ensureFmServer\(\)/)
    // Bootstrap does not block window opening (spawn failure degrades memory, window opens anyway)
    assert.match(main, /void ensureFmServer\(\)/)
    // Child process reaped on exit
    assert.match(main, /stopFmServer\(\)/)
    // Two candidates: packaged resources + dev machine's fusion-memory build output
    assert.match(main, /fusion-memory', 'target', 'release'/)

    const prep = read('../desktop/scripts/prepare-resources.mjs')
    assert.match(prep, /resources\/bin-mac\/fm-server/)
    assert.match(prep, /FM_SERVER_BIN/)
})
