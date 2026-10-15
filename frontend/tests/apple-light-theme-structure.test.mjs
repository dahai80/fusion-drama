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
  read('../app/views/drama/detail.vue'),
  read('../app/views/drama/episode.vue'),
  read('../app/pages/settings.vue'),
].join('\n')

test('light theme exposes the selected neutral and brand-orange tokens', () => {
  assert.match(studioCss, /--surface-base:\s*#f7f8fa/i)
  assert.match(studioCss, /--surface-raised:\s*#ffffff/i)
  assert.match(studioCss, /--accent:\s*#f97316/i)
  assert.match(studioCss, /--success:\s*#16a34a/i)
  assert.match(studioCss, /--font-body:\s*-apple-system,\s*BlinkMacSystemFont,\s*'SF Pro Text'/)
})

test('core surfaces remove the old legacy brand decoration', () => {
  assert.doesNotMatch(surfaces, /#d96f27|rgba\(217\s*,\s*111\s*,\s*39/i)
  assert.doesNotMatch(surfaces, /Noto Serif SC|film-strip|film-frame/i)
  assert.doesNotMatch(surfaces, /#4c8dff|rgba\(76\s*,\s*141\s*,\s*255/i)
})
