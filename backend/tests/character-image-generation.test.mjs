import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('character image generation uses 16:9 asset size', () => {
  const source = read('src/routes/characters.ts')

  assert.match(source, /CHARACTER_IMAGE_SIZE = '1920x1080'/)
  // issue #6: the fallback template stays consistent with the SKILL four-view character sheet
  // (front-face close-up + four equal-height full-body views)
  // i18n: user-facing (matches Chinese LLM prompt template in characters.ts)
  assert.match(source, /左侧正脸特写/)
  // i18n: user-facing (matches Chinese LLM prompt template in characters.ts)
  assert.match(source, /右侧正面、45 度侧面、90 度侧面、背面四张等高全身视图/)
  assert.match(source, /size: CHARACTER_IMAGE_SIZE/)
})
