import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('storyboard composed image feeds video first frame (image_prompt not orphaned)', () => {
  // 后端：分镜成图自动作为视频首帧（显式 first_frame/image 仍最高优先）
  const tasks = read('src/routes/tasks.ts')
  assert.match(tasks, /sb\.composedImage \|\| sb\.firstFrameImage/)
  assert.match(tasks, /hasExplicitFrame/)

  // 图片任务写回分镜成图（frameType composed → composedImage）
  const generation = read('src/services/generation.ts')
  assert.match(generation, /sbUpdate\.composedImage = localPath/)

  // 前端：分镜图生成入口（单个 + 批量）已接线，不再只有后端能力
  const episode = read('../frontend/app/views/drama/episode.vue')
  assert.match(episode, /function genSbImage\(/)
  assert.match(episode, /function batchSbImages\(/)
  assert.match(episode, /frame_type: 'composed'/)
})

test('image task result_url never stores raw data URI', () => {
  // 旧 bug：fusion 同步返回 base64 data URI 被原样存 result_url（单行最多 6MB），
  // 列表接口 JSON.stringify 撑爆 RangeError: Invalid string length → 500
  const generation = read('src/services/generation.ts')
  assert.match(generation, /imageUrl\.startsWith\('data:'\) \? localPath : imageUrl/)

  // 列表端点兜底：历史脏数据行降级为 localPath，不再原样返回
  const tasks = read('src/routes/tasks.ts')
  assert.match(tasks, /resultUrl\.startsWith\('data:'\) \? \{ \.\.\.r, resultUrl: r\.localPath \|\| null \} : r/)
})

test('health engineOk probe sends fusion api key', () => {
  // fusion-mlx 开鉴权后无 Authorization 头必 401 → engineOk 恒 false
  const index = read('src/index.ts')
  assert.match(index, /authorization: `Bearer \$\{cfg\.apiKey\}`/)
})

test('ffmpeg merge does not call nonexistent fluent-ffmpeg .timeout', () => {
  // 旧 bug：.timeout(3600) 运行时 not a function → 所有 merge 必 failed；
  // wall-clock 上限必须用 start 事件 + 定时器 + kill 实现
  const merge = read('src/services/ffmpeg-merge.ts')
  assert.doesNotMatch(merge, /\.timeout\(/)
  assert.match(merge, /setTimeout\(\(\) => cmd\.kill\('SIGKILL'\), 3_600_000\)/)
})
