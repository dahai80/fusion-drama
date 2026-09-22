/**
 * fusion-mlx 本地视频生成 Adapter
 * 端点: /v1/videos/generate（同步阻塞，返回 base64 data URI）
 * 模型: dgrauet--ltx-2.5-mlx-q8 等 fusion-mlx 加载的本地视频模型
 *
 * 协议特点：无任务轮询，单次请求直接返回 { data: [{ b64_json | url }] }。
 * 同步响应通过 parseGenerateResponse 返回 isAsync=false + data URI，
 * 由 generation.ts 走 handleVideoComplete 下载落盘（downloadFile 支持 data URI）。
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

/** LTX-2.5 管线含 temporal upsampler x2：请求 num_frames=1+8k（latent 周期 T=k+1），
 *  VAE 解码最终输出 = 16T-7 帧。直接把目标时长换算成帧会得到双倍时长
 *  （如请求 128 帧实际输出 249 帧 ≈10.4s），故按目标时长反推 latent 周期数。
 *
 *  sigma 修复（fusion-mlx scheduler.py 已合入 linear_quadratic_schedule）后，
 *  T=6-9 噪声 bug 根除——Stage2 sigma 起始 1.0 full-noise 而非 0.909 继承。
 *  所有 T 均可用，不再需要 BAD_PERIODS 规避。
 *
 *  VAE OOM 保护（issue #945）：fusion VAE 全量解码不分块，内存 ∝ 帧数×像素。
 *  实测 1920×1088×121帧(5s) OK，×233帧(9.7s) hard pressure abort。
 *  高分辨率（短边≥1000）限 maxSeconds=5；超长需等上游 VAE tiling。 */
function numFramesForDuration(duration?: number | null, maxSeconds = 15): number {
  const fps = 24
  const seconds = Math.min(maxSeconds, Math.max(2, Math.round(Number(duration || 5))))
  const targetFrames = seconds * fps
  const periods = Math.max(1, Math.round((targetFrames + 7) / 16))
  return 1 + 8 * (periods - 1)
}

/** LTX-Video legacy 2B（Lightricks/LTX-Video）无 temporal upsampler：输出帧数
 *  = num_frames（约束 num_frames%8==1）。按目标时长直算到最近 8k+1。
 *  VAE 不分块解码，帧数×像素 OOM 风险。maxSeconds=1（25帧）：49帧(2s)实测在
 *  1344×768 下 denoise step 29/40 触发 fusion memory enforcer fatal_exit
 *  （active 16.45GB + Metal cache 超 102GB ceiling 被杀）；25帧(1s)实测安全
 *  （768×1344×25 帧 diff 21.46，VAE AdaLayerNorm 修复后黑帧根除 #947）。
 *  超 1s 需等上游 VAE tiling（issue #945）。 */
function numFramesForDurationLegacy(duration?: number | null, maxSeconds = 1): number {
  const fps = 24
  const seconds = Math.min(maxSeconds, Math.max(1, Math.round(Number(duration || 1))))
  const target = seconds * fps
  const k = Math.max(1, Math.round((target - 1) / 8))
  return 8 * k + 1
}

/** 尺寸按 64 对齐（最近取整）：Stage1 = 目标尺寸/2 须为 32 的倍数。
 *  sigma 修复后不再需要 floor 保守，round 到最近 64 倍数更贴近目标比例。 */
function alignDim(value: number, fallback: number): number {
  const v = Math.round(Number(value) || fallback)
  const clamped = Math.min(1920, Math.max(576, v))
  return Math.round(clamped / 64) * 64
}

/** LTX-2.5 两阶段 distilled：Stage1 半分辨率生成 → latent 2x 上采样 → Stage2 精化。
 *  短边基准 1088（官方 distilled 口径 1920x1088，Stage1=544）。
 *  sigma 修复前短边>704 崩噪声（Stage2 sigma 起始 0.909 非 1.0）；
 *  修复后 1920x1088 实测帧差异 avg 10.94（真实内容），高分辨率可用。 */
const SHORT_EDGE_BASE_LTX25 = 1088

