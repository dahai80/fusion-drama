import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const studioCss = read('../app/assets/studio.css')
const layout = read('../app/layouts/default.vue')
const surfaces = [
  studioCss,
  layout,
  read('../app/pages/index.vue'),
  read('../app/pages/drama/[id]/index.vue'),
  read('../app/pages/drama/[id]/episode/[episodeNumber].vue'),
  read('../app/pages/settings.vue'),
].join('\n')

test('graphite theme exposes the selected neutral and blue tokens', () => {
  assert.match(studioCss, /--surface-base:\s*#15171a/i)
  assert.match(studioCss, /--surface-raised:\s*#1c1f23/i)
  assert.match(studioCss, /--accent:\s*#4c8dff/i)
  assert.match(studioCss, /--success:\s*#63a87a/i)
  assert.match(studioCss, /--font-body:\s*'Inter',\s*'Noto Sans SC'/)
})

test('core surfaces remove the old film-console decoration', () => {
  assert.doesNotMatch(surfaces, /#d96f27|rgba\(217\s*,\s*111\s*,\s*39/i)
  assert.doesNotMatch(surfaces, /linear-gradient|radial-gradient|repeating-linear-gradient/i)
  assert.doesNotMatch(surfaces, /Noto Serif SC|film-strip|film-frame/i)
})
