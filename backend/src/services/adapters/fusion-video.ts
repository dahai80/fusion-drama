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

/** LTX-2.5 帧数换算。fusion-mlx #978 起 temporal upsampler 已从 distilled 管线移除：
 *  输出帧数 = num_frames（不再有 16T-7 双倍放大），直接按目标时长请求 8k+1 帧。
 *  （旧管线按 16T-7 反推 latent 周期的逻辑随 upsampler 一并作废。）
 *
 *  VAE OOM 保护（issue #945）：fusion VAE 全量解码不分块，内存 ∝ 帧数×像素。
 *  高分辨率（短边≥1000）上限仍按 maxSeconds 钳制（由调用方传入）。 */
function numFramesForDuration(duration?: number | null, maxSeconds = 15): number {
  const fps = 24
  const seconds = Math.min(maxSeconds, Math.max(2, Math.round(Number(duration || 5))))
  const target = seconds * fps
  // num_frames 约束 %8==1：取最近 8k+1
  return Math.max(9, Math.round((target - 1) / 8) * 8 + 1)
}

/** LTX-Video legacy 2B（Lightricks/LTX-Video）无 temporal upsampler：输出帧数
 *  = num_frames（约束 num_frames%8==1）。按目标时长直算到最近 8k+1。
 *  VAE 不分块解码，帧数×像素 OOM 风险。maxSeconds=2（49帧）：#951 修复后
 *  （cf765fa6 signal_video_abort 1s trip wire）49帧 1344×768 denoise 40 步 +
 *  VAE decode 全程跑完 server 存活（~441s）。25帧(1s) 亦安全。
 *  LTX-2.5 5s 高分辨率产出 LOW_MOTION（后半段冻结），legacy 2B 2s 质量更优。
 *  超 2s 需等上游 VAE tiling（issue #945）。 */
function numFramesForDurationLegacy(duration?: number | null, maxSeconds = 2): number {
  const fps = 24
  const seconds = Math.min(maxSeconds, Math.max(1, Math.round(Number(duration || 2))))
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

/** referenceImageUrls 是 JSON 数组字符串（见 types.ts）；取首张有效 URL。 */
function firstReferenceUrl(raw?: string | null): string | null {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) {
      for (const u of arr) {
        const s = String(u || '').trim()
        if (s) return s
      }
    }
  } catch { /* 非法 JSON 视为无参考图 */ }
  return null
}

/** 取末张有效 URL：视频参考图列表约定场景图在前、角色图在后，
 *  I2V 条件应优先角色形象（bug3：取首张钉在场景图导致人物幻觉）。 */
function lastReferenceUrl(raw?: string | null): string | null {
  if (!raw) return null
  try {
    const arr = JSON.parse(raw)
    if (Array.isArray(arr)) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const s = String(arr[i] || '').trim()
        if (s) return s
      }
    }
  } catch { /* 非法 JSON 视为无参考图 */ }
  return null
}

export class FusionVideoAdapter implements VideoProviderAdapter {
  provider = 'fusion'

  buildGenerateRequest(config: AIConfig, record: VideoGenerationRecord): ProviderRequest {
    const model = record.model || config.model
    if (!model) throw new Error('未指定视频模型')

    const prompt = (record.prompt || '').trim()
    if (!prompt) throw new Error('视频生成需要 prompt')

    // 参考图：本地模型仅支持单张首帧（ltx 后端不支持 i2v 时由服务端 422 提示）。
    // #968 缺陷3：referenceImageUrls（参考图模式）此前被忽略——取首张作 I2V 条件。
    // bug3 修复：referenceImageUrls 的拼装顺序是场景图在前、角色图在后，
    // 取首张会把 I2V 条件钉在场景图上，角色形象完全缺席 → 模型幻觉出无关人物。
    // 这里改为在列表中优先挑选角色图（按 storyboard_characters 绑定名匹配不了，
    // 由调用方保证顺序——适配器侧做保底：取 reference 列表的最后一张（角色图约定排后），
    // 显式 firstFrameUrl/imageUrl 仍最高优先。
    const firstFrame = record.firstFrameUrl
      || record.imageUrl
      || lastReferenceUrl(record.referenceImageUrls)
      || firstReferenceUrl(record.referenceImageUrls)

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

    // VAE OOM 保护：legacy 2B 限 2s（#951 修复后 49帧可跑）；LTX-2.5 高分辨率（短边≥1000）
    // 限 5s，超长日志告警（上游 issue #945）
    const maxSeconds = legacy ? 2 : (shortEdge >= 1000 ? 5 : 15)
    const requested = Number(record.duration) || (legacy ? 2 : 5)
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

    // LTX-Video legacy 2B 是 rectified-flow 蒸馏模型，官方推荐 cfg_scale=1.0
    // （fusion 默认 3.0 过高 → CFG 噪声放大 → 全局亮度逐帧振荡闪烁）。
    // steps=30 足够（默认 40 多跑无质量增益、增 OOM 风险）。
    // LTX-2.5 distilled 管线自带 cfg，不覆盖。
    if (legacy) {
      body.cfg_scale = 1.0
      body.num_inference_steps = 30
    }

    // 画质档（可选 dev）：22B bf16 单阶段全分辨率（20 步 CFG=4，质量最佳，
    // 实测 ~1600s/41f）；缺省走 distilled（8/3 步，~80s）。
    // #995 后 dev 同样支持联合 A/V，audio 由下方 generateAudio 映射统一处理。
    if (!legacy && record.videoPipeline === 'dev') {
      body.pipeline = 'dev'
      body.num_inference_steps = 20
      body.cfg_scale = 4.0
    }

    // 音频（LTX-2.5 联合 A/V，distilled/dev 均支持）：generateAudio 缺省开
    // （createTask 侧 false 才存 0）；legacy 2B 无音频支路，不传。
    if (!legacy && record.generateAudio) {
      body.audio = true
    }

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
