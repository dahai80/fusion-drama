import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FusionVideoAdapter } from '../src/services/adapters/fusion-video'

const adapter = new FusionVideoAdapter()
const config = {
  provider: 'fusion',
  baseUrl: 'http://127.0.0.1:11434',
  apiKey: 'REDACTED-LOCAL-KEY',
  model: 'dgrauet--ltx-2.5-mlx-q8',
}

test('fusion request hits sync endpoint with 16:9 full-res default', () => {
  const request = adapter.buildGenerateRequest(config, {
    id: 1,
    prompt: '女孩走进房间',
    duration: 5,
  })

  assert.equal(request.url, 'http://127.0.0.1:11434/v1/videos/generate')
  assert.equal(request.method, 'POST')
  assert.equal(request.headers.Authorization, 'Bearer REDACTED-LOCAL-KEY')
  // fusion-mlx #978: temporal upsampler 已移除，输出帧数 = num_frames。
  // 5s → 目标 120 帧 → 最近 8k+1 = 121
  assert.equal(request.body.num_frames, 121)
  // 短边 1088（官方 distilled 口径 1920x1088，sigma 修复后高分辨率可用）
  assert.equal(request.body.width, 1920)
  assert.equal(request.body.height, 1088)
  assert.equal(request.body.fps, 24)
  assert.equal(request.body.response_format, 'b64_json')
  assert.equal(request.body.seed, undefined)
  assert.equal(request.body.image, undefined)
  // LTX-2.5 distilled 管线自带 cfg，不覆盖
  assert.equal(request.body.cfg_scale, undefined)
  assert.equal(request.body.num_inference_steps, undefined)
})

test('fusion frame mapping after temporal upsampler removal (#978)', () => {
  const frames = (duration?: number | null) =>
    adapter.buildGenerateRequest(config, { id: 2, prompt: 'x', duration }).body.num_frames

  // 输出帧数 = num_frames（8k+1），直接按目标时长请求。
  // VAE OOM 保护：短边 1088(≥1000) 限 5s，duration>5 截断（issue #945）
  assert.equal(frames(2), 49)    // 2s → 48+1
  assert.equal(frames(3), 73)    // 3s → 72+1
  assert.equal(frames(4), 97)    // 4s → 96+1
  assert.equal(frames(5), 121)   // 5s → 120+1
  assert.equal(frames(8), 121)   // 截断 5s（高分辨率 VAE OOM 保护）
  assert.equal(frames(15), 121)  // 截断 5s
  assert.equal(frames(null), 121) // 默认 5s
})

test('fusion respects aspect ratio and clamps to 64 alignment', () => {
  const dims = (aspectRatio?: string | null) => {
    const body = adapter.buildGenerateRequest(config, { id: 3, prompt: 'x', aspectRatio }).body
    return [body.width, body.height]
  }

  // 短边 1088；长边按宽高比 64 最近对齐
  assert.deepEqual(dims('16:9'), [1920, 1088])   // 1088*16/9≈1934 -> round 1920
  assert.deepEqual(dims('9:16'), [1088, 1920])
  assert.deepEqual(dims('1:1'), [1088, 1088])
  // 4:3 长边 1088*4/3≈1450.7 -> round 1472
  assert.deepEqual(dims('4:3'), [1472, 1088])
  assert.deepEqual(dims(null), [1920, 1088])
})

test('fusion passes seed and first frame image', () => {
  const request = adapter.buildGenerateRequest(config, {
    id: 4,
    prompt: 'x',
    seed: 42,
    firstFrameUrl: 'data:image/png;base64,first',
  })
  assert.equal(request.body.seed, 42)
  assert.equal(request.body.image, 'data:image/png;base64,first')
})

test('fusion parses sync b64 response and rejects polling', () => {
  assert.deepEqual(adapter.parseGenerateResponse({
    data: [{ b64_json: 'AAAA' }],
  }), { isAsync: false, videoUrl: 'data:video/mp4;base64,AAAA' })

  assert.deepEqual(adapter.parseGenerateResponse({
    data: [{ url: 'http://127.0.0.1:11434/static/out.mp4' }],
  }), { isAsync: false, videoUrl: 'http://127.0.0.1:11434/static/out.mp4' })

  assert.throws(() => adapter.parseGenerateResponse({ data: [] }), /缺少 data\[0\]/)
  assert.throws(() => adapter.buildPollRequest(config, 'task-1'), /同步接口/)
})

// #947: LTX-Video legacy 2B (Lightricks/LTX-Video) — no temporal upsampler,
// output = num_frames (%8==1). VAE AdaLayerNorm fixed (black frames resolved).
const legacyConfig = { ...config, model: 'Lightricks--LTX-Video' }

test('fusion legacy 2B uses 768 short edge + direct frame mapping', () => {
  const request = adapter.buildGenerateRequest(legacyConfig, {
    id: 10,
    prompt: 'cat on beach',
    duration: 2,
  })
  // legacy: short edge 768, 16:9 long = 768*16/9≈1365 -> round 1344 (64-align)
  assert.equal(request.body.width, 1344)
  assert.equal(request.body.height, 768)
  // legacy maxSeconds=2: 2s*24=48 -> nearest 8k+1 = 49 (#951 修复后可跑)
  assert.equal(request.body.num_frames, 49)
  // rectified-flow 蒸馏模型官方推荐 cfg=1.0（fusion 默认 3.0 致逐帧亮度闪烁）
  assert.equal(request.body.cfg_scale, 1.0)
  assert.equal(request.body.num_inference_steps, 30)
})

test('fusion legacy 2B caps duration at 2s (#951 fix — 49-frame OOM guard)', () => {
  const frames = (duration?: number | null) =>
    adapter.buildGenerateRequest(legacyConfig, { id: 11, prompt: 'x', duration }).body.num_frames
  // maxSeconds=2: all durations clamp to 2s -> 49 frames
  assert.equal(frames(1), 25)
  assert.equal(frames(2), 49)
  assert.equal(frames(5), 49)
  assert.equal(frames(10), 49)
  assert.equal(frames(null), 49)
})

test('fusion legacy 2B respects aspect ratio', () => {
  const dims = (aspectRatio?: string | null) => {
    const body = adapter.buildGenerateRequest(legacyConfig, { id: 12, prompt: 'x', aspectRatio }).body
    return [body.width, body.height]
  }
  // short edge 768; long edge 64-aligned
  assert.deepEqual(dims('16:9'), [1344, 768])   // 768*16/9≈1365 -> 1344
  assert.deepEqual(dims('9:16'), [768, 1344])
  assert.deepEqual(dims('1:1'), [768, 768])
})
