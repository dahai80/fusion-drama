import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FusionVideoAdapter } from '../src/services/adapters/fusion-video'

const adapter = new FusionVideoAdapter()
const config = {
  provider: 'fusion',
  baseUrl: 'http://127.0.0.1:11434',
  apiKey: 'test-key-123',
  model: 'dgrauet--ltx-2.5-mlx-q8',
}

test('fusion request hits sync endpoint with 16:9 768 short edge', () => {
  const request = adapter.buildGenerateRequest(config, {
    id: 1,
    prompt: '女孩走进房间',
    duration: 5,
  })

  assert.equal(request.url, 'http://127.0.0.1:11434/v1/videos/generate')
  assert.equal(request.method, 'POST')
  assert.equal(request.headers.Authorization, 'Bearer test-key-123')
  // fusion-mlx #978: temporal upsampler 已移除，输出帧数 = num_frames。
  // 5s → 目标 120 帧 → 最近 8k+1 = 121
  assert.equal(request.body.num_frames, 121)
  // 短边 768（1088 VAE decode 12min+ OOM，收口 768：1344x768 实测 159.9s 安全）
  assert.equal(request.body.width, 1344)
  assert.equal(request.body.height, 768)
  assert.equal(request.body.fps, 24)
  assert.equal(request.body.response_format, 'b64_json')
  assert.equal(request.body.seed, undefined)
  assert.equal(request.body.image, undefined)
  // LTX-2.5 distilled 管线自带 cfg，不覆盖
  assert.equal(request.body.cfg_scale, undefined)
  assert.equal(request.body.num_inference_steps, undefined)
})

test('fusion LTX-2.5 frame mapping: 8k+1, cap 10s', () => {
  const frames = (duration?: number | null) =>
    adapter.buildGenerateRequest(config, { id: 2, prompt: 'x', duration }).body.num_frames

  // 输出帧数 = num_frames（8k+1），直接按目标时长请求。
  // VAE OOM 保护：短边 768，上限 10s（241帧峰值 ~110GB 贴 128GB 水位）
  assert.equal(frames(2), 49)    // 2s → 48+1
  assert.equal(frames(3), 73)    // 3s → 72+1
  assert.equal(frames(4), 97)    // 4s → 96+1
  assert.equal(frames(5), 121)   // 5s → 120+1
  assert.equal(frames(8), 193)   // 8s → 192+1（≤10s 不截断）
  assert.equal(frames(15), 241)  // 截断 10s → 240+1
  assert.equal(frames(null), 121) // 默认 5s
})

