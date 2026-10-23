import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('audit-1024 P1: sys_task episode_id migration guard is reachable (old typo made it always false)', () => {
    const sqliteSchema = read('src/db/sqlite-schema.ts')
    // 守卫必须同时满足：表存在（taskCols.length）+ 缺 episode_id 列。
    // 旧笔误 `taskCols.length && !taskCols.length` 恒 false，老库升级路径补列永远不执行
    assert.doesNotMatch(sqliteSchema, /taskCols\.length && !taskCols\.length/)
    assert.match(sqliteSchema, /taskCols\.length && !taskCols\.some\(c => c\.name === 'episode_id'\)/)
})

test('audit-1024 P3: first boot auto-generates server API token instead of refusing to start', () => {
    const index = read('src/index.ts')
    // 对外部署未显式配置时：读已生成 token 或生成新的持久化（拒启仅保留在持久化失败分支）
    assert.match(index, /getServerApiToken\(\)/)
    assert.match(index, /crypto\.randomBytes\(32\)\.toString\('hex'\)/)
    assert.match(index, /setServerApiToken\(token\)/)
    assert.match(index, /process\.env\.FUSION_API_TOKEN = /)

    const auth = read('src/middleware/auth.ts')
    // 每请求读 env：模块加载期快照会固化空值，自动生成的 token 不生效
    assert.match(auth, /process\.env\.FUSION_API_TOKEN \|\| ''/)
    assert.doesNotMatch(auth, /^const API_TOKEN = process\.env/m)

    const settings = read('src/services/app-settings.ts')
    assert.match(settings, /export function getServerApiToken/)
    assert.match(settings, /export function setServerApiToken/)
})

test('audit-1024 P2: rag status exposes last model-load error for silent-failure surfacing', () => {
    const rag = read('src/services/rag.ts')
    assert.match(rag, /let lastLoadError: string \| null = null/)
    assert.match(rag, /lastError: lastLoadError/)

    const settingsVue = read('../frontend/app/pages/settings.vue')
    // 开着但加载有失败记录 / fm-server 不可达 → 设置页大声告警，不再静默 fail-open
    assert.match(settingsVue, /ragStatus\.value\?\.enabled && ragStatus\.value\?\.lastError/)
    assert.match(settingsVue, /memoryStatus\.value\?\.enabled && !memoryStatus\.value\?\.reachable/)

    for (const lang of ['zh', 'en', 'ja', 'ko']) {
        const locale = JSON.parse(read(`../frontend/app/locales/${lang}.json`))
        assert.ok(locale.settings?.rag?.degradedToast, `${lang}: settings.rag.degradedToast missing`)
        assert.ok(locale.settings?.memory?.degradedToast, `${lang}: settings.memory.degradedToast missing`)
    }
})
