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
    // Registry: the custom: prefix delegates to the programmable provider service (covers both image/video)
    const registry = read('src/services/adapters/registry.ts')
    assert.match(registry, /isCustomProvider\(provider\)\) return getCustomImageAdapter/)
    assert.match(registry, /isCustomProvider\(provider\)\) return getCustomVideoAdapter/)

    // Generation pipeline awaits the async adapter resolution (custom requires a DB lookup)
    const generation = read('src/services/generation.ts')
    assert.match(generation, /await getImageAdapter\(config\.provider\)/)
    assert.match(generation, /await getVideoAdapter\(config\.provider\)/)

    // Config validity: the custom: prefix is allowed (image/video only); official list unchanged
    const ai = read('src/services/ai.ts')
    assert.match(ai, /export function isValidProvider/)
    assert.match(ai, /startsWith\('custom:'\)/)
    assert.match(ai, /r\.isActive && isValidProvider\(serviceType, r\.provider\)/)
})

test('custom provider sandbox isolation is configured (runtime behavior in custom-provider-sandbox.test.ts)', () => {
    const sandbox = read('src/services/custom-provider-sandbox.ts')
    // Sandbox context excludes require/process/fs/Buffer; eval has a timeout fuse
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
