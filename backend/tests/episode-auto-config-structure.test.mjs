import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('POST /episodes auto-locks configs when not provided', () => {
  const route = read('src/routes/episodes.ts')
  const ai = read('src/services/ai.ts')

  // No longer force-requires a config id
  assert.doesNotMatch(route, /image_config_id and video_config_id are required/)
  // Auto-locks via getActiveConfigId
  assert.match(route, /getActiveConfigId\('image'\)/)
  assert.match(route, /getActiveConfigId\('video'\)/)
  // ai.ts provides getActiveConfigId
  assert.match(ai, /export async function getActiveConfigId/)
  // Actionable error messages when no enabled config is found
  // i18n: user-facing (matches Chinese error text in episodes.ts)
  assert.match(route, /未找到启用的图片生成配置/)
  // i18n: user-facing (matches Chinese error text in episodes.ts)
  assert.match(route, /未找到启用的视频生成配置/)
})

test('POST /episodes still honors explicit config ids when caller passes them', () => {
  const route = read('src/routes/episodes.ts')

  assert.match(route, /body\.image_config_id \?\? await getActiveConfigId/)
  assert.match(route, /body\.video_config_id \?\? await getActiveConfigId/)
})