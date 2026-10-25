import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('novel chunking respects 20k proven window with chapter boundaries', () => {
  const novel = read('src/services/novel.ts')
  // 18k target / 20k max：留 ~2k 给人物卡+前情提要，压在 20.4k 已验证窗口内
  assert.match(novel, /NOVEL_CHUNK_TARGET = 18_000/)
  assert.match(novel, /NOVEL_CHUNK_MAX = 20_000/)
  // 章节标记优先切块，超长章句边界硬切
  assert.match(novel, /第\[0-9一二三四五六七八九十百千零两\]\+\[章回节卷\]/)
  // 改写前守卫：源文超窗直接抛错，不让 LLM 静默截断
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
  // outline/rewrite 走 GPU 串行队列（避免并发 decode 打挂 fusion-mlx）
  const service = read('src/services/novel.ts')
  assert.match(service, /enqueueGpuWork/)
})

test('novel replan preserves user-authored episodes', () => {
  // 重新规划只软删无 scriptContent 的旧规划集，用户手写/手改剧本的集不动
  const service = read('src/services/novel.ts')
  assert.match(service, /scriptContent/)
  assert.match(service, /reuseExisting|reuses|existing/i)
})

test('drama hard-delete cascades novel pipeline tables', () => {
  // 删除测试剧后 novel_segments/novel_episode_plans 残留孤儿行（实测踩坑）→ 级联补删
  const cascade = read('src/utils/cascade.ts')
  assert.match(cascade, /novelSegments/)
  assert.match(cascade, /novelEpisodePlans/)
})

test('per-character voice assignment is stable and DB-overridable', () => {
  const dub = read('src/utils/video-dub.ts')
  // 角色表 voice 列显式指定优先
  assert.match(dub, /characterVoices\.get\(speaker\)/)
  // 无显式指定时按角色名哈希稳定落位（跨镜头/跨集一致），不再按镜头轮转
  assert.match(dub, /voiceForSpeaker/)
  assert.match(dub, /KOKORO_TTS_VOICES/)
  // Qwen3-TTS Base 无预设音色（E2E 验证 400）→ ICL 克隆：workspace/voices ref 音色库
  // + 服务端音色包优先（fusion-mlx #1383，voice 名直传免 base64）
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
  // fusion-mlx /v1/images/edits：仅 redux 变体吃 reference_images；
  // Kontext 只收 image[0]（编辑目标），多传被 flux1_dev 分支静默丢弃
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
