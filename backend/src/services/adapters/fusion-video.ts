/**
 * fusion-mlx local video generation adapter
 * Endpoint: /v1/videos/generate (synchronous blocking, returns base64 data URI)
 * Models: dgrauet--ltx-2.5-mlx-q8 and other local video models loaded by fusion-mlx
 *
 * Protocol notes: a normal synchronous response is { data: [{ b64_json | url }] }, no task polling.
 * #1254 handoff: when the upstream sync window _SYNC_VIDEO_WAIT_SECONDS=600s is exhausted
 * while the job is still running, it returns 202 + { error: { code: "video_job_pending", job_id } } —
 * the job is shielded and keeps running server-side; the client polls GET /v1/videos/jobs/{job_id},
 * then fetches the artifact from /v1/videos/jobs/{job_id}/output/0 (Bearer auth required; the job
 * is pruned along with its temp files 1800s TTL after reaching a terminal state).
 * isAsync=true goes through generation.ts pollTask.
 */
import type {
  VideoProviderAdapter,
  ProviderRequest,
  AIConfig,
  VideoGenerationRecord,
  VideoGenResponse,
  VideoPollResponse,
} from './types'
import { joinProviderUrl } from './url'

/** LTX-2.5 frame count conversion. Since fusion-mlx #978 the temporal upsampler has been
 *  removed from the distilled pipeline: output frames = num_frames (no more 16T-7 double
 *  amplification), so request 8k+1 frames directly for the target duration.
 *  (The old pipeline logic that back-derived the latent period from 16T-7 is obsolete
 *  along with the upsampler.)
 *
 *  VAE OOM protection (issue #945): upstream landed temporal-only tiling (tiling="auto",
 *  auto chunked decode above 65 frames), so the duration cap is relaxed to 15s. */
function numFramesForDuration(duration?: number | null, maxSeconds = 15): number {
  const fps = 24
  const seconds = Math.min(maxSeconds, Math.max(2, Math.round(Number(duration || 5))))
  const target = seconds * fps
  // num_frames constraint %8==1: round to nearest 8k+1
  return Math.max(9, Math.round((target - 1) / 8) * 8 + 1)
}

/** Dimensions aligned to 64 (nearest): Stage1 = target size / 2 must be a multiple of 32.
 *  After the sigma fix the conservative floor is no longer needed; rounding to the nearest
 *  multiple of 64 stays closer to the target aspect ratio. */
function alignDim(value: number, fallback: number): number {
  const v = Math.round(Number(value) || fallback)
  const clamped = Math.min(1920, Math.max(576, v))
  return Math.round(clamped / 64) * 64
}

/** LTX-2.5 two-stage distilled: Stage1 half-resolution generation → latent 2x upsample → Stage2 refine.
 *  Short-edge baseline 768 (measured 1344x768: 159.9s / 121 frames / 5.04s, peak 64.76GB, safe).
 *  1088 short edge (1920x1088) VAE decode takes 12min+ and OOMs (114GB > 112GB watermark) —
 *  not viable on a 128GB machine, so it is capped at 768. Quality verified acceptable
 *  (frame diff avg within normal range). */
const SHORT_EDGE_BASE_LTX25 = 768

/** MiniMax-H3: 33B Omni-Transformer. Short edge 576 (16:9 → 1024x576).
 *  Measured: 768 short edge (1344x768) token count 6552+, OOMs at 10 steps (MLX cache
 *  accumulation exceeds 120GB); 576 short edge (1024x576) spatial tokens=2304 (same as
 *  768x768), 10 steps finish 1.17s output in 107s. dim_divisibility=16, 576/16=36 satisfies it. */
const SHORT_EDGE_BASE_H3 = 576

/** Wan2.2-TI2V-5B: short edge 544 (16:9 → 960×544). Native 720P (1280×704) on the MLX side
 *  has seq=18480 exceeding the FUSION_WAN2_Q8_FP32_SEQ(16384) threshold, so q8 attention
 *  takes the fp32 slow path: ~95s/step, 40 steps ~60min for a 3.4s clip, and triggers
 *  memory enforcer hard pressure (fusion-mlx #1208). 544 short edge seq=10710 takes the
 *  bf16 fast path: measured 525s for an 81-frame 3.375s output. Can rise back to 704
 *  after upstream fixes #1208. */
const SHORT_EDGE_BASE_WAN5B = 544

