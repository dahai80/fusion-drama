import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('cross-session memory service targets fusion-memory with project namespace and fails open', () => {
    const svc = read('src/services/agent-memory.ts')
    // fm-server 默认地址 + 密钥共享文件
    assert.match(svc, /FUSION_MEMORY_URL \|\| 'http:\/\/127\.0\.0\.1:11435'/)
    assert.match(svc, /\.fusion-memory', 'api_key'/)
    // project 命名空间隔离：不污染其他 fusion-* 应用记忆
    assert.match(svc, /const NAMESPACE = 'project'/)
    assert.match(svc, /const NAMESPACE_KEY = 'fusion-drama'/)
    // fail-open：RPC 失败一律 null/仅告警
    assert.match(svc, /rpc-unreachable/)
    assert.match(svc, /return null/)
    // 检索走 issue 契约 memory.retrieve_context
    assert.match(svc, /'memory\.retrieve_context'/)
})

test('agent chat injects memory block before rag and commits turn after generate', () => {
    const agent = read('src/routes/agent.ts')
    assert.match(agent, /isMemoryEnabled\(\)/)
    assert.match(agent, /retrieveMemoryContext\(message\)/)
    assert.match(agent, /memory-context-injected/)
    // 记忆块在前、RAG 块在后，同一前缀拼接
    assert.match(agent, /\[memoryBlock, ragBlock\]\.filter\(Boolean\)\.join\('\\n\\n'\)/)
    // 对话后异步写入（void 不 await，失败仅告警）
    assert.match(agent, /void commitAgentMemory\(\{/)
    assert.match(agent, /memory-commit-skipped/)

    const settings = read('src/services/app-settings.ts')
    assert.match(settings, /export function isMemoryEnabled/)
    assert.match(settings, /export function setMemoryEnabled/)
})

test('supervisor review runs after generate on the gpu queue and degrades open', () => {
    const agent = read('src/routes/agent.ts')
    assert.match(agent, /isSupervisorEnabled\(\)/)
    assert.match(agent, /enqueueGpuWork\(`Supervisor-\$\{agentType\}`/)
    assert.match(agent, /reviewAgentOutput\(agentType, message, result\.text \|\| ''\)/)
    // 判定随响应返回 + 事件流留痕
    assert.match(agent, /agent_reviewed/)
    assert.match(agent, /review,/)

    const svc = read('src/services/supervisor.ts')
    assert.match(svc, /loadAgentPromptFile\('supervisor', lang\)/)
    assert.match(svc, /DEGRADED/)
    assert.match(svc, /review-error/)
    assert.match(svc, /temperature: 0\.1/)

    const settings = read('src/services/app-settings.ts')
    assert.match(settings, /export function isSupervisorEnabled/)
    assert.match(settings, /export function setSupervisorEnabled/)
})

test('memory and supervisor routes mounted; supervisor prompt ships in four languages', () => {
    const index = read('src/index.ts')
    assert.match(index, /api\.route\('\/memory', memory\)/)
    assert.match(index, /api\.route\('\/supervisor', supervisor\)/)

    const memoryRoutes = read('src/routes/memory.ts')
    assert.match(memoryRoutes, /app\.get\('\/status'/)
    assert.match(memoryRoutes, /app\.put\('\/enabled'/)
    assert.match(memoryRoutes, /app\.get\('\/recall'/)

    const supervisorRoutes = read('src/routes/supervisor.ts')
    assert.match(supervisorRoutes, /app\.get\('\/status'/)
    assert.match(supervisorRoutes, /app\.put\('\/enabled'/)

    for (const suffix of ['.md', '.en.md', '.ja.md', '.ko.md']) {
        const prompt = read(`workspace/prompts/supervisor${suffix}`)
        assert.match(prompt, /"pass"/)
        assert.match(prompt, /"issues"/)
    }
})

test('frontend surfaces memory status card, supervisor toggle and review-failed toast', () => {
    const api = read('../frontend/app/composables/useApi.ts')
    assert.match(api, /memoryAPI = \{/)
    assert.match(api, /supervisorAPI = \{/)

    const settings = read('../frontend/app/pages/settings.vue')
    assert.match(settings, /loadMemoryStatus\(\); loadSupervisorStatus\(\)/)
    assert.match(settings, /toggleMemory/)
    assert.match(settings, /toggleSupervisor/)

    const useAgent = read('../frontend/app/composables/useAgent.ts')
    assert.match(useAgent, /review\.pass === false/)
    assert.match(useAgent, /reviewFailed/)

    for (const lang of ['zh', 'en', 'ja', 'ko']) {
        const locale = JSON.parse(read(`../frontend/app/locales/${lang}.json`))
        assert.ok(locale.settings?.memory?.title, `${lang}: settings.memory missing`)
        assert.ok(locale.settings?.supervisor?.title, `${lang}: settings.supervisor missing`)
        assert.ok(locale.composables?.agent?.reviewFailed, `${lang}: composables.agent.reviewFailed missing`)
    }
})
