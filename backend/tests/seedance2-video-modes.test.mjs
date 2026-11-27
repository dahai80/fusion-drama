import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('volcengine video adapter only supports Seedance 2.0 models and reference mode only', () => {
  const adapter = read('src/services/adapters/volcengine-video.ts')

  // Model whitelist: only the doubao-seedance-2-0-* prefix
  assert.match(adapter, /SEEDANCE2_MODEL_PREFIX = 'doubao-seedance-2-0'/)
  assert.match(adapter, /startsWith\(SEEDANCE2_MODEL_PREFIX\)/)

  // Only multimodal reference remains: other mode branches and the legacy mapping have been removed
  assert.doesNotMatch(adapter, /mode === 'text'/)
  assert.doesNotMatch(adapter, /mode === 'first_frame'/)
  assert.doesNotMatch(adapter, /mode === 'first_last'/)
  assert.doesNotMatch(adapter, /LEGACY_MODE_MAP/)
  assert.doesNotMatch(adapter, /first_frame/)
  assert.doesNotMatch(adapter, /last_frame/)

  // Multimodal content item roles
  assert.match(adapter, /role: 'reference_image'/)
  assert.match(adapter, /role: 'reference_video'/)
  assert.match(adapter, /role: 'reference_audio'/)

  // Material limits 9/3/3, audio requires visual material, at least one material or prompt
  assert.match(adapter, /REF_LIMITS = \{ images: 9, videos: 3, audios: 3 \}/)
  assert.match(adapter, /参考音频需要至少 1 个参考图片或视频/) // i18n: user-facing
  assert.match(adapter, /多模态参考模式需要至少一个参考素材或 prompt/) // i18n: user-facing

  // generate_audio configurable (default on), duration 4-15s; resolution fixed per episode (480p/720p, default 720p)
  assert.match(adapter, /generate_audio:\s*record\.generateAudio/)
  assert.match(adapter, /Math\.min\(15, Math\.max\(4, parsed\)\)/)
  assert.match(adapter, /resolution: record\.resolution === '480p' \? '480p' : '720p'/)
})

test('video generation service resolves reference media and persists new fields', () => {
  const service = read('src/services/generation.ts')

  assert.match(service, /PUBLIC_BASE_URL/)
  assert.match(service, /resolvePublicMediaUrl/)
  assert.match(service, /referenceVideoUrls: params\.referenceVideoUrls/)
  assert.match(service, /referenceAudioUrls: params\.referenceAudioUrls/)
  assert.match(service, /generateAudio: params\.generateAudio === false \? 0 : 1/)
  // Default multimodal reference mode
  assert.match(service, /referenceMode: params\.referenceMode \|\| 'reference'/)
  assert.doesNotMatch(service, /referenceMode: params\.referenceMode \|\| 'text'/)
  assert.doesNotMatch(service, /referenceMode: params\.referenceMode \|\| 'none'/)
})

test('video resolution is fixed per episode, editable, and locked into video tasks', () => {
  const episodes = read('src/routes/episodes.ts')
  const tasks = read('src/routes/tasks.ts')
  const service = read('src/services/generation.ts')

  // Fixed at episode creation (default 720p, only 480p/720p accepted)
  assert.match(episodes, /\['480p', '720p', '1080p'\]\.includes\(body\.resolution\)/)
  // PUT can change it, whitelist validation
  assert.match(episodes, /'status', 'resolution'\]/)
  assert.match(episodes, /resolution 只支持 480p \/ 720p/) // i18n: user-facing
  // Video tasks lock in the episode's resolution (takes precedence over the request body)
  assert.match(tasks, /episodeResolution = ep\.resolution/)
  assert.match(tasks, /resolution: episodeResolution \|\| videoBody!\.resolution/)
  // Service stores it in params and passes it to the adapter
  assert.match(service, /resolution: normalizeStoredVideoResolution\(params\.resolution\)/)
  assert.match(service, /resolution: params\.resolution,/)
})

