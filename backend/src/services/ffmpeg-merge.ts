/**
 * FFmpeg multi-shot merge — concatenates all generated shot videos into one episode
 */
import fs from 'fs'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { db, getInsertId, schema } from '../db/index.js'
import { and, eq } from 'drizzle-orm'
import { now } from '../utils/response.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'
import { extractVideoPoster } from '../utils/video-poster.js'
import { ffmpeg, checkFfmpegSuite } from '../utils/ffmpeg.js'
import { DATA_ROOT, STORAGE_ROOT } from '../utils/paths.js'

function toAbsPath(relativePath: string): string {
  if (path.isAbsolute(relativePath)) return relativePath
  if (relativePath.startsWith('static/')) return path.join(DATA_ROOT, relativePath)
  return path.join(STORAGE_ROOT, relativePath)
}

/** concat list entry: single-quote escaping prevents path injection (a ' in a filename would break the concat syntax and inject extra directives) */
function concatEscape(p: string): string {
  return p.replace(/'/g, `'\\''`)
}

/** Validates merge input paths stay inside the data directory: avoids reading arbitrary file paths when DB fields are polluted */
function assertContainedUnderDataRoot(p: string): string {
  const abs = path.resolve(toAbsPath(p))
  if (!abs.startsWith(path.resolve(DATA_ROOT) + path.sep)) {
    throw new Error(`Clip path escapes data root, refusing to merge: ${p}`)
  }
  return abs
}

/**
 * Merges the shot videos of one episode.
 * Prefers video generation output; also supports legacy composedVideoUrl data.
 * When storyboardIds is given, only the selected shots are merged (still in shot-number order).
 */
export async function mergeEpisodeVideos(episodeId: number, dramaId: number, storyboardIds?: number[]): Promise<number> {
  let storyboards = await db.select().from(schema.storyboards)
    .where(eq(schema.storyboards.episodeId, episodeId))
    .orderBy(schema.storyboards.storyboardNumber)

  if (storyboardIds?.length) {
    const allow = new Set(storyboardIds.map(Number))
    storyboards = storyboards.filter(sb => allow.has(sb.id))
  }

  // Allow partial merge: concatenate generated shots in shot-number order, skip ungenerated ones
  const clips = storyboards
    .map(sb => ({ sb, url: sb.videoUrl || sb.composedVideoUrl }))
    .filter(c => Boolean(c.url)) as { sb: typeof storyboards[number]; url: string }[]

  // i18n: user-facing
  if (clips.length === 0) throw new Error('所选镜头还没有可拼接的视频')

  // FR-P0-5 merge re-entry guard (PRD 4.8): concurrent merges of the same episode would overwrite each other's output — reject new merges while one is running
  const running = await db.select({ id: schema.videoMerges.id }).from(schema.videoMerges)
    .where(and(eq(schema.videoMerges.episodeId, episodeId), eq(schema.videoMerges.status, 'processing')))
    .limit(1)
  if (running.length > 0) {
    // i18n: user-facing
    throw new Error('该剧集已有进行中的拼接任务，请等待完成后再发起')
  }

  // Probe ffmpeg before merging: with a corrupted binary, fluent-ffmpeg's synchronous EFTYPE would crash the whole process,
  // so intercept early and return an actionable fix hint (the route layer returns it to the frontend as a 400)
  const suite = await checkFfmpegSuite()
  if (!suite.ffmpeg || !suite.ffprobe) {
    // i18n: user-facing
    throw new Error('本机 ffmpeg 不可用，无法拼接视频（常见于 node_modules 跨平台拷贝或 ffmpeg-static 下载损坏）。请删除 node_modules 后在本机重新 npm install，或设置 FFMPEG_BIN 指向有效的 ffmpeg 可执行文件后重启服务')
  }

  // Validate the video files actually exist: video_url in the DB may point to files already cleaned up,
  // and merging directly would produce ffmpeg's cryptic "No such file or directory" error
  const missing = clips.filter(c => !fs.existsSync(assertContainedUnderDataRoot(c.url)))
  if (missing.length > 0) {
    const nums = missing.map(c => `S${c.sb.storyboardNumber}`).join('、')
    // i18n: user-facing
    throw new Error(`镜头 ${nums} 的视频文件已丢失（本地文件不存在），请重新生成这些镜头的视频，或在拼接时取消勾选`)
  }

  const videos = clips.map(c => c.url)

  logTaskStart('MergeTask', 'episode-merge', { episodeId, dramaId, clips: videos.length })

  // Create the merge record
  const ts = now()
  const res = await db.insert(schema.videoMerges).values({
    episodeId,
    dramaId,
    title: `Episode ${episodeId} Merge`,
    provider: 'ffmpeg',
    model: 'ffmpeg-concat-h264-aac',
    status: 'processing',
    scenes: JSON.stringify(videos),
    createdAt: ts,
  })
  const mergeId = getInsertId(res)

  // Run asynchronously
  doMerge(mergeId, episodeId, videos).catch(async err => {
    logTaskError('MergeTask', 'episode-merge', { mergeId, episodeId, error: err.message })
    console.error(`[Merge] Failed:`, err)
    await db.update(schema.videoMerges)
      .set({ status: 'failed', errorMsg: err.message })
      .where(eq(schema.videoMerges.id, mergeId))
  })

  return mergeId
}

async function doMerge(mergeId: number, episodeId: number, videos: string[]) {
  // concat list file: try/finally guarantees cleanup (no temp file leak on process failure)
  const listDir = path.join(STORAGE_ROOT, 'temp')
  fs.mkdirSync(listDir, { recursive: true })
  const listPath = path.join(listDir, `${uuid()}.txt`)

  // Merge input paths must stay inside the data directory (reject arbitrary files when DB fields are polluted) + concat single-quote escaping
  const listContent = videos
    .map(v => `file '${concatEscape(assertContainedUnderDataRoot(v))}'`)
    .join('\n')

  // Output file
  fs.writeFileSync(listPath, listContent, 'utf-8')
  const outputDir = path.join(STORAGE_ROOT, 'merged')
  fs.mkdirSync(outputDir, { recursive: true })
  const outputFilename = `${uuid()}.mp4`
  const outputPath = path.join(outputDir, outputFilename)

  try {
    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg()
      // fluent-ffmpeg has no .timeout method (misusing it raises not a function) —
      // the wall-clock cap (seconds) is implemented via the start event + timer + kill: kills the process when ffmpeg hangs, merge record set to failed
      let timer: NodeJS.Timeout | null = null
      const clearTimer = () => { if (timer) clearTimeout(timer) }
      cmd
        .input(listPath)
        .inputOptions(['-f', 'concat', '-safe', '0'])
        .outputOptions([
          '-fflags', '+genpts',
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '23',
          '-c:a', 'aac',
          '-ar', '48000',
          '-b:a', '192k',
          '-movflags', '+faststart',
        ])
        .output(outputPath)
        .on('start', () => { timer = setTimeout(() => cmd.kill('SIGKILL'), 3_600_000) })
        .on('end', () => { clearTimer(); resolve() })
        .on('error', (err: Error) => { clearTimer(); reject(err) })
        .run()
    })
  } finally {
    // Temp cleanup failure does not block the main flow
    try { fs.unlinkSync(listPath) } catch { /* ignore */ }
  }

  // Get duration
  // Get duration
  const duration = await getVideoDuration(outputPath)

  const mergedRelative = `static/merged/${outputFilename}`

  // Poster frame of the merged video (used as the export page cover)
  await extractVideoPoster(mergedRelative)

  // Update the merge record
  await db.update(schema.videoMerges)
    .set({ status: 'completed', mergedUrl: mergedRelative, duration, completedAt: now() })
    .where(eq(schema.videoMerges.id, mergeId))

  // Update the episode
  await db.update(schema.episodes)
    .set({ videoUrl: mergedRelative, updatedAt: now() })
    .where(eq(schema.episodes.id, episodeId))

  logTaskSuccess('MergeTask', 'episode-merge', { mergeId, episodeId, output: mergedRelative, duration, clips: videos.length })
}

function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { resolve(0); return }
      resolve(Math.round(metadata.format.duration || 0))
    })
  })
}
