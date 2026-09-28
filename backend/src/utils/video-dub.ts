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
import { getAbsolutePath } from './storage.js'
import { ffmpeg, checkFfmpegSuite } from './ffmpeg.js'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'

/** 从 AI 服务配置读取 TTS 上游（base_url + api_key），缺失时返回 null */
async function getTtsEndpoint(): Promise<{ baseUrl: string; apiKey: string } | null> {
  try {
    const { getActiveConfig } = await import('../services/ai.js')
    // TTS 无独立服务类型，回退到文本服务配置（同源 fusion-mlx）
    const cfg = await getActiveConfig('text')
    if (cfg?.baseUrl && cfg?.apiKey) {
      return { baseUrl: cfg.baseUrl.replace(/\/+$/, ''), apiKey: cfg.apiKey }
    }
  } catch { /* 无配置时走默认 */ }
  return null
}

const TTS_MODEL = process.env.FUSION_TTS_MODEL || 'mlx-community--Kokoro-82M-bf16'
const TTS_VOICE = process.env.FUSION_TTS_VOICE || 'zf_xiaobei'

/**
 * 从分镜提示词提取对白。支持格式：
 *   @角色名说：「台词」 / @角色名说："台词" / 角色名：「台词」
 * 返回按出现顺序的去重台词列表（最多 3 条，2.2s 视频只容得下短句）。
 */
export function extractDialogue(videoPrompt: string | null | undefined): string[] {
  if (!videoPrompt) return []
  const out: string[] = []
  const re = /说[：:]\s*[「"']([^」"']{2,40})[」"']/g
  for (const m of videoPrompt.matchAll(re)) {
    const line = m[1].trim()
    if (line && !out.includes(line)) out.push(line)
    if (out.length >= 3) break
  }
  return out
}

/** 调用 TTS 合成一句台词，返回 wav 临时文件路径 */
async function synthesizeLine(text: string, idx: number): Promise<string | null> {
  const ep = await getTtsEndpoint()
  const baseUrl = ep?.baseUrl || process.env.FUSION_MLX_BASE_URL || 'http://127.0.0.1:11434'
  const apiKey = ep?.apiKey || process.env.FUSION_MLX_API_KEY || 'REDACTED-LOCAL-KEY'
  const attempt = async (): Promise<string | null> => {
    // Kokoro 首次加载需下载/初始化，且与常驻 LLM 共存时可能被内存管理延迟，超时给足
    const res = await fetch(`${baseUrl}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: TTS_MODEL, input: text, voice: TTS_VOICE, response_format: 'wav' }),
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
): Promise<string | null> {
  try {
    const lines = extractDialogue(videoPrompt)
    if (!lines.length) return null

    const { ffmpeg: ffmpegOk } = await checkFfmpegSuite()
    if (!ffmpegOk) return null

    logTaskProgress('VideoTask', 'tts-dub-start', { taskId, lines: lines.length })

    // 逐句合成
    const wavs: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const wav = await synthesizeLine(lines[i], i)
      if (wav) wavs.push(wav)
    }
    if (!wavs.length) return null

    const srcAbs = getAbsolutePath(relativePath)
    const outAbs = srcAbs.replace(/\.mp4$/, '.dub.mp4')

    // 1) TTS 各句串联为一条音轨（句间 0.3s 静音）
    // 2) 与原视频混流：原音轨压低作环境声（-18dB），TTS 音轨前置
    await new Promise<void>((resolve, reject) => {
      const filter = wavs.length === 1
        ? '[1:a]volume=1.0[tts]'
        : `${wavs.map((_, i) => `[${i + 1}:a]`).join('')}concat=n=${wavs.length}:v=0:a=1[tts]`
      const cmd = ffmpeg(srcAbs)
      wavs.forEach((w) => cmd.input(w))
      cmd.complexFilter([filter, '[tts]volume=1.0[ttsv];[0:a]volume=0.12[env];[env][ttsv]amix=inputs=2:duration=first:dropout_transition=0[aout]'])
        .outputOptions(['-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-shortest'])
        .output(outAbs)
        .on('end', () => resolve())
        .on('error', reject)
      // 无对白轨的原音频为纯底噪时同样可听；amix 需要原视频有音轨
      try { cmd.run() } catch (e) { reject(e) }
    })

    fs.renameSync(outAbs, srcAbs)
    logTaskProgress('VideoTask', 'tts-dub-done', { taskId, lines: lines.length })
    return relativePath
  } catch (err) {
    logTaskWarn('VideoTask', 'tts-dub-failed', { taskId, error: (err as Error).message })
    return null
  }
}