/** Detect MiniMax-H3 (33B Omni-Transformer, fl2va/i2va/l2va).
 *  H3 routing is independent of LTX: requires quantize=dit8_te4 (61GB) or 144GB OOM on a
 *  128GB machine; no 8k+1 frame constraint (1..361); joint audio is mutually exclusive
 *  with fl2va image → TTS dub instead. */
export function isMiniMaxH3(model: string): boolean {
  const m = model.toLowerCase()
  return m.includes('minimax') || m.includes('h3-fl2va') || m.includes('h3-ref2va')
    || m.includes('minimax-h3') || m.includes('minimax_h3')
}

/** Detect Wan2.2-TI2V-5B (Alibaba 5B compact DiT + Wan2.2-VAE 16×16×4 high compression).
 *  Single unified model for T2V/I2V (A14B ships as two separate T2V/I2V models; excluding
 *  ti2v avoids false matches).
 *  The UMT5 text encoder natively understands Chinese (generation.ts skips translation
 *  accordingly); frame constraint (nf-1)%4==0 (fusion-mlx wan2 constraints); no joint audio. */
export function isWan22Ti2v5b(model: string): boolean {
  const m = model.toLowerCase()
  return m.includes('ti2v') && m.includes('5b')
}

/** MiniMax-H3 frame count conversion: no 8k+1 constraint (H3 accepts 1..361 frames),
 *  so duration*fps directly.
 *  Cap 5s (120 frames): 8 steps measured 2s/3s/4s/5s all pass; 6s (144f) MLX cache
 *  accumulation exceeds the 120GB ceiling and gets cancelled by the memory guard.
 *  5s takes 773s, peak ~56GB, safe. */
function numFramesForDurationH3(duration?: number | null, maxSeconds = 5): number {
  const fps = 24
  const seconds = Math.min(maxSeconds, Math.max(1, Math.round(Number(duration || 5))))
  return Math.max(25, seconds * fps)
}

/** Wan2.2-TI2V-5B frame count conversion: constraint (nf-1)%4==0 (Wan2.2-VAE temporal
 *  stride 4), computed directly as 4k+1 (81=3.4s / 121=5s / 241=10s). */
function numFramesForDurationWan(duration?: number | null, maxSeconds = 10): number {
  const fps = 24
  const seconds = Math.min(maxSeconds, Math.max(2, Math.round(Number(duration || 5))))
  const target = seconds * fps
  return Math.max(9, Math.round((target - 1) / 4) * 4 + 1)
}

/** Strip quoted dialogue lines (「…」/『…』/ "...") from the prompt.
 *  Dialogue is synthesized into the audio track separately by TTS dubbing (video-dub);
 *  leaving it in the video prompt makes LTX render it as burned-in garbled subtitle
 *  text (observed "Diciple speek only truth...").
 *  Only the quote itself is removed; surrounding action/camera descriptions are kept. */
function stripDialogue(prompt: string): string {
  return prompt
    .replace(/[「『][^」』]*[」』]/g, '')
    .replace(/"[^"]{2,}"/g, '')
    .replace(/[，,、]\s*(?=[，,、\n]|$)/g, '') // clean up leftover consecutive punctuation
    .replace(/[ \t]+$/gm, '')
}

export class FusionVideoAdapter implements VideoProviderAdapter {
  provider = 'fusion'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model
    if (!model) throw new Error('Video model not specified')

    const prompt = (record.prompt || '').trim()
    if (!prompt) throw new Error('Video generation requires a prompt')

    // Reference image: local models only support a single first frame (the ltx backend
    // returns a 422 when i2v is unsupported).
    // FR-BIZ-2a first-frame image selection unification: the conditioning image is resolved
    // by the host (generation.ts resolveI2vSubjectUrl) and passed in via firstFrameUrl —
    // @imageN/@character subject picking and last-image fallback both live in the host;
    // the adapter no longer keeps a second selection implementation. Explicit
    // firstFrameUrl/imageUrl still take highest priority.
    const firstFrame = record.firstFrameUrl || record.imageUrl

    const h3 = isMiniMaxH3(model)
    const wan5b = isWan22Ti2v5b(model)
    // H3 short edge 576 (in "768p" resolution terms); LTX-2.5 768; Wan 5B 544.
    const shortEdgeBase = h3
      ? SHORT_EDGE_BASE_H3
      : (wan5b ? SHORT_EDGE_BASE_WAN5B : SHORT_EDGE_BASE_LTX25)

