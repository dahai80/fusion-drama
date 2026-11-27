import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('characters route supports manual create and soft delete', () => {
  const route = read('src/routes/characters.ts')

  assert.match(route, /app\.post\('\/'/)
  // i18n: user-facing (matches Chinese error text in characters.ts)
  assert.match(route, /名称必填/)
  // Links to the episode when episode_id is provided
  assert.match(route, /insert\(schema\.episodeCharacters\)/)
  // Soft delete
  assert.match(route, /app\.delete\('\/:id'/)
  assert.match(route, /deletedAt: now\(\)/)
  assert.doesNotMatch(route, /db\.delete\(schema\.characters\)/)
})

test('scenes route links new scenes to episode and soft deletes', () => {
  const route = read('src/routes/scenes.ts')

  assert.match(route, /app\.post\('\/'/)
  // i18n: user-facing (matches Chinese error text in scenes.ts)
  assert.match(route, /地点必填/)
  assert.match(route, /insert\(schema\.episodeScenes\)/)
  // Soft delete (was a hard delete; kept to preserve historical generation records)
  assert.match(route, /app\.delete\('\/:id'/)
  assert.match(route, /deletedAt: now\(\)/)
  assert.doesNotMatch(route, /db\.delete\(schema\.scenes\)/)
})

test('props route supports manual create and soft delete', () => {
  const route = read('src/routes/props.ts')

  assert.match(route, /app\.post\('\/'/)
  // i18n: user-facing (matches Chinese error text in props.ts)
  assert.match(route, /名称必填/)
  assert.match(route, /insert\(schema\.episodeProps\)/)
  assert.match(route, /app\.delete\('\/:id'/)
  assert.match(route, /deletedAt: now\(\)/)
  assert.doesNotMatch(route, /db\.delete\(schema\.props\)/)
})
