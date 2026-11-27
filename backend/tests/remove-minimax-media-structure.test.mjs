import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('../..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const exists = (path) => existsSync(new URL(path, root))

// 2026-10 update: MiniMax was once removed entirely, then re-integrated as an official
// video provider in the MiniMax-H3 era (cloud H3 API; local H3 goes through the fusion
// provider, see fusion-video.ts). This file now asserts the current shape: the video
// side exists, the image side is still absent.
// (The historical MySQL-startup assertion that cleaned up MiniMax configs was dropped
// together with mysql-schema.ts.)

test('MiniMax is an official video provider with a cloud video adapter', () => {
  const ai = read('backend/src/services/ai.ts')
  const registry = read('backend/src/services/adapters/registry.ts')
  const settings = read('frontend/app/pages/settings.vue')
  const readme = read('README.md')

  // Official video provider list includes minimax
  assert.match(ai, /video:\s*\[\s*'volcengine',\s*'minimax',\s*'aliyun',\s*'fusion'\s*\]/)
  // Adapter registry mounts the cloud MiniMax video adapter (local H3 goes through the fusion adapter)
  assert.match(registry, /import \{ MiniMaxVideoAdapter \} from '\.\/minimax-video'/)
  assert.match(registry, /minimax: new MiniMaxVideoAdapter\(\)/)
  assert.equal(exists('backend/src/services/adapters/minimax-video.ts'), true)
  // Image side not restored: no minimax image adapter
  assert.equal(exists('backend/src/services/adapters/minimax-image.ts'), false)
  // Frontend settings page offers the MiniMax video provider option; README documents it
  // i18n: user-facing (matches Chinese UI label in settings.vue)
  assert.match(settings, /minimax: \{ label: 'MiniMax H3 官方'/)
  assert.match(readme, /minimax/i)
})
