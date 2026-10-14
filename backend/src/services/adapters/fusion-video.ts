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
 *  VAE OOM 保护（issue #945）：上游已落地 temporal-only tiling（tiling="auto"，
 *  >65 帧自动分块解码），非 legacy 管线时长上限放宽到 15s。 */
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
 *  短边基准 768（1344x768 实测 159.9s/121帧/5.04s，峰值 64.76GB 安全）。
 *  1088 短边（1920x1088）VAE decode 12min+ 且 OOM（114GB > 112GB 水位）——
 *  128GB 机器不可行，收口 768。质量经实证可接受（帧 diff avg 正常区间）。 */
const SHORT_EDGE_BASE_LTX25 = 768

/** LTX-Video legacy 2B：单阶段 2B 模型，无 distilled 半分辨率。短边 768
 *  （768×1344 实测 145s/25帧，luma 57 帧diff 21）。1088 短边 ASGI 超时（>67s/9帧）。 */
const SHORT_EDGE_BASE_LEGACY = 768

/** MiniMax-H3：33B Omni-Transformer。短边 576（16:9 → 1024x576）。
 *  实测：768 短边（1344x768）token 数 6552+，10 步即 OOM（MLX cache 累积超 120GB）；
 *  576 短边（1024x576）spatial tokens=2304（同 768x768），10 步 107s 完成 1.17s 输出。
 *  dim_divisibility=16，576/16=36 满足约束。 */
const SHORT_EDGE_BASE_H3 = 576

/** Wan2.2-TI2V-5B：短边 544（16:9 → 960×544）。原生 720P（1280×704）在
 *  MLX 侧 seq=18480 超过 FUSION_WAN2_Q8_FP32_SEQ(16384) 阈值，q8 注意力走
 *  fp32 慢路径：~95s/步、40 步 ~60min/3.4s 片段且触发 memory enforcer 硬压力
 *  （fusion-mlx #1208）。544 短边 seq=10710 走 bf16 快路径：实测 525s 完成
 *  81 帧 3.375s 输出。上游修复 #1208 后可回升 704。 */
const SHORT_EDGE_BASE_WAN5B = 544

/** 判定是否为 LTX-Video legacy 2B（Lightricks/LTX-Video，非 ltx-2.5）。 */
function isLegacyLtx(model: string): boolean {
  const m = model.toLowerCase()
  return (m.includes('ltx-video') || m.includes('ltx_video') || m.includes('ltxv-2b'))
    && !m.includes('ltx-2.5') && !m.includes('ltx2.5') && !m.includes('ltx2_5')
}

/** 判定是否为 MiniMax-H3（33B Omni-Transformer，fl2va/i2va/l2va）。
 *  H3 路由独立于 LTX：需 quantize=dit8_te4（61GB）否则 144GB OOM（128GB 机器）；
 *  无 8k+1 帧约束（1..361）；joint audio 与 fl2va image 互斥 → 走 TTS dub。 */
export function isMiniMaxH3(model: string): boolean {
  const m = model.toLowerCase()
  return m.includes('minimax') || m.includes('h3-fl2va') || m.includes('h3-ref2va')
    || m.includes('minimax-h3') || m.includes('minimax_h3')
}

/** 判定是否为 Wan2.2-TI2V-5B（阿里 5B compact DiT + Wan2.2-VAE 16×16×4 高压缩）。
 *  T2V/I2V 统一单模型（A14B 是 T2V/I2V 两个独立模型，不含 ti2v 不误伤）。
 *  UMT5 文本编码器原生识中文（generation.ts 据此跳过翻译）；
 *  帧约束 (nf-1)%4==0（fusion-mlx wan2 constraints）；无联合音频。 */
export function isWan22Ti2v5b(model: string): boolean {
  const m = model.toLowerCase()
  return m.includes('ti2v') && m.includes('5b')
}

/** MiniMax-H3 帧数换算：无 8k+1 约束（H3 接受 1..361 帧），直接 duration*fps。
 *  上限 5s（120帧）：8 步实测 2s/3s/4s/5s 全通过，6s(144f) MLX cache 累积
 *  超 120GB ceiling 被 memory guard 取消。5s=773s 耗时，峰值 ~56GB 安全。 */
