import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('custom providers table shipped in migration v6 and drizzle schema', () => {
    const migrations = read('src/db/migrations.ts')
    assert.match(migrations, /version: 6, name: 'custom-providers'/)
    assert.match(migrations, /CREATE TABLE IF NOT EXISTS custom_providers/)

    const schema = read('src/db/schema.ts')
    assert.match(schema, /export const customProviders = sqliteTable\('custom_providers'/)
})

test('custom:<name> providers flow through adapter registry and config validation', () => {
    // 注册表：custom: 前缀委托到可编程 provider 服务（图片/视频都覆盖）
    const registry = read('src/services/adapters/registry.ts')
    assert.match(registry, /isCustomProvider\(provider\)\) return getCustomImageAdapter/)
    assert.match(registry, /isCustomProvider\(provider\)\) return getCustomVideoAdapter/)

    // 生成管线等待异步 adapter 解析（custom 需查 DB）
    const generation = read('src/services/generation.ts')
    assert.match(generation, /await getImageAdapter\(config\.provider\)/)
    assert.match(generation, /await getVideoAdapter\(config\.provider\)/)

    // 配置合法性：custom: 前缀放行（仅 image/video），官方清单不变
    const ai = read('src/services/ai.ts')
    assert.match(ai, /export function isValidProvider/)
    assert.match(ai, /startsWith\('custom:'\)/)
    assert.match(ai, /r\.isActive && isValidProvider\(serviceType, r\.provider\)/)
})

test('custom provider sandbox isolation is configured (runtime behavior in custom-provider-sandbox.test.ts)', () => {
    const sandbox = read('src/services/custom-provider-sandbox.ts')
    // 沙箱上下文不含 require/process/fs/Buffer；eval 有超时熔断
    assert.match(sandbox, /EVAL_TIMEOUT_MS = 5000/)
    assert.match(sandbox, /\{ timeout: EVAL_TIMEOUT_MS \}/)
    assert.doesNotMatch(sandbox, /require:/)
    assert.doesNotMatch(sandbox, /process:/)
})

test('custom provider routes mounted with dry-run test endpoint', () => {
    const routes = read('src/routes/custom-providers.ts')
    assert.match(routes, /app\.post\('\/test'/)
    assert.match(routes, /validateCustomProviderExports/)
    assert.match(routes, /invalidateCustomProviderCache/)

    const index = read('src/index.ts')
    assert.match(index, /api\.route\('\/custom-providers', customProviders\)/)
})