    // Dimensions must be explicit: when omitted fusion defaults to 768x512 and Stage1
    // renders a blurry 384x256.
    // Lock short edge to base (LTX-2.5=768 / H3=576 / Wan5B=544); derive the long edge from
    // the aspect ratio aligned to 64 (64 is a multiple of 16, satisfying H3
    // dim_divisibility=16 and the LTX 32 constraint).
    const ar = record.aspectRatio
    const [aw, ah] = ar ? String(ar).split(':').map(Number) : [16, 9]
    let shortEdge = shortEdgeBase
    const body: any = {
      model,
      prompt: stripDialogue(prompt),
      fps: 24,
      response_format: 'b64_json',
    }
    if (aw > 0 && ah > 0) {
      const long = Math.max(aw, ah)
      const short = Math.min(aw, ah)
      const longEdge = alignDim(shortEdgeBase * long / short, 1920)
      if (aw >= ah) {
        body.width = longEdge
        body.height = shortEdgeBase
      } else {
        body.width = shortEdgeBase
        body.height = longEdge
      }
    }

    // VAE OOM / duration protection:
    // LTX-2.5 cap 10s (241 frames peak ~110GB, close to the 128GB watermark).
    // H3 cap 5s (120 frames): 8 steps measured 2s/3s/4s/5s all pass (peak ~56GB);
    // 6s (144f) MLX cache accumulation exceeds the 120GB ceiling and gets cancelled
    // by the memory guard.
    // Wan2.2-TI2V-5B cap 10s (241 frames; the 16×16×4 high-compression VAE latent is tiny,
    // 5B denoise + chunked decode use far less memory than LTX-2.5; relax after verification).
    const maxSeconds = h3 ? 5 : 10
    const requested = Number(record.duration) || 5
    if (requested > maxSeconds) {
      console.warn(
        `[fusion-video] ${h3 ? 'H3' : wan5b ? 'Wan5B' : 'LTX-2.5'}(short edge ${shortEdge})` +
        ` duration ${requested}s exceeds the safe cap ${maxSeconds}s, truncating to ${maxSeconds}s.` +
        ` Storyboard breakdown should keep each shot ≤${maxSeconds}s`,
      )
    }
    body.num_frames = h3
      ? numFramesForDurationH3(record.duration, maxSeconds)
      : wan5b
        ? numFramesForDurationWan(record.duration, maxSeconds)
        : numFramesForDuration(record.duration, maxSeconds)

    // Quality tier (optional dev): 22B bf16 single-stage full resolution (20 steps CFG=4,
    // best quality, measured ~1600s/41f); default is distilled (8/3 steps, ~80s).
    // Since #995 dev also supports joint A/V; audio is mapped uniformly by generateAudio below.
    // H3 / Wan5B have no dev/distilled pipeline concept, skip.
    if (!h3 && !wan5b && record.videoPipeline === 'dev') {
      body.pipeline = 'dev'
      body.num_inference_steps = 20
      body.cfg_scale = 4.0
    }

    // MiniMax-H3 33B: must use quantize=dit8_te4 (DiT 8-bit + TE 4-bit ≈61GB), otherwise
    // bf16 full weights 144GB > 128GB machine → OOM crash (root cause of 10/10 task failures).
    // Pre-Turbo history: steps=8 (8 steps measured can run 5s at peak ~56GB; 20 steps get
    // cancelled at step 16 when cache exceeds 120GB; 10 steps limited to 1s).
    // No audio (fl2va image is mutually exclusive with joint audio, generate.py:843;
    // dialogue dubbing uses the separate TTS dub pipeline).
    if (h3) {
      body.quantize = 'dit8_te4'
      // Turbo LoRA (#1212/#1213): turbo_lora.safetensors at the model root is side-loaded
      // at runtime (module 259); 4-step sampling measured 313.6s vs 838s at 8 steps (2.67x,
      // same spec 1024×576/120f). fusion-mlx returns an explicit 400 if the file is missing
      // (no silent quality downgrade).
      body.num_inference_steps = 4
      body.turbo = true
    }

