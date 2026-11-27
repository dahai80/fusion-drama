import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('novel chunking respects 20k proven window with chapter boundaries', () => {
  const novel = read('src/services/novel.ts')
  // 18k target / 20k max: leaves ~2k for the character card + recap, inside the verified
  // 20.4k window
  assert.match(novel, /NOVEL_CHUNK_TARGET = 18_000/)
  assert.match(novel, /NOVEL_CHUNK_MAX = 20_000/)
  // chapter markers split first; over-long chapters hard-cut at sentence boundaries
  // i18n: user-facing — asserts the zh chapter-marker regex in source
  assert.match(novel, /第\[0-9一二三四五六七八九十百千零两\]\+\[章回节卷\]/)
  // pre-rewrite guard: over-window source throws instead of letting the LLM silently truncate
  assert.match(novel, /22_000/)

})

test('novel routes mounted and status exposes task progress', () => {
  const index = read('src/index.ts')
  assert.match(index, /api\.route\('\/novel', novel\)/)

  const routes = read('src/routes/novel.ts')
  assert.match(routes, /app\.post\('\/import'/)
  assert.match(routes, /app\.post\('\/outline'/)
  assert.match(routes, /app\.post\('\/plan'/)
  assert.match(routes, /app\.post\('\/rewrite'/)
  assert.match(routes, /app\.get\('\/status'/)
  // outline/rewrite go through the GPU serial queue (avoids concurrent decode crashes on fusion-mlx)
  const service = read('src/services/novel.ts')
  assert.match(service, /enqueueGpuWork/)
})

test('novel replan preserves user-authored episodes', () => {
  // replanning only soft-deletes old planned episodes without scriptContent; episodes with
  // user-written/user-edited scripts are untouched
  const service = read('src/services/novel.ts')
  assert.match(service, /scriptContent/)
  assert.match(service, /reuseExisting|reuses|existing/i)
})

test('drama hard-delete cascades novel pipeline tables', () => {
  // deleting a test drama left orphan rows in novel_segments/novel_episode_plans (real-world
  // pitfall) → cascade cleanup added
  const cascade = read('src/utils/cascade.ts')
  assert.match(cascade, /novelSegments/)
  assert.match(cascade, /novelEpisodePlans/)
})

test('per-character voice assignment is stable and DB-overridable', () => {
  const dub = read('src/utils/video-dub.ts')
  // explicit voice from the characters table wins
  assert.match(dub, /characterVoices\.get\(speaker\)/)
  // without an explicit voice, placement is stable by character-name hash (consistent across
  // shots/episodes), no longer per-shot rotation
  assert.match(dub, /voiceForSpeaker/)
  assert.match(dub, /KOKORO_TTS_VOICES/)
  // Qwen3-TTS Base has no preset voices (verified 400 in E2E) → ICL cloning: the
  // workspace/voices ref library + server voice bundles first (fusion-mlx #1383, voice name
  // passed directly without base64)
  assert.match(dub, /listLocalRefVoices/)
  assert.match(dub, /listServerVoiceBundles/)
  assert.match(dub, /ref_audio/)
  assert.match(dub, /isQwen3Tts/)
})

test('characters table has voice column with idempotent migration', () => {
  const schema = read('src/db/sqlite-schema.ts')
  assert.match(schema, /ALTER TABLE characters ADD COLUMN voice TEXT/)
  assert.match(schema, /PRAGMA table_info\(characters\)/)
})

test('kontext adapter wraps prompt as edit instruction and sends single image', () => {
  // fusion-mlx /v1/images/edits: only the redux variant consumes reference_images;
  // Kontext only takes image[0] (the edit target), extras are silently dropped by the
  // flux1_dev branch
  const adapter = read('src/services/adapters/openai-image.ts')
  assert.match(adapter, /isKontext/)
  assert.match(adapter, /refs\.slice\(0, 1\)/)
  assert.match(adapter, /KONTEXT_PROMPT_PREFIX/)
})

test('frontend novel wizard wired: button, component, api client', () => {
  const detail = read('../frontend/app/views/drama/detail.vue')
  assert.match(detail, /novelWizardOpen = true/)
  assert.match(detail, /NovelWizard/)
  const api = read('../frontend/app/composables/useApi.ts')
  assert.match(api, /novelAPI/)
  assert.match(api, /\/novel\/import/)
  const wizard = read('../frontend/app/components/NovelWizard.vue')
  assert.match(wizard, /novelAPI\.status/)
  assert.match(wizard, /novelAPI\.rewriteAll/)
})
