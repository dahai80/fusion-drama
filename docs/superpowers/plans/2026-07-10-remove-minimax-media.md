# Remove MiniMax Image and Video Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove MiniMax image/video provider support and delete saved MiniMax image/video service configurations from MySQL at startup.

**Architecture:** Remove MiniMax at every provider boundary: frontend selection, backend validation, request probing, and adapter dispatch. Extend the existing MySQL startup initializer to detach affected episode configuration IDs before running two parameterized, idempotent delete statements, preserving generation history and media files.

**Tech Stack:** Node.js test runner, TypeScript, Hono, Drizzle ORM, mysql2, Nuxt 3/Vue 3.

## Global Constraints

- Preserve historical image/video generation records and generated media files.
- Add no dependencies, migrations, provider abstractions, or unrelated refactors.
- Use one failing structural test for each behavior change before production edits.
- Do not commit implementation files because they contain pre-existing user changes; leave the focused diff for user review.

---

### Task 1: Remove MiniMax from application provider surfaces

**Files:**
- Create: `backend/tests/remove-minimax-media-structure.test.mjs`
- Modify: `backend/tests/official-provider-adapters.test.mjs`
- Modify: `frontend/tests/official-provider-settings.test.mjs`
- Modify: `backend/src/services/ai.ts`
- Modify: `backend/src/routes/aiConfigs.ts`
- Modify: `backend/src/services/adapters/registry.ts`
- Modify: `frontend/app/pages/settings.vue`
- Modify: `README.md`
- Delete: `backend/src/services/adapters/minimax-image.ts`
- Delete: `backend/src/services/adapters/minimax-video.ts`

**Interfaces:**
- Consumes: existing `officialProviders`, `buildProbe`, `imageAdapters`, `videoAdapters`, and settings `providers` list.
- Produces: provider boundaries where `minimax` is unsupported for both image and video.

- [ ] **Step 1: Write the failing provider-surface test**

```js
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('../..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const exists = (path) => existsSync(new URL(path, root))

test('MiniMax image and video provider surfaces are removed', () => {
  const ai = read('backend/src/services/ai.ts')
  const route = read('backend/src/routes/aiConfigs.ts')
  const registry = read('backend/src/services/adapters/registry.ts')
  const settings = read('frontend/app/pages/settings.vue')
  const readme = read('README.md')

  assert.doesNotMatch(ai, /minimax/i)
  assert.doesNotMatch(route, /p === 'minimax'/i)
  assert.doesNotMatch(registry, /minimax/i)
  assert.doesNotMatch(settings, /minimax/i)
  assert.doesNotMatch(readme, /minimax/i)
  assert.equal(exists('backend/src/services/adapters/minimax-image.ts'), false)
  assert.equal(exists('backend/src/services/adapters/minimax-video.ts'), false)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test backend/tests/remove-minimax-media-structure.test.mjs`

Expected: FAIL because MiniMax still appears in allowlists, route probing, adapter registry, settings, README, and both adapter files still exist.

- [ ] **Step 3: Apply the minimal provider deletion**

Change `officialProviders` to:

```ts
export const officialProviders: Record<ServiceType, readonly string[]> = {
  text: ['openai', 'gemini', 'deepseek'],
  image: ['openai', 'gemini', 'volcengine', 'ali'],
  video: ['volcengine', 'vidu', 'ali'],
}
```

Delete the `p === 'minimax'` probe branch, MiniMax adapter imports and registry entries, and the two adapter files. Change the settings provider list to:

```ts
const providers = ['ali', 'deepseek', 'gemini', 'openai', 'vidu', 'volcengine']
```

Remove MiniMax image/video claims from both README provider lists. Update existing allowlist expectations in `official-provider-adapters.test.mjs` and the settings provider-list expectation in `official-provider-settings.test.mjs` to match the reduced lists.

- [ ] **Step 4: Run provider tests and verify GREEN**

Run: `node --test backend/tests/remove-minimax-media-structure.test.mjs backend/tests/official-provider-adapters.test.mjs frontend/tests/official-provider-settings.test.mjs`

Expected: all focused tests PASS.

---

### Task 2: Physically remove saved MiniMax media configurations

**Files:**
- Modify: `backend/tests/remove-minimax-media-structure.test.mjs`
- Modify: `backend/src/db/mysql-schema.ts`

**Interfaces:**
- Consumes: `initMySqlSchema(pool: Pool)` and mysql2 `pool.query(sql, params)`.
- Produces: exported `mysqlDataCleanupStatements` entries with `sql: string` and `params: string[]`.

- [ ] **Step 1: Add the failing database-cleanup test**

