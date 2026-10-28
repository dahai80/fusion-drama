/**
 * 视频对白配音（TTS）— 修复 LTX-2.5 联合 A/V 只产出环境底噪、无清晰对白的问题
 *
 * 流程：从分镜 video_prompt 提取「角色名：台词」对白 → 逐条调用 fusion-mlx
 * /v1/audio/speech（Kokoro / Qwen3-TTS）合成 → 按顺序拼成一条音轨 → 与原视频混流
 * （原音轨降噪保留环境声，TTS 音轨置前）。
 *
 * 任一步骤失败均返回原视频路径，不阻断任务主流程。
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { eq } from 'drizzle-orm'
import { getAbsolutePath } from './storage.js'
import { ffmpeg, checkFfmpegSuite } from './ffmpeg.js'
import { logTaskProgress, logTaskWarn } from './task-logger.js'
import { db, schema } from '../db/index.js'

/** 从 AI 服务配置读取 TTS 上游（base_url + api_key），缺失时返回 null */
async function getTtsEndpoint(): Promise<{ baseUrl: string; apiKey: string } | null> {
  try {
    const { getActiveConfig } = await import('../services/ai.js')
    // TTS 无独立服务类型，回退到文本服务配置（同源 fusion-mlx）。
    // 但文本配置可能指向 fusion-gateway（无 /v1/audio/speech 透传）——
    // gateway 地址的配置跳过，TTS 始终直连 fusion-mlx。
    const cfg = await getActiveConfig('text')
    if (cfg?.baseUrl && cfg?.apiKey && !/gateway|:11432/.test(cfg.baseUrl)) {
      return { baseUrl: cfg.baseUrl.replace(/\/+$/, ''), apiKey: cfg.apiKey }
    }
  } catch { /* 无配置时走默认 */ }
  return null
}

const TTS_MODEL = process.env.FUSION_TTS_MODEL || 'mlx-community--Kokoro-82M-bf16'
// 多说话人音色轮换池：按当前 TTS 模型族取表——不同角色分配不同声线，避免全片同声。
const isQwen3Tts = /qwen3.*tts/i.test(TTS_MODEL)
// Kokoro 内置多音色（E2E 验证 zm_yunjian/zm_yunyang/zm_yunxia 均可合成且互异）
const KOKORO_TTS_VOICES = (process.env.FUSION_TTS_VOICES || 'zm_yunjian,zm_yunyang,zm_yunxia')
  .split(',').map(s => s.trim()).filter(Boolean)
