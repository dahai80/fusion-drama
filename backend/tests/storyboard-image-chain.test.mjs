import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('storyboard composed image feeds video first frame (image_prompt not orphaned)', () => {
  // backend: the storyboard composed image is automatically the video first frame (an explicit
  // first_frame/image still has top priority)
  const tasks = read('src/routes/tasks.ts')
  assert.match(tasks, /sb\.composedImage \|\| sb\.firstFrameImage/)
  assert.match(tasks, /hasExplicitFrame/)

  // image tasks write back the storyboard composed image (frameType composed → composedImage)
  const generation = read('src/services/generation.ts')
  assert.match(generation, /sbUpdate\.composedImage = localPath/)

  // frontend: storyboard image generation entry points (single + batch) are wired, no longer
  // backend-only
  const episode = read('../frontend/app/views/drama/episode.vue')
  assert.match(episode, /function genSbImage\(/)
  assert.match(episode, /function batchSbImages\(/)
  assert.match(episode, /frame_type: 'composed'/)
})

test('image task result_url never stores raw data URI', () => {
  // old bug: the fusion sync base64 data URI was stored raw in result_url (up to 6MB per
  // row); the list endpoint's JSON.stringify blew up with RangeError: Invalid string
  // length → 500
  const generation = read('src/services/generation.ts')
  assert.match(generation, /imageUrl\.startsWith\('data:'\) \? localPath : imageUrl/)

  // list-endpoint fallback: legacy dirty rows degrade to localPath instead of being
  // returned as-is
  const tasks = read('src/routes/tasks.ts')
  assert.match(tasks, /resultUrl\.startsWith\('data:'\) \? \{ \.\.\.r, resultUrl: r\.localPath \|\| null \} : r/)
})

test('health engineOk probe sends fusion api key', () => {
  // with fusion-mlx auth enabled, a missing Authorization header always 401s → engineOk stays false
  const index = read('src/index.ts')
  assert.match(index, /authorization: `Bearer \$\{cfg\.apiKey\}`/)
})

test('ffmpeg merge does not call nonexistent fluent-ffmpeg .timeout', () => {
  // old bug: .timeout(3600) threw "not a function" at runtime → every merge failed;
  // the wall-clock cap must be implemented with the start event + timer + kill
  const merge = read('src/services/ffmpeg-merge.ts')
  assert.doesNotMatch(merge, /\.timeout\(/)
  assert.match(merge, /setTimeout\(\(\) => cmd\.kill\('SIGKILL'\), 3_600_000\)/)
})