```js
test('MySQL startup removes saved MiniMax image and video configurations', () => {
  const mysqlSchema = read('backend/src/db/mysql-schema.ts')
  const detachImage = 'UPDATE `episodes` e JOIN `ai_service_configs` c ON e.`image_config_id` = c.`id` SET e.`image_config_id` = NULL WHERE c.`provider` = ? AND c.`service_type` IN (?, ?)'
  const detachVideo = 'UPDATE `episodes` e JOIN `ai_service_configs` c ON e.`video_config_id` = c.`id` SET e.`video_config_id` = NULL WHERE c.`provider` = ? AND c.`service_type` IN (?, ?)'
  const deleteConfigs = 'DELETE FROM `ai_service_configs` WHERE `provider` = ? AND `service_type` IN (?, ?)'

  assert.match(mysqlSchema, /mysqlDataCleanupStatements/)
  assert.match(mysqlSchema, /DELETE FROM `ai_service_configs` WHERE `provider` = \? AND `service_type` IN \(\?, \?\)/)
  assert.match(mysqlSchema, /DELETE FROM `ai_service_providers` WHERE `provider` = \? AND `service_type` IN \(\?, \?\)/)
  assert.ok(mysqlSchema.includes(detachImage))
  assert.ok(mysqlSchema.includes(detachVideo))
  assert.ok(mysqlSchema.indexOf(detachImage) < mysqlSchema.indexOf(deleteConfigs))
  assert.ok(mysqlSchema.indexOf(detachVideo) < mysqlSchema.indexOf(deleteConfigs))
  assert.equal((mysqlSchema.match(/params:\s*\['minimax', 'image', 'video'\]/g) || []).length, 4)
  assert.match(mysqlSchema, /pool\.query\(cleanup\.sql, cleanup\.params\)/)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test backend/tests/remove-minimax-media-structure.test.mjs`

Expected: the provider-surface test passes and the database-cleanup test FAILS because `mysqlDataCleanupStatements` does not exist.

- [ ] **Step 3: Add the minimal idempotent startup cleanup**

Add after `mysqlColumnBackfillStatements`:

```ts
export const mysqlDataCleanupStatements = [
  {
    sql: 'UPDATE `episodes` e JOIN `ai_service_configs` c ON e.`image_config_id` = c.`id` SET e.`image_config_id` = NULL WHERE c.`provider` = ? AND c.`service_type` IN (?, ?)',
    params: ['minimax', 'image', 'video'],
  },
  {
    sql: 'UPDATE `episodes` e JOIN `ai_service_configs` c ON e.`video_config_id` = c.`id` SET e.`video_config_id` = NULL WHERE c.`provider` = ? AND c.`service_type` IN (?, ?)',
    params: ['minimax', 'image', 'video'],
  },
  {
    sql: 'DELETE FROM `ai_service_configs` WHERE `provider` = ? AND `service_type` IN (?, ?)',
    params: ['minimax', 'image', 'video'],
  },
  {
    sql: 'DELETE FROM `ai_service_providers` WHERE `provider` = ? AND `service_type` IN (?, ?)',
    params: ['minimax', 'image', 'video'],
  },
]
```

Append to `initMySqlSchema` after schema creation and column backfills:

```ts
for (const cleanup of mysqlDataCleanupStatements) {
  await pool.query(cleanup.sql, cleanup.params)
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --test backend/tests/remove-minimax-media-structure.test.mjs`

Expected: both tests PASS.

---

### Task 3: Full verification

**Files:**
- Verify only; no production changes.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: evidence that the reduced provider set builds and passes all checks.

- [ ] **Step 1: Scan for remaining MiniMax media references**

Run: `rg -n -i "minimax" -g '!node_modules/**' -g '!.git/**' -g '!frontend/.nuxt/**' -g '!frontend/.output/**' .`

Expected: only the removal design/plan, tests, and the intentional MySQL cleanup statements may contain the word `minimax`; no provider runtime, frontend, or README media-provider reference remains.

- [ ] **Step 2: Run all structural tests**

Run: `node --test backend/tests/*.test.mjs frontend/tests/*.test.mjs`

Expected: all tests PASS with zero failures.

- [ ] **Step 3: Run backend type checking**

Run from `backend/`: `npm run typecheck`

Expected: exit code 0.

- [ ] **Step 4: Run frontend production build**

Run from `frontend/`: `npm run build`

Expected: exit code 0 and Nuxt reports `Build complete`.

- [ ] **Step 5: Check the focused diff**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors; only intended MiniMax cleanup changes are newly introduced, while pre-existing user changes remain preserved and unstaged.