test('upload route exposes validated video and audio endpoints', () => {
  const route = read('src/routes/upload.ts')

  assert.match(route, /app\.post\('\/video'/)
  assert.match(route, /app\.post\('\/audio'/)
  assert.match(route, /VIDEO_EXT = new Set\(\['\.mp4', '\.mov', '\.webm', '\.m4v'\]\)/)
  assert.match(route, /AUDIO_EXT = new Set\(\['\.mp3', '\.wav', '\.m4a', '\.aac'\]\)/)
  assert.match(route, /50 \* 1024 \* 1024/)
  assert.match(route, /20 \* 1024 \* 1024/)
})

test('tasks route validates reference-mode requirements for video tasks', () => {
  const route = read('src/routes/tasks.ts')

  // Unified task entry: type dispatches image/video
  assert.match(route, /type 必须为 image 或 video/) // i18n: user-facing
  assert.match(route, /generateImage\(\{/)
  assert.match(route, /generateVideo\(\{/)

  // Validation for the other modes has been removed
  assert.doesNotMatch(route, /文生视频模式必须提供 prompt/) // i18n: user-facing
  assert.doesNotMatch(route, /首帧模式必须提供 first_frame_url/) // i18n: user-facing
  assert.doesNotMatch(route, /首尾帧模式必须同时提供/) // i18n: user-facing
  // The Wan 3.0 official-param compat layer normalizes input.media into flat fields like first_frame_url/last_frame_url

  // Multimodal reference validation, reference mode fixed
  assert.match(route, /参考素材超限：图片≤9、视频≤3、音频≤3/) // i18n: user-facing
  assert.match(route, /参考音频需要至少 1 个参考图片或视频/) // i18n: user-facing
  assert.match(route, /视频生成需要至少一个参考素材或 prompt/) // i18n: user-facing
  assert.match(route, /referenceMode: 'reference'/)
  assert.match(route, /referenceVideoUrls: videoBody!\.reference_video_urls/)
  assert.match(route, /referenceAudioUrls: videoBody!\.reference_audio_urls/)
  assert.match(route, /generateAudio: videoBody!\.generate_audio/)
})

test('image/video generation tasks are unified into a single sys_task table', () => {
  const schema = read('src/db/schema.ts')
  const sqliteSchema = read('src/db/sqlite-schema.ts')
  const envExample = read('.env.example')

  // sys_task: type distinguishes image/video, generation params go into params(JSON)
  assert.match(schema, /export const sysTask = sqliteTable\('sys_task'/)
  assert.match(schema, /type: text\('type'\)\.notNull\(\)/)
  assert.match(schema, /params: text\('params'\)/)
  assert.match(schema, /resultUrl: text\('result_url'\)/)
  assert.match(schema, /localPath: text\('local_path'\)/)

  // The old image_generations / video_generations table definitions have been removed
  assert.doesNotMatch(schema, /imageGenerations/)
  assert.doesNotMatch(schema, /videoGenerations/)
  assert.doesNotMatch(sqliteSchema, /CREATE TABLE IF NOT EXISTS image_generations/)
  assert.doesNotMatch(sqliteSchema, /CREATE TABLE IF NOT EXISTS video_generations/)

  // SQLite DDL (idempotent replay at startup)
  assert.match(sqliteSchema, /CREATE TABLE IF NOT EXISTS sys_task \(/)
  assert.match(sqliteSchema, /type TEXT NOT NULL/)
  assert.match(sqliteSchema, /params TEXT/)
  assert.match(sqliteSchema, /result_url TEXT/)

  // Routes and service only touch sys_task (unified /tasks entry, type filter)
  const tasksRoute = read('src/routes/tasks.ts')
  const service = read('src/services/generation.ts')
  assert.match(tasksRoute, /schema\.sysTask/)
  // B15: type filter pushed down into SQL (eq(schema.sysTask.type, ...)), no longer full-table scan filtered in memory
  assert.match(tasksRoute, /eq\(schema\.sysTask\.type, type\)/)
  assert.match(service, /db\.insert\(schema\.sysTask\)/)

  assert.match(envExample, /PUBLIC_BASE_URL/)
})
