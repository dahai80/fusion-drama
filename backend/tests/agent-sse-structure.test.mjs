import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('agent SSE streaming route: streamSSE + delta/tool events + done payload shape', () => {
    const route = read('src/routes/agent.ts')
    assert.match(route, /import \{ streamSSE \} from 'hono\/streaming'/)
    assert.match(route, /app\.post\('\/:type\/chat\/stream'/)
    // Mastra chunk 映射：文本增量/工具调用/工具结果各成独立 SSE 事件
    assert.match(route, /case 'text-delta':/)
    assert.match(route, /case 'tool-call':/)
    assert.match(route, /case 'tool-result':/)
    // done 事件负载与非流式响应同构（前端 run 复用同一套 review/toast 逻辑）
    assert.match(route, /event: 'done', data: JSON\.stringify\(\{\s*type: 'done', text: text \|\| ''/)
    // 失败路径必须显式发 error 事件，不能静默断流
    assert.match(route, /event: 'error', data: JSON\.stringify\(\{ type: 'error', message/)
    // GPU 串行队列必须覆盖流消费期（本地模型不能与图片/视频生成并发）
    assert.match(route, /enqueueGpuWork\(`Agent-\$\{agentType\}`, async \(\) => \{/)
    // 监督复审/记忆写入/事件流与非流式版一致
    assert.match(route, /Supervisor-\$\{agentType\}/)
    assert.match(route, /commitAgentMemory\(/)
})

test('frontend useAgent consumes the stream endpoint and surfaces live deltas', () => {
    const composable = read('../frontend/app/composables/useAgent.ts')
    assert.match(composable, /\/agent\/\$\{type\}\/chat\/stream/)
    // SSE 事件解析：delta 累积 + tool 记录 + done 收敛 + error 抛出
    assert.match(composable, /event === 'delta'/)
    assert.match(composable, /event === 'tool'/)
    assert.match(composable, /event === 'done'/)
    assert.match(composable, /event === 'error'/)
    // 流式状态暴露给 AgentStreamPanel
    assert.match(composable, /const streamText = ref\(''\)/)
    assert.match(composable, /const streamTools = ref<string\[\]>\(\[\]\)/)
    assert.match(composable, /return \{ running, runningType, run, streamText, streamTools \}/)

    const panel = read('../frontend/app/components/AgentStreamPanel.vue')
    assert.match(panel, /useAgent\(\)/)
    assert.match(panel, /streamText/)
    assert.match(panel, /streamTools/)

    // episode.vue 三处 Agent 调用全部走流式 run（prompt_generator 不得再直打非流式接口）
    const page = read('../frontend/app/views/drama/episode.vue')
    assert.match(page, /runAgent\('script_rewriter'/)
    assert.match(page, /runAgent\('storyboard_breaker'/)
    assert.match(page, /runAgent\('prompt_generator'/)
    assert.doesNotMatch(page, /api\.post\(`\/agent\/prompt_generator\/chat`/)
    assert.match(page, /<AgentStreamPanel \/>/)
})

test('desktop main process bootstraps fm-server with graceful degrade', () => {
    const main = read('../desktop/src/main.ts')
    // 先探活复用已跑实例，再从候选路径拉起
    assert.match(main, /async function probeFmServer\(/)
    assert.match(main, /function fmServerBinCandidates\(\)/)
    assert.match(main, /async function ensureFmServer\(\)/)
    // 自举不阻塞开窗（拉起失败记忆降级，窗口照常）
    assert.match(main, /void ensureFmServer\(\)/)
    // 退出时回收子进程
    assert.match(main, /stopFmServer\(\)/)
    // 打包资源 + dev 机 fusion-memory 构建产物两个候选
    assert.match(main, /fusion-memory', 'target', 'release'/)

    const prep = read('../desktop/scripts/prepare-resources.mjs')
    assert.match(prep, /resources\/bin-mac\/fm-server/)
    assert.match(prep, /FM_SERVER_BIN/)
})
