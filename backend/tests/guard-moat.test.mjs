import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')

/**
 * Issue #8 moat guard: the ffmpeg merge/export pipeline and the local three-model routing
 * (LTX-2.5/H3/Wan2.2) are the core differentiators of this project vs a pure cloud solution.
 * Any "align with cloud tools" refactor that removes/replaces either block turns this test red
 * first — the commercial narrative (local-first + full export pipeline) must not be silently
 * diluted. If a change is truly needed, edit this test explicitly and explain why in the PR.
 */
test('guard moat: local video model routing stays in fusion-video adapter', () => {
  const adapter = read('src/services/adapters/fusion-video.ts')
  const generation = read('src/services/generation.ts')
  const registry = read('src/services/adapters/registry.ts')

  // The three-model routing predicates must be kept
  assert.match(adapter, /export function isMiniMaxH3/, 'H3 routing predicate missing')
  assert.match(adapter, /isWan22Ti2v5b|Wan22Ti2v5b/, 'Wan2.2 routing predicate missing')
  assert.match(adapter, /ltx-2\.5|isLtx/, 'LTX-2.5 routing missing')
  // H3-specific params: quantization (33B requires dit8_te4 to fit in 128GB) + turbo LoRA
  assert.match(adapter, /dit8_te4/, 'H3 quantize param missing')
  assert.match(adapter, /turbo/, 'H3 turbo LoRA switch missing')
  // Resolution base constants (short-edge lock) must exist
  assert.match(adapter, /SHORT_EDGE/, 'short-edge resolution constant missing')
  // generation.ts skip-translation predicates (H3/Wan2.2 receive Chinese prompts directly) depend on these exports
  assert.match(generation, /isMiniMaxH3/, 'generation does not consume the H3 predicate (skip-translation chain)')
  // The fusion local provider must be registered in the adapter registry
  assert.match(registry, /fusion/, 'fusion provider not registered')
})

test('guard moat: ffmpeg merge/export pipeline stays in-tree', () => {
  assert.ok(existsSync(new URL('src/services/ffmpeg-merge.ts', root)), 'ffmpeg-merge.ts does not exist')
  const merge = read('src/services/ffmpeg-merge.ts')

  // Merge core: ffmpeg-static bundled binary + concat protocol + encoding params
  assert.match(merge, /ffmpeg-static|FFMPEG_BIN/, 'ffmpeg binary resolution missing')
  assert.match(merge, /concat/, 'concat merge protocol missing')
  assert.match(merge, /h264|libx264/, 'h264 encoding missing')
  assert.match(merge, /aac/, 'aac audio track missing')
})

test('guard moat: local-first story documented in README', () => {
  const readme = read('../README.md')
  assert.match(readme, /local-first|local model|offline/i, 'README local-first narrative missing')
})