// Qwen3-TTS Base 无内置预设音色（E2E 实测 400："Base models have no built-in
// preset voices"），音色走 ICL 克隆。两级来源：
//   1. fusion-mlx 服务端音色包（#1383，v0.10.16+）：~/.fusion-mlx/voices/<name>/，
//      请求直接传 voice 名即可，免每请求 base64（E2E 实测 1.3s vs base64 更慢）
//   2. 本地兜底 workspace/voices/<name>.wav + 同名 .txt（ref 文本），逐请求随包上传
const VOICES_DIR = path.join(
  process.env.WORKSPACE_PATH
    ? path.resolve(process.env.WORKSPACE_PATH)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../workspace'),
  'voices',
)
/** 服务端音色包名集合（懒加载缓存；服务端不可达则空集走本地） */
let serverVoiceBundles: string[] | null = null
async function listServerVoiceBundles(baseUrl: string, apiKey: string): Promise<string[]> {
  if (serverVoiceBundles) return serverVoiceBundles
  let names: string[] = []
  try {
    const res = await fetch(`${baseUrl}/v1/audio/voices`, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: any = await res.json()
    names = (data?.voice_bundles || []).map((v: any) => v.name).filter(Boolean)
  } catch (err) {
    logTaskWarn('VideoTask', 'tts-server-voices-unavailable', { error: (err as Error).message })
  }
  serverVoiceBundles = names
  return names
}
/** 列出 workspace/voices 下可用的本地克隆音色名（.wav + 同名 .txt 齐全才算） */
function listLocalRefVoices(): string[] {
  try {
    return fs.readdirSync(VOICES_DIR)
      .filter(f => f.endsWith('.wav'))
      .map(f => f.slice(0, -4))
      .filter(name => fs.existsSync(path.join(VOICES_DIR, `${name}.txt`)))
  } catch { return [] }
}
/** 读一个本地克隆音色的 ref_audio(base64)+ref_text；缺失返回 null 并告警 */
function loadRefVoice(voice: string): { ref_audio: string; ref_text: string } | null {
  try {
    const wav = fs.readFileSync(path.join(VOICES_DIR, `${voice}.wav`))
    const refText = fs.readFileSync(path.join(VOICES_DIR, `${voice}.txt`), 'utf8').trim()
    if (!refText) return null
    return { ref_audio: wav.toString('base64'), ref_text: refText }
  } catch (err) {
    logTaskWarn('VideoTask', 'tts-ref-voice-load-failed', { voice, error: (err as Error).message })
    return null
  }
}
/** 当前 TTS 模型的音色池（本地同步视图）；不认识 voice 参数的模型返回 []（不传 voice） */
function ttsVoicePool(): string[] {
  if (isQwen3Tts) return listLocalRefVoices()
  if (/kokoro/i.test(TTS_MODEL)) return KOKORO_TTS_VOICES
  return []
}
/**
 * 说话人 → 音色：characters.voice（显式指定，跨镜头/跨集稳定）优先，
 * 否则按角色名 hash 轮换音色池——hash 保证同一角色在不同分镜/不同集
 * 拿到同一音色（替代旧的「按台词首现顺序」per-shot 分配，那会导致
 * 同角色跨镜头换声线）。pool 可由调用方注入（qwen3 时并入服务端音色包）。
 */
export function voiceForSpeaker(speaker: string, characterVoices: Map<string, string>, poolOverride?: string[]): string {
  const explicit = characterVoices.get(speaker)
  if (explicit) return explicit
  const pool = poolOverride ?? ttsVoicePool()
  if (!pool.length) return ''
  let h = 0
  for (let i = 0; i < speaker.length; i++) h = ((h << 5) - h + speaker.charCodeAt(i)) | 0
  return pool[Math.abs(h) % pool.length]
}
// FUSION_TTS_VOICE 显式指定时全片单音色（覆盖轮换，兼容旧行为）
const TTS_VOICE = process.env.FUSION_TTS_VOICE || ''

export interface DialogueLine {
  speaker: string
  text: string
}

/**
 * 从分镜提示词提取对白（说话人 + 台词）。
 * 锚点为「说：「台词」」——LLM 常生成 `@孙悟空跪在祖师面前，连连叩头，说：「台词」`，
 * 名字与「说」之间夹动作描述，故不要求名字紧跟「说」。说话人解析顺序：
 *   1. 若传入 knownSpeakers（分镜绑定角色名），向前找最近的 @已知角色名
 *      （按名长降序匹配，避免「悟空」截断「孙悟空」）——同角色多句台词即使
 *      夹不同动作描述也能稳定映射到同一 speaker → 同一音色（bug2）。
 *   2. 回退：旧格式 `@?角色名说`（名字紧跟「说」，无动作夹中间）。
 *   3. 最终回退 speaker=「角色」。
 * 单句上限 60 字；返回按出现顺序的去重台词列表（最多 3 条）。
 */
export function extractDialogue(
  videoPrompt: string | null | undefined,
  knownSpeakers: string[] = [],
): DialogueLine[] {
  if (!videoPrompt) return []
  const out: DialogueLine[] = []
  const seen = new Set<string>()
  const speakers = [...knownSpeakers].filter(Boolean).sort((a, b) => b.length - a.length)
  // 锚点：说[：:]「台词」/ 说："台词" / 说：'台词'（台词 2-60 字）
  const lineRe = /说[：:]\s*[「"']([^」"']{2,60})[」"']/g
  let m: RegExpExecArray | null
  while ((m = lineRe.exec(videoPrompt)) !== null) {
    const text = m[1].trim()
    if (!text || seen.has(text)) continue
    // 只在「说」所在的当前行内查找 @角色名——跨行 lastIndexOf 会把前一行出现的
    // @角色名误配给当前台词（@须菩提祖师 出现在前一行中景描述，当前行实为 @孙悟空说）。
    const lineStart = videoPrompt.lastIndexOf('\n', m.index) + 1
    const lineSeg = videoPrompt.slice(lineStart, m.index)
    let speaker = ''
    if (speakers.length) {
      // 按名长降序匹配（避免「悟空」截断「孙悟空」）；lastIndexOf 取该行最近一个
      for (const sp of speakers) {
        if (lineSeg.lastIndexOf('@' + sp) >= 0) { speaker = sp; break }
      }
    }
    if (!speaker) {
      // 回退：旧格式 @?角色名 紧跟「说」（无动作描述夹在中间）
      const direct = lineSeg.match(/(@?[一-鿿\w·]{1,12})\s*$/)
      if (direct) speaker = direct[1].replace(/^@/, '').trim()
    }
    if (!speaker) speaker = '角色'
    seen.add(text)
    out.push({ speaker, text })
    if (out.length >= 3) break
  }

  // Pattern 2: 角色名：（动作）台词 — 无「说」+「」包裹，直接 LLM 分镜拆解常见格式
  // 匹配「悟空：（皱眉）我等在此...」，不匹配「3 秒画面：黄昏...」（无括号）
  if (out.length < 3) {
    const lineRe2 = /([一-鿿·]{1,12})[：:]\s*[（(]([^）)]*)[）)]\s*([^\n]{2,80})/g
    while ((m = lineRe2.exec(videoPrompt)) !== null) {
      const speaker = m[1].trim()
      const text = m[3].trim()
      if (!text || seen.has(text)) continue
      if (/秒.*画面|旁白|时间|地点/.test(speaker)) continue
      // 已知角色名精确匹配优先（避免「悟空」截断「孙悟空」）
      let matchedSpeaker = speaker
      if (speakers.length) {
        for (const sp of speakers) {
          if (sp.endsWith(speaker) || speaker.endsWith(sp)) { matchedSpeaker = sp; break }
        }
      }
      seen.add(text)
      out.push({ speaker: matchedSpeaker, text })
      if (out.length >= 3) break
    }
  }

  return out
}

