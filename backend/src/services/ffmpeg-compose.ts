/**
 * FFmpeg 单镜头合成 — 视频 + TTS音频 + 烧录字幕
 */
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { generateTTS } from './tts-generation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')
const DATA_ROOT = path.resolve(__dirname, '../../../data')

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
}

/**
 * 合成单个镜头：视频 + TTS对白音频 + 烧录字幕
 */
export async function composeStoryboard(storyboardId: number): Promise<string> {
  const [sb] = db.select().from(schema.storyboards).where(eq(schema.storyboards.id, storyboardId)).all()
  if (!sb) throw new Error(`Storyboard ${storyboardId} not found`)
  if (!sb.videoUrl) throw new Error(`Storyboard ${storyboardId} has no video`)

  console.log(`[Compose] Start storyboard #${sb.storyboardNumber} (id=${storyboardId})`)

  const videoPath = toAbsPath(sb.videoUrl)
  let audioPath: string | null = null
  let subtitlePath: string | null = null

  // 1. 生成 TTS 音频（如果有对白）
  if (sb.dialogue && sb.dialogue.trim()) {
    // 查找角色的音色
    let voiceId = 'alloy' // 默认
    // 尝试从对白中提取角色名（格式：角色名：台词）
    const match = sb.dialogue.match(/^(.+?)[:：]/)
    if (match) {
      const charName = match[1].replace(/[（(].+?[)）]/, '').trim()
      const chars = db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, sb.episodeId)).all() // 近似：通过 episode 找 drama
      // 从 episode 找 drama_id
      const [ep] = db.select().from(schema.episodes).where(eq(schema.episodes.id, sb.episodeId)).all()
      if (ep) {
        const allChars = db.select().from(schema.characters)
          .where(eq(schema.characters.dramaId, ep.dramaId)).all()
        const found = allChars.find(c => c.name === charName)
        if (found?.voiceStyle) voiceId = found.voiceStyle
      }
    }

    // 提取纯台词（去掉角色名前缀）
    const pureDialogue = sb.dialogue.replace(/^.+?[:：]\s*/, '').replace(/[（(].+?[)）]/g, '').trim()
    if (pureDialogue) {
      const ttsPath = await generateTTS({ text: pureDialogue, voice: voiceId })
      audioPath = toAbsPath(ttsPath)
      db.update(schema.storyboards).set({ ttsAudioUrl: ttsPath, updatedAt: now() })
        .where(eq(schema.storyboards.id, storyboardId)).run()
    }
  }

  // 2. 生成字幕文件（SRT）
  if (sb.dialogue && sb.dialogue.trim()) {
    const srtDir = path.join(STORAGE_ROOT, 'subtitles')
    fs.mkdirSync(srtDir, { recursive: true })
    const srtFilename = `${uuid()}.srt`
    subtitlePath = path.join(srtDir, srtFilename)

    const duration = sb.duration || 10
    const pureText = sb.dialogue.replace(/^.+?[:：]\s*/, '').replace(/[（(].+?[)）]/g, '').trim()
    const srtContent = `1\n00:00:00,500 --> 00:00:${String(Math.min(duration - 1, 59)).padStart(2, '0')},000\n${pureText}\n`
    fs.writeFileSync(subtitlePath, srtContent, 'utf-8')

    const srtRelative = `static/subtitles/${srtFilename}`
    db.update(schema.storyboards).set({ subtitleUrl: srtRelative, updatedAt: now() })
      .where(eq(schema.storyboards.id, storyboardId)).run()
  }

  // 3. FFmpeg 合成
  const outputDir = path.join(STORAGE_ROOT, 'composed')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputFilename = `${uuid()}.mp4`
  const outputPath = path.join(outputDir, outputFilename)

  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg(videoPath)

    if (audioPath) {
      cmd = cmd.input(audioPath)
    }

    const filters: string[] = []

    // 烧录字幕
    if (subtitlePath) {
      // 需要转义路径中的特殊字符
      const escapedPath = subtitlePath.replace(/\\/g, '/').replace(/:/g, '\\:')
      filters.push(`subtitles='${escapedPath}':force_style='FontSize=20,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2'`)
    }

    if (filters.length > 0) {
      cmd = cmd.videoFilter(filters)
    }

    const outputOptions = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '23']

    if (audioPath) {
      outputOptions.push('-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-shortest')
    } else {
      outputOptions.push('-an') // 无音频
    }

    cmd.outputOptions(outputOptions)
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })

  const composedRelative = `static/composed/${outputFilename}`
  db.update(schema.storyboards).set({ composedVideoUrl: composedRelative, updatedAt: now() })
    .where(eq(schema.storyboards.id, storyboardId)).run()

  console.log(`[Compose] Done storyboard #${sb.storyboardNumber} → ${composedRelative}`)
  return composedRelative
}