function numFramesForDurationH3(duration?: number | null, maxSeconds = 5): number {
  const fps = 24
  const seconds = Math.min(maxSeconds, Math.max(1, Math.round(Number(duration || 5))))
  return Math.max(25, seconds * fps)
}

/** Wan2.2-TI2V-5B 帧数换算：约束 (nf-1)%4==0（Wan2.2-VAE 时间 stride 4），
 *  4k+1 直算（81=3.4s / 121=5s / 241=10s）。 */
function numFramesForDurationWan(duration?: number | null, maxSeconds = 10): number {
  const fps = 24
  const seconds = Math.min(maxSeconds, Math.max(2, Math.round(Number(duration || 5))))
  const target = seconds * fps
  return Math.max(9, Math.round((target - 1) / 4) * 4 + 1)
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

/** 从 prompt 的 @图片N 引用中选出 I2V 条件图。
 *  prompt 里 @图片1/@图片2… 的编号与 referenceImageUrls 数组下标一一对应
 *  （1-based；前端 getShotReferenceIndexMap 保证此映射）。多角色镜头取
 *  「提及次数最多」的角色图作 I2V 条件——单参考图 I2V 下应跟随镜头主体
 *  （bug：盲取末张把镜头 1 钉在菩提四视图上，主角悟空缺席）。
 *  无任何 @图片N 引用时回退末张（老数据兼容）。 */
function pickReferenceUrl(prompt: string, raw?: string | null): string | null {
  if (!raw) return null
  let arr: string[] = []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) arr = parsed.map(u => String(u || '').trim())
  } catch { /* 非法 JSON 视为无参考图 */ }
  if (!arr.length) return null

  const counts = new Map<number, number>()
  for (const m of prompt.matchAll(/@图片(\d+)/g)) {
    const idx = Number(m[1])
    if (idx >= 1 && idx <= arr.length) {
      counts.set(idx, (counts.get(idx) ?? 0) + 1)
    }
  }
  if (!counts.size) {
    // 无引用标注：回退末张（旧约定场景图在前、角色图在后）
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i]) return arr[i]
    }
    return null
  }
  // 提及次数最多者优先；并列时取编号靠后（角色图通常排在场景图之后）
  let best = 0
  let bestCount = -1
  for (const [idx, n] of counts) {
    if (n > bestCount || (n === bestCount && idx > best)) {
      best = idx
      bestCount = n
    }
  }
  console.log(`[fusion-video] I2V 选图: @图片计数=${JSON.stringify([...counts.entries()])} → 选中图片${best} = ${arr[best - 1]}`)
  return arr[best - 1] || null
}

/** 剥离 prompt 中的台词引语（「…」/『…』/ "…"）。
 *  台词由 TTS 配音（video-dub）单独合成进音轨；留在视频 prompt 里会被
 *  LTX 当作字幕渲染成画面内嵌乱码文字（实测 "Diciple speek only truth..."）。
 *  只删引语本体，保留动作描述（如「祖师说：」两侧的镜头指令）。 */