/** 查分镜绑定的角色（名 + 固定音色），用于精确匹配 @角色名 与跨镜头音色一致。 */
async function getStoryboardSpeakers(storyboardId?: number): Promise<{ names: string[]; voices: Map<string, string> }> {
  if (!storyboardId) return { names: [], voices: new Map() }
  try {
    const rows = await db
      .select({ name: schema.characters.name, voice: schema.characters.voice })
      .from(schema.storyboardCharacters)
      .innerJoin(
        schema.characters,
        eq(schema.characters.id, schema.storyboardCharacters.characterId),
      )
      .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
    const names = rows.map(r => r.name).filter(Boolean)
    const voices = new Map<string, string>()
    for (const r of rows) {
      if (r.name && r.voice) voices.set(r.name, r.voice)
    }
    return { names, voices }
  } catch (err) {
    logTaskWarn('VideoTask', 'tts-speakers-query-failed', { storyboardId, error: (err as Error).message })
    return { names: [], voices: new Map() }
  }
}

/** ffprobe 探文件时长（秒），失败回 0 */
async function probeDuration(absPath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg(absPath).ffprobe((err, data) => {
      if (err || !data?.format?.duration) return resolve(0)
      resolve(Number(data.format.duration) || 0)
    })
  })
}

/** 调用 TTS 合成一句台词，返回 wav 临时文件路径 */
async function synthesizeLine(text: string, idx: number, voice: string, serverVoices?: Set<string>): Promise<string | null> {
  const ep = await getTtsEndpoint()
  // API key env 用规范名（config-conventions §1），legacy MLX key 别名已收敛
  const baseUrl = ep?.baseUrl || process.env.FUSION_MLX_BASE_URL || 'http://127.0.0.1:11434'
  const apiKey = ep?.apiKey || process.env.FUSION_CLIENT_KEY || ''
  const attempt = async (): Promise<string | null> => {
    // Qwen3-TTS Base：服务端音色包（#1383）命中 → 直接传 voice 名（免 base64）；
    // 否则按本地 workspace/voices 克隆（ref_audio+ref_text 随包上传）
    const isServerVoice = isQwen3Tts && voice && serverVoices?.has(voice)
    const refVoice = isQwen3Tts && voice && !isServerVoice ? loadRefVoice(voice) : null
    if (isQwen3Tts && voice && !isServerVoice && !refVoice) {
      logTaskWarn('VideoTask', 'tts-ref-voice-missing', { idx, voice, voicesDir: VOICES_DIR })
    }
    const res = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: text,
        // voice 由 voiceForSpeaker 按模型音色池产出：Kokoro 传内置音色名；
        // Qwen3-TTS Base 服务端音色包传 voice 名 / 本地克隆传 ref 参数；
        // 池空（不认识 voice 的模型）时不携带
        ...(refVoice ? { ref_audio: refVoice.ref_audio, ref_text: refVoice.ref_text }
          : voice && (!isQwen3Tts || isServerVoice) ? { voice } : {}),
        response_format: 'wav',
      }),
      signal: AbortSignal.timeout(280_000),
    })
    if (!res.ok) {
      logTaskWarn('VideoTask', 'tts-line-failed', { idx, status: res.status })
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fd-tts-')), `line-${idx}.wav`)
    fs.writeFileSync(tmp, buf)
    return tmp
  }
  try {
    // fusion-mlx 建议 retry once（首次请求可能因模型冷加载/内存驱逐而挂起）
    return await attempt() ?? await attempt()
  } catch (err) {
    logTaskWarn('VideoTask', 'tts-line-error', { idx, error: (err as Error).message })
    return null
  }
}

