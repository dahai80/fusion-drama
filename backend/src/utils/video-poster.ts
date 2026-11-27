/**
 * Video poster frame extraction — used for <video poster>, so list pages can show the first frame without buffering the whole video
 */
import path from 'path'
import { getAbsolutePath } from './storage.js'
import { ffmpeg, checkFfmpegSuite } from './ffmpeg.js'

/** Derives the poster frame path from a video's relative path: static/videos/x.mp4 → static/videos/x_poster.jpg */
export function posterPathFor(relativePath: string): string {
  return relativePath.replace(/\.[^./]+$/, '_poster.jpg')
}

/**
 * Extracts the frame at 0.5s of the video as the poster frame (width 640, aspect-preserving
 * scale, same directory as the source video).
 * Returns null on failure and does not block the main flow.
 */
export async function extractVideoPoster(relativePath: string): Promise<string | null> {
  try {
    // Silently skip when the ffmpeg binary is corrupted (cross-platform node_modules
    // copies / incomplete downloads), avoiding a synchronous EFTYPE crash inside
    // fluent-ffmpeg's delayed callback taking down the whole process
    const { ffmpeg: ffmpegOk } = await checkFfmpegSuite()
    if (!ffmpegOk) return null

    const posterRel = posterPathFor(relativePath)
    const posterAbs = getAbsolutePath(posterRel)
    await new Promise<void>((resolve, reject) => {
      ffmpeg(getAbsolutePath(relativePath))
        .screenshots({
          timestamps: ['0.5'],
          filename: path.basename(posterAbs),
          folder: path.dirname(posterAbs),
          size: '640x?',
        })
        .on('end', () => resolve())
        .on('error', reject)
    })
    return posterRel
  } catch (err) {
    console.warn(`[video-poster] poster frame extraction failed ${relativePath}:`, (err as Error).message)
    return null
  }
}