test('fusion LTX-2.5 respects aspect ratio at 768 short edge', () => {
  const dims = (aspectRatio?: string | null) => {
    const body = adapter.buildGenerateRequest(config, { id: 3, prompt: 'x', aspectRatio }).body
    return [body.width, body.height]
  }

  // 短边 768；长边按宽高比 64 最近对齐
  assert.deepEqual(dims('16:9'), [1344, 768])   // 768*16/9≈1365 -> round 1344
  assert.deepEqual(dims('9:16'), [768, 1344])
  assert.deepEqual(dims('1:1'), [768, 768])
  // 4:3 长边 768*4/3=1024 -> 64-align = 1024
  assert.deepEqual(dims('4:3'), [1024, 768])
  assert.deepEqual(dims(null), [1344, 768])
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

test('fusion parses sync b64 response and rejects empty data', () => {
  assert.deepEqual(adapter.parseGenerateResponse({
    data: [{ b64_json: 'AAAA' }],
  }), { isAsync: false, videoUrl: 'data:video/mp4;base64,AAAA' })

  assert.deepEqual(adapter.parseGenerateResponse({
    data: [{ url: 'http://127.0.0.1:11434/static/out.mp4' }],
  }), { isAsync: false, videoUrl: 'http://127.0.0.1:11434/static/out.mp4' })

  assert.throws(() => adapter.parseGenerateResponse({ data: [] }), /缺少 data\[0\]/)
})

// ─── #1254 交接：同步窗口 600s 耗尽 → 202 job 交接 + 轮询认领 ───

test('fusion parses 202 video_job_pending handoff as async task', () => {
  // 上游 videos_routes.py TimeoutError 分支的确切响应形态
  assert.deepEqual(adapter.parseGenerateResponse({
    error: {
      message: 'Video generation still in progress; poll GET /v1/videos/jobs/e21b or fetch output',
      type: 'video_job_pending',
      code: 'video_job_pending',
      job_id: 'e21ba27b945240e1',
    },
  }), { isAsync: true, taskId: 'e21ba27b945240e1' })
})

test('fusion poll request targets GET /v1/videos/jobs/{id} with auth', () => {
  const req = adapter.buildPollRequest(config, 'e21ba27b945240e1')
  assert.equal(req.url, 'http://127.0.0.1:11434/v1/videos/jobs/e21ba27b945240e1')
  assert.equal(req.method, 'GET')
  assert.equal(req.headers.Authorization, 'Bearer test-key-123')
})

test('fusion job output request targets /output/{index} with auth', () => {
  const req = adapter.buildJobOutputRequest(config, 'e21ba27b945240e1')
  assert.equal(req.url, 'http://127.0.0.1:11434/v1/videos/jobs/e21ba27b945240e1/output/0')
  assert.equal(req.method, 'GET')
  assert.equal(req.headers.Authorization, 'Bearer test-key-123')
  assert.equal(adapter.buildJobOutputRequest(config, 'j1', 2).url.endsWith('/output/2'), true)
})

test('fusion parses job poll responses across lifecycle', () => {
  // running/queued → processing（继续轮询）
  assert.deepEqual(adapter.parsePollResponse({ job_id: 'j', status: 'running', progress: 0.8 }),
    { status: 'processing' })
  assert.deepEqual(adapter.parsePollResponse({ job_id: 'j', status: 'queued' }),
    { status: 'processing' })
  // 上游偶发在轮询响应里回 202 形态
  assert.deepEqual(adapter.parsePollResponse({ error: { code: 'video_job_pending' } }),
    { status: 'processing' })
  // completed → 占位符，宿主据此走 buildJobOutputRequest 下载
  assert.deepEqual(adapter.parsePollResponse({ job_id: 'j', status: 'completed', progress: 1.0 }),
    { status: 'completed', videoUrl: 'job-output' })
  // failed/cancelled → 终态失败
  assert.deepEqual(adapter.parsePollResponse({ status: 'failed', error: 'OOM' }),
    { status: 'failed', error: 'OOM' })
  assert.deepEqual(adapter.parsePollResponse({ status: 'cancelled' }),
    { status: 'failed', error: '视频作业 cancelled' })
  // 作业被 prune/重启丢失（404 detail）→ 无法恢复
  assert.equal(adapter.parsePollResponse({ detail: "Video job 'xxx' not found" }).status, 'failed')
})

// LTX-Video legacy 2B routing removed (2026-10-15): 2s cap / 768-only / no
// A/V made it useless next to LTX-2.5; model files deleted from
// ~/.fusion-mlx/models. Remaining routes: LTX-2.5 / MiniMax-H3 / Wan2.2-TI2V-5B.

// MiniMax-H3 (33B Omni-Transformer): quantize=dit8_te4 + turbo LoRA, 4 steps, no audio,
// fl2va i2va/l2va, cap 5s, no 8k+1 frame constraint.
const h3Config = { ...config, model: 'models--ddalcu--MiniMax-H3-FL2VA-MLX-Serve-4bit' }

test('fusion H3 sends quantize=dit8_te4 + turbo LoRA + 4 steps, no audio', () => {
  const request = adapter.buildGenerateRequest(h3Config, {
    id: 20,
    prompt: '山间日出',
    duration: 5,
  })
  // quantize=dit8_te4 (DiT 8-bit + TE 4-bit ≈61GB, fits 128GB)
  assert.equal(request.body.quantize, 'dit8_te4')
  // turbo LoRA (#1213): runtime sidepath over quantized DiT, 4 steps
  // measured 313.6s vs 838s @ 8 steps (2.67x, 1024x576/120f)
  assert.equal(request.body.turbo, true)
  assert.equal(request.body.num_inference_steps, 4)
  // H3 never sends audio (fl2va image mutex + t2va-av UNVERIFIED → TTS dub)
  assert.equal(request.body.audio, undefined)
  // no dev/distilled pipeline for H3
  assert.equal(request.body.pipeline, undefined)
})

test('fusion H3 uses direct frame mapping (no 8k+1), cap 5s', () => {
  const frames = (duration?: number | null) =>
    adapter.buildGenerateRequest(h3Config, { id: 21, prompt: 'x', duration }).body.num_frames
  // H3 accepts 1..361 frames, direct duration*fps, min 25, cap 5s (120f)
  assert.equal(frames(1), 25)    // 1*24
  assert.equal(frames(2), 48)    // 2*24
  assert.equal(frames(5), 120)   // 5*24
  assert.equal(frames(8), 120)   // capped 5s
  assert.equal(frames(15), 120)  // capped 5s
  assert.equal(frames(null), 120) // default 5s
})

test('fusion H3 respects 576 short edge + 16-divisible dims', () => {
  const request = adapter.buildGenerateRequest(h3Config, {
    id: 22,
    prompt: 'x',
    duration: 5,
    aspectRatio: '16:9',
  })
  // short edge 576 (768 OOMs on 128GB); long edge 1024 (576*16/9≈1024, 64-align)
  assert.equal(request.body.width, 1024)
  assert.equal(request.body.height, 576)
})

test('fusion H3 wires lastFrameUrl as last_frame_image (fl2va)', () => {
  const request = adapter.buildGenerateRequest(h3Config, {
    id: 23,
    prompt: 'x',
    duration: 5,
    firstFrameUrl: 'data:image/png;base64,first',
    lastFrameUrl: 'data:image/png;base64,last',
  })
  assert.equal(request.body.image, 'data:image/png;base64,first')
  assert.equal(request.body.last_frame_image, 'data:image/png;base64,last')
})

test('fusion H3 does not set last_frame_image when lastFrameUrl absent', () => {
  const request = adapter.buildGenerateRequest(h3Config, {
    id: 24,
    prompt: 'x',
    duration: 5,
  })
  assert.equal(request.body.last_frame_image, undefined)
})

// Wan2.2-TI2V-5B: T2V/I2V unified 5B, 4k+1 frames ((nf-1)%4==0, Wan2.2-VAE
// temporal stride 4), UMT5 native Chinese (no translation in generation.ts),
// no joint audio (TTS dub), no quantize/steps override (q8 weights
// pre-quantized, server default steps 40). Short edge 544: native 720p
// (1280x704) hits MLX fp32 q8 slow path (seq 18480 > 16384, ~95s/step, #1208);
// 544 keeps seq 10710 on bf16 fast path (525s/81f verified).
const wanConfig = { ...config, model: 'Anes1032--Wan2.2-TI2V-5B-mlx-q8' }

test('fusion Wan5B uses 544 short edge + 4k+1 frames, cap 10s', () => {
  const request = adapter.buildGenerateRequest(wanConfig, {
    id: 30,
    prompt: '孙悟空腾云驾雾',
    duration: 5,
    aspectRatio: '16:9',
  })
  // short edge 544; 16:9 long = 544*16/9≈967 -> round 960 (64-align)
  assert.equal(request.body.width, 960)
  assert.equal(request.body.height, 544)
  // (nf-1)%4==0: 5s=120f -> nearest 4k+1 = 121
  assert.equal(request.body.num_frames, 121)
  // no quantize (q8 weights pre-quantized), no steps override, no audio
  assert.equal(request.body.quantize, undefined)
  assert.equal(request.body.num_inference_steps, undefined)
  assert.equal(request.body.audio, undefined)
  assert.equal(request.body.pipeline, undefined)
})

test('fusion Wan5B frame mapping: 4k+1, cap 10s', () => {
  const frames = (duration?: number | null) =>
    adapter.buildGenerateRequest(wanConfig, { id: 31, prompt: 'x', duration }).body.num_frames
  assert.equal(frames(2), 49)     // 2s -> 48+1
  assert.equal(frames(3), 73)     // 3s -> 72+1
  assert.equal(frames(5), 121)    // 5s -> 120+1
  assert.equal(frames(10), 241)   // 10s -> 240+1
  assert.equal(frames(15), 241)   // capped 10s
  assert.equal(frames(null), 121) // default 5s
})

test('fusion Wan5B passes first frame for I2V', () => {
  const request = adapter.buildGenerateRequest(wanConfig, {
    id: 32,
    prompt: 'x',
    duration: 5,
    firstFrameUrl: 'data:image/png;base64,first',
  })
  assert.equal(request.body.image, 'data:image/png;base64,first')
})