/**
 * 为视频配音：有对白则合成 TTS 并替换/混入原音轨。
 * 成功返回原 relativePath（就地覆盖处理后的文件），无对白或失败返回 null。
 */
export async function dubVideoDialogue(
  relativePath: string,
  videoPrompt: string | null | undefined,
  taskId?: number,
  storyboardId?: number,
): Promise<string | null> {
  // B26: TTS 临时目录统一收集，finally 清理（异常路径不泄漏 /tmp/fd-tts-*）
  const ttsDirs: string[] = []
  try {
    // 分镜绑定角色名用于精确解析 @角色名（LLM 常把动作描述夹在名字与「说」之间，
    // 无已知角色名则 extractDialogue 回退为紧邻「说」的词，同角色多句台词会因
    // 动作描述不同而映射到不同 speaker → 不同音色，破坏同角色音色一致性 bug2）。
    const { names: knownSpeakers, voices: characterVoices } = await getStoryboardSpeakers(storyboardId)
    const lines = extractDialogue(videoPrompt, knownSpeakers)
    if (!lines.length) return null

    const { ffmpeg: ffmpegOk } = await checkFfmpegSuite()
    if (!ffmpegOk) return null

    // 说话人 → 音色：characters.voice 显式指定优先，否则角色名 hash 轮换音色池。
    // hash 与分镜无关 → 同一角色跨镜头/跨集拿到同一音色（旧实现按台词首现顺序
    // per-shot 分配，同角色换镜头会换声线）。FUSION_TTS_VOICE 显式指定时全片单音色。
    // Qwen3-TTS：音色池 = 服务端音色包（#1383，优先，免 base64）+ 本地 workspace/voices 兜底。
    let poolOverride: string[] | undefined
    let serverSet: Set<string> | undefined
    if (isQwen3Tts && !TTS_VOICE) {
      const ep = await getTtsEndpoint()
      const baseUrl = ep?.baseUrl || process.env.FUSION_MLX_BASE_URL || 'http://127.0.0.1:11434'
      const apiKey = ep?.apiKey || process.env.FUSION_CLIENT_KEY || ''
      const serverBundles = await listServerVoiceBundles(baseUrl, apiKey)
      const serverBundleSet = new Set(serverBundles)
      const locals = listLocalRefVoices().filter(v => !serverBundleSet.has(v))
      serverSet = serverBundleSet
      poolOverride = [...serverBundles, ...locals]
      if (poolOverride.length) {
        logTaskProgress('VideoTask', 'tts-voice-pool', {
          taskId, server: serverBundles.length, local: locals.length,
        })
      }
    }
    const speakerVoices = new Map<string, string>()
    if (!TTS_VOICE) {
      for (const line of lines) {
        if (!speakerVoices.has(line.speaker)) {
          speakerVoices.set(line.speaker, voiceForSpeaker(line.speaker, characterVoices, poolOverride))
        }
      }
    }
    if (speakerVoices.size) {
      logTaskProgress('VideoTask', 'tts-voice-map', {
        taskId,
        storyboardId,
        voices: [...speakerVoices.entries()].map(([sp, v]) => `${sp}=${v}`).join(','),
      })
    }

    logTaskProgress('VideoTask', 'tts-dub-start', { taskId, storyboardId, lines: lines.length })

    // 逐句合成
    const wavs: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const voice = TTS_VOICE || speakerVoices.get(lines[i].speaker) || ''
      const wav = await synthesizeLine(lines[i].text, i, voice, serverSet)
      if (wav) {
        wavs.push(wav)
        ttsDirs.push(path.dirname(wav))
      }
    }
    if (!wavs.length) return null

    const srcAbs = getAbsolutePath(relativePath)
    const outAbs = srcAbs.replace(/\.mp4$/, '.dub.mp4')

    // 检测原视频是否有音轨：I2V 首帧模式 audio 降级关闭时视频无音轨，
    // ffmpeg [0:a] 会报 "matches no streams"。无音轨时只混入 TTS。
    const hasAudioTrack = await new Promise<boolean>((resolve) => {
      ffmpeg(srcAbs).ffprobe((err, data) => {
        if (err) return resolve(false)
        resolve((data.streams || []).some((s) => s.codec_type === 'audio'))
      })
    })

    // 时长感知分布：探视频时长 + 各句 TTS 时长，按剧情节奏均匀分布（非全压开头）。
    // 溢出处理：台词总时长 > 视频时长时，轻微超长加速（atempo ≤1.3），
    // 严重超长按顺序保留能装下的台词并截断其余（避免 -shortest 静默截断丢失后半台词）。
    const videoDuration = await probeDuration(srcAbs)
    const lineDurations = await Promise.all(wavs.map(w => probeDuration(w)))
    const totalSpeech = lineDurations.reduce((a, b) => a + b, 0)
    const FIT_TEMPO_MAX = 1.3
    let effectiveWavs = wavs
    let effectiveDurs = lineDurations
    let tempo = 1.0
    if (videoDuration > 0 && totalSpeech > videoDuration) {
      const ratio = totalSpeech / videoDuration
      if (ratio <= FIT_TEMPO_MAX) {
        tempo = Math.min(FIT_TEMPO_MAX, Number((ratio / 0.85).toFixed(3)))
        logTaskProgress('VideoTask', 'tts-dub-speedup', { taskId, storyboardId, totalSpeech, videoDuration, tempo })
      } else {
        const budget = videoDuration * 0.9
        let acc = 0
        const keepIdx: number[] = []
        for (let i = 0; i < wavs.length; i++) {
          const d = lineDurations[i] / FIT_TEMPO_MAX
          if (acc + d > budget) break
          keepIdx.push(i)
          acc += d
        }
        if (!keepIdx.length) {
          logTaskWarn('VideoTask', 'tts-dub-skip', { taskId, storyboardId, reason: 'dialogue exceeds video duration even after max speedup', totalSpeech, videoDuration })
          return null
        }
        tempo = FIT_TEMPO_MAX
        effectiveWavs = keepIdx.map(i => wavs[i])
        effectiveDurs = keepIdx.map(i => lineDurations[i])
        logTaskWarn('VideoTask', 'tts-dub-truncated', { taskId, storyboardId, kept: keepIdx.length, total: wavs.length, totalSpeech, videoDuration })
      }
    }

    // 时间线分布：gap = (videoDuration - effectiveSpeech) / (n+1)，均匀留间歇。
    // 无视频时长信息时回退 0.3s 句间静音（旧行为）。
    // atempo=tempo 压缩后每句时长 = 原时长 / tempo，effectiveSpeech = sum / tempo。
    const effectiveSpeech = effectiveDurs.reduce((a, b) => a + b, 0) / tempo
    const gap = videoDuration > 0 && effectiveSpeech < videoDuration
      ? (videoDuration - effectiveSpeech) / (effectiveWavs.length + 1)
      : 0.3

    // 滤镜图：每句 atempo + adelay 定位 → amix → 48kHz stereo 增益 + 限幅防削波
    await new Promise<void>((resolve, reject) => {
      const parts: string[] = []
      const labels: string[] = []
      let cumulative = 0
      for (let i = 0; i < effectiveWavs.length; i++) {
        const inputIdx = i + 1
        const label = `d${i}`
        const offsetMs = Math.round(((i + 1) * gap + cumulative / tempo) * 1000)
        const tempoFilter = tempo > 1.0 ? `atempo=${tempo.toFixed(3)},` : ''
        parts.push(`[${inputIdx}:a]${tempoFilter}adelay=${offsetMs}|${offsetMs}[${label}]`)
        labels.push(`[${label}]`)
        cumulative += effectiveDurs[i]
      }
      const filters = [...parts]
      const ttsMix = `${labels.join('')}amix=inputs=${labels.length}:normalize=0,volume=2.0,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,alimiter=limit=0.95`
      if (hasAudioTrack) {
        // 有原音轨：TTS 混成后与原音轨（压低作环境声）合成，duration=first 以原音轨为准。
        // 末尾 aformat 统一升 48kHz stereo（否则 amix 继承原音轨的 24kHz mono）。
        filters.push(`${ttsMix}[ttsv];[0:a]volume=0.12[env];[env][ttsv]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[aout]`)
      } else {
        // 无原音轨：TTS 填满视频时长（apad 补尾静音），避免 -shortest 截断视频
        const padDur = videoDuration > 0 ? videoDuration.toFixed(3) : '0'
        filters.push(`${ttsMix},apad=whole_dur=${padDur}[aout]`)
      }
      const cmd = ffmpeg(srcAbs)
      effectiveWavs.forEach((w) => cmd.input(w))
      cmd.complexFilter(filters)
        .outputOptions(['-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest'])
        .output(outAbs)
        .on('end', () => resolve())
        .on('error', reject)
      try { cmd.run() } catch (e) { reject(e) }
    })

    // B17: 先验证产物有效（存在/非空/可探测），再原子交换并回滚备份——
    // 坏产物（ffmpeg 半途产出空文件）不得覆盖原视频
    const outStat = fs.existsSync(outAbs) ? fs.statSync(outAbs) : null
    if (!outStat || outStat.size === 0) {
      logTaskWarn('VideoTask', 'tts-dub-output-invalid', { taskId, storyboardId, reason: 'missing-or-empty' })
      try { fs.rmSync(outAbs, { force: true }) } catch { /* ignore */ }
      return null
    }
    const outDur = await probeDuration(outAbs)
    if (!(outDur > 0)) {
      logTaskWarn('VideoTask', 'tts-dub-output-invalid', { taskId, storyboardId, reason: 'probe-zero-duration' })
      try { fs.rmSync(outAbs, { force: true }) } catch { /* ignore */ }
      return null
    }
    const bakAbs = `${srcAbs}.bak`
    fs.renameSync(srcAbs, bakAbs)
    try {
      fs.renameSync(outAbs, srcAbs)
    } catch (err) {
      fs.renameSync(bakAbs, srcAbs)
      throw err
    }
    fs.rmSync(bakAbs, { force: true })
    logTaskProgress('VideoTask', 'tts-dub-done', { taskId, storyboardId, lines: effectiveWavs.length, videoDuration, totalSpeech, tempo })
    return relativePath
  } catch (err) {
    logTaskWarn('VideoTask', 'tts-dub-failed', { taskId, storyboardId, error: (err as Error).message })
    return null
  } finally {
    // B26: 清理 TTS 临时目录（含异常路径）
    for (const d of ttsDirs) {
      try { fs.rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
    }
  }
}