    // Audio (LTX-2.5 joint A/V, supported by both distilled/dev): generateAudio defaults on
    // (only createTask side false stores 0); H3 / Wan5B have no joint audio branch, omit it.
    // H3 joint audio (t2va-av) is mutually exclusive with fl2va image (generate.py:843), and
    // the t2va-av pipeline is UNVERIFIED (generate.py:160) → H3 never sends audio;
    // dialogue dubbing uniformly uses the separate TTS dub (video-dub) pipeline.
    // LTX-2.5 also disables it when a first frame is present (fl2va image is mutually
    // exclusive with joint audio, upstream hard validation).
    if (!h3 && !wan5b && record.generateAudio) {
      if (firstFrame) {
        console.warn(
          `[fusion-video] First-frame I2V is mutually exclusive with joint audio (upstream hard validation), disabling audio automatically.` +
          ` Dialogue dubbing is still generated by the TTS pipeline`,
        )
      } else {
        body.audio = true
      }
    }

    if (record.seed != null && Number.isFinite(Number(record.seed))) {
      body.seed = Number(record.seed)
    }
    if (firstFrame) body.image = firstFrame
    // H3 fl2va: last_frame_image as the end-frame condition (l2va); combined with the first
    // frame image it becomes fl2va.
    // Only H3 supports end-frame anchoring (the LTX-2.5 backend does not accept
    // last_frame_image).
    if (h3 && record.lastFrameUrl) {
      body.last_frame_image = record.lastFrameUrl
    }

    return {
      url: joinProviderUrl(config.baseUrl, '/v1', '/videos/generate'),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body,
    }
  }

  parseGenerateResponse(result: any): VideoGenResponse {
    // #1254 handoff: sync window of 600s exhausted while the job is still running →
    // 202 { error: { code: "video_job_pending", job_id } }. The job keeps running shielded
    // server-side; switch to polling.
    const pendingJobId = result?.error?.job_id
      ?? (result?.error?.code === 'video_job_pending' ? result?.error?.job_id : null)
    if (pendingJobId) {
      return { isAsync: true, taskId: String(pendingJobId) }
    }
    const item = result?.data?.[0]
    if (!item) throw new Error('fusion-mlx video response missing data[0]')
    const videoUrl = item.url || (item.b64_json ? `data:video/mp4;base64,${item.b64_json}` : null)
    if (!videoUrl) throw new Error('fusion-mlx video response has no url/b64_json')
    // Synchronous completion: return the data URI directly (downloadFile supports writing
    // data URIs to disk)
    return { isAsync: false, videoUrl }
  }

  buildPollRequest(config: AIConfig, taskId: string): ProviderRequest {
    // Job polling after the #1254 handoff: GET /v1/videos/jobs/{job_id}
    // (queued/running → processing; completed → host fetches the artifact via buildJobOutputRequest)
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', `/videos/jobs/${taskId}`),
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
      body: null,
    }
  }

  /** Artifact request after a handed-off job completes: GET /v1/videos/jobs/{job_id}/output/0
   *  (FileResponse streams the mp4 back, Bearer auth required). When generation.ts receives
   *  the videoUrl='job-output' placeholder it uses this method to start the download. */
  buildJobOutputRequest(config: AIConfig, taskId: string, index = 0): ProviderRequest {
    return {
      url: joinProviderUrl(config.baseUrl, '/v1', `/videos/jobs/${taskId}/output/${index}`),
      method: 'GET',
      headers: { 'Authorization': `Bearer ${config.apiKey}` },
      body: null,
    }
  }

  parsePollResponse(result: any): VideoPollResponse {
    if (result?.error?.code === 'video_job_pending') {
      return { status: 'processing' }
    }
    // Already terminal but answered with 404 (lost to prune/restart): unrecoverable, fail terminally
    if (result?.detail && String(result.detail).includes('not found')) {
      return { status: 'failed', error: `fusion-mlx video job lost: ${result.detail}` }
    }
    switch (result?.status) {
      case 'completed':
        // The artifact itself is not in the status response (it lives at /output/{index});
        // use a placeholder so the host downloads via buildJobOutputRequest. output_files
        // count can be >1 (multiple outputs are rare, take the first)
        return { status: 'completed', videoUrl: 'job-output' }
      case 'failed':
      case 'cancelled':
        return { status: 'failed', error: result?.error || `Video job ${result?.status}` }
      default:
        return { status: 'processing' }
    }
  }

  extractVideoUrl(result: any): string | null {
    const item = result?.data?.[0]
    if (!item) return null
    return item.url || (item.b64_json ? `data:video/mp4;base64,${item.b64_json}` : null)
  }
}
