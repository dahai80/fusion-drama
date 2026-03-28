/**
 * TTS 语音合成服务 — 调用 OpenAI 兼容 /audio/speech 接口
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { getAudioConfig } from './ai.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')

interface TTSParams {
  text: string
  voice: string       // 音色 ID，如 "alloy", "nova", "zh-CN-XiaoxiaoNeural"
  model?: string      // TTS 模型，如 "tts-1", "tts-1-hd"
  speed?: number      // 语速，0.25-4.0
}

/**
 * 生成 TTS 音频，返回本地文件路径
 */
export async function generateTTS(params: TTSParams): Promise<string> {
  const config = getAudioConfig()

  const body: Record<string, any> = {
    model: params.model || config.model || 'tts-1',
    input: params.text,
    voice: params.voice,
    response_format: 'mp3',
  }
  if (params.speed) body.speed = params.speed

  console.log(`[TTS] Generating: voice=${params.voice} text="${params.text.slice(0, 50)}..."`)

  const resp = await fetch(`${config.baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errText = await resp.text()
    throw new Error(`TTS API error ${resp.status}: ${errText}`)
  }

  // 响应是二进制音频数据
  const buffer = Buffer.from(await resp.arrayBuffer())

  // 保存到本地
  const audioDir = path.join(STORAGE_ROOT, 'audio')
  fs.mkdirSync(audioDir, { recursive: true })
  const filename = `${uuid()}.mp3`
  const filePath = path.join(audioDir, filename)
  fs.writeFileSync(filePath, buffer)

  const relativePath = `static/audio/${filename}`
  console.log(`[TTS] Saved: ${relativePath} (${buffer.length} bytes)`)
  return relativePath
}

/**
 * 为角色生成试听音频
 */
export async function generateVoiceSample(characterName: string, voiceId: string): Promise<string> {
  const sampleText = `你好，我是${characterName}。很高兴认识你，这是我的声音试听。`
  return generateTTS({ text: sampleText, voice: voiceId })
}
