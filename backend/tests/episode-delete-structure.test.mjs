import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

// FR-BIZ-1 (landed 2026-10-16): delete switched to hard delete (confirm double-check +
// utils/cascade.ts cleaning up DB rows and storage files); old soft-delete semantics kept
// in sync with source evolution via this test
test('episodes route hard delete requires confirm + cascade', () => {
  const route = read('src/routes/episodes.ts')

  assert.match(route, /app\.delete\('\/:id'/)
  assert.match(route, /query\('confirm'\) !== 'true' && !bodyConfirm/)
  assert.match(route, /cascadeDeleteEpisode\(id\)/)
  // i18n: user-facing — asserts the kept zh error string
  assert.match(route, /剧集不存在/)
})

test('drama queries exclude soft-deleted episodes', () => {
  const dramas = read('src/routes/dramas.ts')

  // both the list aggregation and detail filter on deletedAt (legacy soft-deleted rows may exist; the query-side filter stays)
  const matches = dramas.match(/isNull\(schema\.episodes\.deletedAt\)/g) || []
  assert.ok(matches.length >= 2, `expected >=2 deletedAt filters, got ${matches.length}`)
})
