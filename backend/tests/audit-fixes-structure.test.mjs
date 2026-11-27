import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('audit-1024 P1: sys_task episode_id migration guard is reachable (old typo made it always false)', () => {
    const sqliteSchema = read('src/db/sqlite-schema.ts')
    // guard must require both: table exists (taskCols.length) + episode_id column missing.
    // old typo `taskCols.length && !taskCols.length` was always false, so the legacy-DB upgrade path never added the column
    assert.doesNotMatch(sqliteSchema, /taskCols\.length && !taskCols\.length/)
    assert.match(sqliteSchema, /taskCols\.length && !taskCols\.some\(c => c\.name === 'episode_id'\)/)
})

test('audit-1024 P3: first boot auto-generates server API token instead of refusing to start', () => {
    const index = read('src/index.ts')
    // external deployment without explicit config: read the generated token or generate + persist a new one (refusing to start only remains in the persistence-failure branch)
    assert.match(index, /getServerApiToken\(\)/)
    assert.match(index, /crypto\.randomBytes\(32\)\.toString\('hex'\)/)
    assert.match(index, /setServerApiToken\(token\)/)
    assert.match(index, /process\.env\.FUSION_API_TOKEN = /)

    const auth = read('src/middleware/auth.ts')
    // read env per request: a module-load-time snapshot freezes an empty value, so the auto-generated token would never take effect
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
    // enabled but with load failures on record / fm-server unreachable: settings page warns loudly instead of silently failing open
    assert.match(settingsVue, /ragStatus\.value\?\.enabled && ragStatus\.value\?\.lastError/)
    assert.match(settingsVue, /memoryStatus\.value\?\.enabled && !memoryStatus\.value\?\.reachable/)

    for (const lang of ['zh', 'en', 'ja', 'ko']) {
        const locale = JSON.parse(read(`../frontend/app/locales/${lang}.json`))
        assert.ok(locale.settings?.rag?.degradedToast, `${lang}: settings.rag.degradedToast missing`)
        assert.ok(locale.settings?.memory?.degradedToast, `${lang}: settings.memory.degradedToast missing`)
    }
})