/** LTX-Video legacy 2B：单阶段 2B 模型，无 distilled 半分辨率。短边 768
 *  （768×1344 实测 145s/25帧，luma 57 帧diff 21）。1088 短边 ASGI 超时（>67s/9帧）。 */
const SHORT_EDGE_BASE_LEGACY = 768

/** 判定是否为 LTX-Video legacy 2B（Lightricks/LTX-Video，非 ltx-2.5）。 */
function isLegacyLtx(model: string): boolean {
  const m = model.toLowerCase()
  return (m.includes('ltx-video') || m.includes('ltx_video') || m.includes('ltxv-2b'))
    && !m.includes('ltx-2.5') && !m.includes('ltx2.5') && !m.includes('ltx2_5')
}

export class FusionVideoAdapter implements VideoProviderAdapter {
  provider = 'fusion'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model
    if (!model) throw new Error('未指定视频模型')

    const prompt = (record.prompt || '').trim()
    if (!prompt) throw new Error('视频生成需要 prompt')

    // 参考图：本地模型仅支持单张首帧（ltx 后端不支持 i2v 时由服务端 422 提示）
    const firstFrame = record.firstFrameUrl || record.imageUrl || null

    const legacy = isLegacyLtx(model)
    const shortEdgeBase = legacy ? SHORT_EDGE_BASE_LEGACY : SHORT_EDGE_BASE_LTX25

    // 尺寸必须显式指定：不传时 fusion 默认 768x512，Stage1 仅 384x256 发糊。
    // 短边锁 base（LTX-2.5=1088 distilled 口径 / legacy 2B=768）；长边按宽高比推算 64 对齐
    const ar = record.aspectRatio
    const [aw, ah] = ar ? String(ar).split(':').map(Number) : [16, 9]
    let shortEdge = shortEdgeBase
    const body: any = {
      model,
      prompt,
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

    // VAE OOM 保护：legacy 2B 限 1s（49帧 denoise 触发 memory enforcer fatal_exit）；
    // LTX-2.5 高分辨率（短边≥1000）限 5s，超长日志告警（上游 issue #945）
    const maxSeconds = legacy ? 1 : (shortEdge >= 1000 ? 5 : 15)
    const requested = Number(record.duration) || (legacy ? 1 : 5)
    if (requested > maxSeconds) {
      console.warn(
        `[fusion-video] ${legacy ? 'legacy 2B' : '高分辨率'}(短边${shortEdge})时长${requested}s` +
        ` 超 VAE 安全上限${maxSeconds}s，截断` +
        `（fusion VAE 不分块解码，长视频 OOM；上游 issue #945 待修后解除）`,
      )
    }
    body.num_frames = legacy
      ? numFramesForDurationLegacy(record.duration, maxSeconds)
      : numFramesForDuration(record.duration, maxSeconds)

    if (record.seed != null && Number.isFinite(Number(record.seed))) {
      body.seed = Number(record.seed)
    }
    if (firstFrame) body.image = firstFrame

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
    const item = result?.data?.[0]
    if (!item) throw new Error('fusion-mlx 视频响应缺少 data[0]')
    const videoUrl = item.url || (item.b64_json ? `data:video/mp4;base64,${item.b64_json}` : null)
    if (!videoUrl) throw new Error('fusion-mlx 视频响应无 url/b64_json')
    // 同步完成：直接返回 data URI（downloadFile 支持 data URI 落盘）
    return { isAsync: false, videoUrl }
  }

  buildPollRequest(_config: AIConfig, _taskId: string): ProviderRequest {
    // 同步接口，不应走到轮询；保留空实现满足接口
    throw new Error('fusion-mlx 视频为同步接口，无轮询')
  }

  parsePollResponse(_result: any): VideoPollResponse {
    return { status: 'failed', error: 'fusion-mlx 视频为同步接口，无轮询' }
  }

  extractVideoUrl(result: any): string | null {
    const item = result?.data?.[0]
    if (!item) return null
    return item.url || (item.b64_json ? `data:video/mp4;base64,${item.b64_json}` : null)
  }
}
