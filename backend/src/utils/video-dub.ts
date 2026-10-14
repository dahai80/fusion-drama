/**
 * 视频对白配音（TTS）— 修复 LTX-2.5 联合 A/V 只产出环境底噪、无清晰对白的问题
 *
 * 流程：从分镜 video_prompt 提取「角色名：台词」对白 → 逐条调用 fusion-mlx
 * /v1/audio/speech（Kokoro TTS）合成 → 按顺序拼成一条音轨 → 与原视频混流
 * （原音轨降噪保留环境声，TTS 音轨置前）。
 *
 * 任一步骤失败均返回原视频路径，不阻断任务主流程。
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
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
// 多说话人音色轮换（Kokoro 中文男声）：不同角色分配不同声线，避免全片同声（bug2）。
// 分配规则：按台词首次出现顺序，第 i 个说话人 → 第 i 个音色（循环）。
const TTS_VOICE_ROTATION = (process.env.FUSION_TTS_VOICES || 'zm_yunjian,zm_yunyang,zm_yunxia')
  .split(',').map(s => s.trim()).filter(Boolean)
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

/** 查分镜绑定的角色名列表（用于 extractDialogue 精确匹配 @角色名）。 */
async function getStoryboardSpeakers(storyboardId?: number): Promise<string[]> {
  if (!storyboardId) return []
  try {
    const rows = await db
      .select({ name: schema.characters.name })
      .from(schema.storyboardCharacters)
      .innerJoin(
        schema.characters,
        eq(schema.characters.id, schema.storyboardCharacters.characterId),
      )
      .where(eq(schema.storyboardCharacters.storyboardId, storyboardId))
    return rows.map(r => r.name).filter(Boolean)
  } catch (err) {
    logTaskWarn('VideoTask', 'tts-speakers-query-failed', { storyboardId, error: (err as Error).message })
    return []
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
async function synthesizeLine(text: string, idx: number, voice: string): Promise<string | null> {
  const ep = await getTtsEndpoint()
  const baseUrl = ep?.baseUrl || process.env.FUSION_MLX_BASE_URL || 'http://127.0.0.1:11434'
  const apiKey = ep?.apiKey || process.env.FUSION_MLX_API_KEY || 'REDACTED-LOCAL-KEY'
  const attempt = async (): Promise<string | null> => {
    // Kokoro 首次加载需下载/初始化，且与常驻 LLM 共存时可能被内存管理延迟，超时给足
    const res = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: text,
        // Qwen3-TTS 无 voice 参数（音色内置）；仅对支持 voice 的模型（Kokoro 等）传
        ...(voice && !/qwen3.*tts/i.test(TTS_MODEL) ? { voice } : {}),
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
  try {
    // 分镜绑定角色名用于精确解析 @角色名（LLM 常把动作描述夹在名字与「说」之间，
    // 无已知角色名则 extractDialogue 回退为紧邻「说」的词，同角色多句台词会因
    // 动作描述不同而映射到不同 speaker → 不同音色，破坏同角色音色一致性 bug2）。
    const knownSpeakers = await getStoryboardSpeakers(storyboardId)
    const lines = extractDialogue(videoPrompt, knownSpeakers)
    if (!lines.length) return null

    const { ffmpeg: ffmpegOk } = await checkFfmpegSuite()
    if (!ffmpegOk) return null

    // 说话人 → 音色分配：按台词首次出现顺序给每个说话人分配轮换表中的音色，
    // 同一说话人多句台词共用同一声线（bug2：不同角色同声无法分辨）。
    // FUSION_TTS_VOICE 显式指定时全片单音色；非 Kokoro 模型（如 Qwen3-TTS）忽略 voice。
    const speakerVoices = new Map<string, string>()
    if (!TTS_VOICE && /kokoro/i.test(TTS_MODEL)) {
      for (const line of lines) {
        if (!speakerVoices.has(line.speaker)) {
          speakerVoices.set(line.speaker, TTS_VOICE_ROTATION[speakerVoices.size % TTS_VOICE_ROTATION.length])
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
      const wav = await synthesizeLine(lines[i].text, i, voice)
      if (wav) wavs.push(wav)
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

    fs.renameSync(outAbs, srcAbs)
    logTaskProgress('VideoTask', 'tts-dub-done', { taskId, storyboardId, lines: effectiveWavs.length, videoDuration, totalSpeech, tempo })
    return relativePath
  } catch (err) {
    logTaskWarn('VideoTask', 'tts-dub-failed', { taskId, storyboardId, error: (err as Error).message })
    return null
  }
}
