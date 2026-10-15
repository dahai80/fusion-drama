import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('video prompt batch service runs per-shot async agent loop', () => {
  const svc = read('src/services/video-prompts.ts')

  // 默认只处理缺少 video_prompt 的分镜；指定 storyboardIds 时只处理所选（已有提示词也重新生成）
  assert.match(svc, /filter\(sb => !\(sb\.videoPrompt \|\| ''\)\.trim\(\)\)/)
  assert.match(svc, /storyboardIds\?\.length/)
  assert.match(svc, /storyboardIds\.includes\(sb\.id\)/)
  // 运行中不重复启动
  assert.match(svc, /status === 'running'\) return \{ started: false, total: -1 \}/)
  // 逐个分镜调用 prompt_generator，以落库结果判定成败
  assert.match(svc, /mastra\.getAgent\('prompt_generator'\)/)
  assert.match(svc, /read_storyboard_context/)
  assert.match(svc, /update_storyboard/)
  assert.match(svc, /fresh\?\.videoPrompt/)
  // 进度跟踪与文本模型覆盖
  assert.match(svc, /current_storyboard_id/)
  assert.match(svc, /modelOverride: opts\.model/)
  // issue #3：批次落 sys_task 持久化（type=video_prompt），进度回写 params 计数
  assert.match(svc, /type: 'video_prompt'/)
  assert.match(svc, /writeBatchProgress/)
  assert.match(svc, /JSON\.stringify\(\{ total: task\.total, completed: task\.completed, failed: task\.failed \}\)/)
  // 终态回写：全部失败标 failed，部分成功标 completed（resultUrl 汇总）
  assert.match(svc, /status: 'failed', errorMsg: `批量生成失败/)
  assert.match(svc, /resultUrl: `完成 \$\{task\.completed\}\/\$\{task\.total\}/)
  // 状态查询 async + DB 回退（重启后启动清扫已标 failed，此处返回终态）
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