function stripDialogue(prompt: string): string {
  return prompt
    .replace(/[「『][^」』]*[」』]/g, '')
    .replace(/"[^"]{2,}"/g, '')
    .replace(/[，,、]\s*(?=[，,、\n]|$)/g, '') // 清理删除后残留的连续标点
    .replace(/[ \t]+$/gm, '')
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
      || pickReferenceUrl(prompt, record.referenceImageUrls)
      || firstReferenceUrl(record.referenceImageUrls)

    const legacy = isLegacyLtx(model)
    const h3 = isMiniMaxH3(model)
    const wan5b = isWan22Ti2v5b(model)
    // H3 短边 768（resolution "768p" 口径）；legacy 2B 768；LTX-2.5 768；Wan 5B 704。
    const shortEdgeBase = legacy
      ? SHORT_EDGE_BASE_LEGACY
      : (h3 ? SHORT_EDGE_BASE_H3 : (wan5b ? SHORT_EDGE_BASE_WAN5B : SHORT_EDGE_BASE_LTX25))

    // 尺寸必须显式指定：不传时 fusion 默认 768x512，Stage1 仅 384x256 发糊。
    // 短边锁 base（LTX-2.5=768 / legacy 2B=768 / H3=768）；长边按宽高比推算 64 对齐
    // （64 是 16 的倍数，满足 H3 dim_divisibility=16 与 LTX 32 约束）。
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

    // VAE OOM / 时长保护：
    // legacy 2B 限 2s（#951 修复后 49帧可跑）。
    // LTX-2.5 上限 10s（241帧峰值 ~110GB 贴 128GB 水位）。
    // H3 上限 5s（120帧）：8 步实测 2s/3s/4s/5s 全通过（峰值 ~56GB），
    // 6s(144f) MLX cache 累积超 120GB ceiling 被 memory guard 取消。
    // Wan2.2-TI2V-5B 上限 10s（241帧；16×16×4 高压缩 VAE latent 极小，
    // 5B 去噪 + 分块解码内存远低于 LTX-2.5，待实测确认后可放宽）。
    const maxSeconds = legacy ? 2 : (h3 ? 5 : 10)
    const requested = Number(record.duration) || (legacy ? 2 : 5)
    if (requested > maxSeconds) {
      console.warn(
        `[fusion-video] ${legacy ? 'legacy 2B' : h3 ? 'H3' : wan5b ? 'Wan5B' : ''}(短边${shortEdge})` +
        `时长${requested}s 超安全上限${maxSeconds}s，截断为 ${maxSeconds}s。` +
        `分镜拆解侧应控制单镜 ≤${maxSeconds}s`,
      )
    }
    body.num_frames = h3
      ? numFramesForDurationH3(record.duration, maxSeconds)
      : wan5b
        ? numFramesForDurationWan(record.duration, maxSeconds)
        : legacy
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
    // H3 / Wan5B 无 dev/distilled pipeline 概念，跳过。
    if (!legacy && !h3 && !wan5b && record.videoPipeline === 'dev') {
      body.pipeline = 'dev'
      body.num_inference_steps = 20
      body.cfg_scale = 4.0
    }

    // MiniMax-H3 33B：必须 quantize=dit8_te4（DiT 8-bit + TE 4-bit ≈61GB），
    // 否则 bf16 全量 144GB > 128GB 机器 → OOM crash（10/10 任务失败根因）。
    // steps=8（默认 40；20 步实测在 step 16 处 MLX cache 累积超 120GB ceiling
    // 被 memory guard 取消；10 步可跑 1s；8 步实测可跑 5s，峰值 ~56GB 安全）。
    // 不传 audio（fl2va image 与 joint audio 互斥 generate.py:843；
    // 台词配音走 TTS dub 独立管线）。
    if (h3) {
      body.quantize = 'dit8_te4'
      body.num_inference_steps = 8
    }

    // 音频（LTX-2.5 联合 A/V，distilled/dev 均支持）：generateAudio 缺省开
    // （createTask 侧 false 才存 0）；legacy 2B / H3 / Wan5B 无联合音频支路，不传。
    // H3 joint audio(t2va-av) 与 fl2va image 互斥（generate.py:843），且
    // t2va-av 管线 UNVERIFIED（generate.py:160）→ H3 永远不传 audio，
    // 台词配音统一走 TTS dub（video-dub）独立管线。
    // LTX-2.5 有首帧时亦关闭（fl2va image 与 joint audio 互斥，上游硬校验）。
    if (!legacy && !h3 && !wan5b && record.generateAudio) {
      if (firstFrame) {
        console.warn(
          `[fusion-video] 首帧 I2V 与联合音频互斥（上游硬校验），自动关闭 audio。` +
          `台词配音仍由 TTS 管线生成`,
        )
      } else {
        body.audio = true
      }
    }

    if (record.seed != null && Number.isFinite(Number(record.seed))) {
      body.seed = Number(record.seed)
    }
    if (firstFrame) body.image = firstFrame
    // H3 fl2va：last_frame_image 作末帧条件（l2va）；与首帧 image 联合即 fl2va。
    // 仅 H3 支持末帧锚定（LTX-2.5 / legacy 后端不接受 last_frame_image）。
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
