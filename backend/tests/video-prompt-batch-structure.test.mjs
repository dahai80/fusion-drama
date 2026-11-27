import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('video prompt batch service runs per-shot async agent loop', () => {
  const svc = read('src/services/video-prompts.ts')

  // By default only storyboards missing video_prompt are processed; when storyboardIds is given only
  // the selected ones are processed (existing prompts are regenerated too)
  assert.match(svc, /filter\(sb => !\(sb\.videoPrompt \|\| ''\)\.trim\(\)\)/)
  assert.match(svc, /storyboardIds\?\.length/)
  assert.match(svc, /storyboardIds\.includes\(sb\.id\)/)
  // No double start while running
  assert.match(svc, /status === 'running'\) return \{ started: false, total: -1 \}/)
  // Calls prompt_generator per storyboard; success judged by the persisted result
  assert.match(svc, /mastra\.getAgent\('prompt_generator'\)/)
  assert.match(svc, /read_storyboard_context/)
  assert.match(svc, /update_storyboard/)
  assert.match(svc, /fresh\?\.videoPrompt/)
  // Progress tracking and text-model override
  assert.match(svc, /current_storyboard_id/)
  assert.match(svc, /modelOverride: opts\.model/)
  // issue #3: batch persisted into sys_task (type=video_prompt), progress written back into params counts
  assert.match(svc, /type: 'video_prompt'/)
  assert.match(svc, /writeBatchProgress/)
  assert.match(svc, /JSON\.stringify\(\{ total: task\.total, completed: task\.completed, failed: task\.failed \}\)/)
  // Terminal write-back: all-failed marks failed, partial success marks completed (resultUrl summary)
  assert.match(svc, /status: 'failed', errorMsg: `批量生成失败/) // i18n: user-facing
  assert.match(svc, /resultUrl: `完成 \$\{task\.completed\}\/\$\{task\.total\}/) // i18n: user-facing
  // Status query async + DB fallback (the startup sweep marks failed after restart; this returns the terminal state)
  assert.match(svc, /export async function getVideoPromptBatchStatus/)
  assert.match(svc, /eq\(schema\.sysTask\.type, 'video_prompt'\)/)
})

test('episodes route exposes video prompt batch endpoints', () => {
  const route = read('src/routes/episodes.ts')

  assert.match(route, /app\.post\('\/:id\/generate-video-prompts'/)
  assert.match(route, /app\.get\('\/:id\/video-prompts-status'/)
  assert.match(route, /startVideoPromptBatch\(ep\.id, ep\.dramaId/)
  assert.match(route, /body\.storyboard_ids/)
  assert.match(route, /already_running/)
})
