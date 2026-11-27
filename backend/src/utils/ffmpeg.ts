/**
 * FFmpeg unified configuration and availability probing
 *
 * Background: on Windows, when node_modules is copied across platforms or the
 * ffmpeg-static postinstall download is corrupted (an HTML error page saved as
 * ffmpeg.exe), spawning a non-PE file throws EFTYPE synchronously; that exception
 * happens inside fluent-ffmpeg's delayed callback where the outer try/catch cannot
 * catch it, crashing the whole Node process. Here we proactively spawn -version to
 * probe before any business call, and business code degrades gracefully when
 * unavailable (poster frame skipped / merge returns a clear error).
 */
import { spawn } from 'child_process'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import { createRequire } from 'module'

// ffmpeg-static / ffprobe-static are both optional dependencies: npm install ships the bundled binaries;
// the desktop build does not carry these two npm packages (binaries ship via resources/bin),
// falling back to FFMPEG_BIN/FFPROBE_BIN when missing
const req = createRequire(import.meta.url)

function resolveStatic(moduleName: string): string | null {
  try {
    const mod = req(moduleName)
    return (moduleName === 'ffprobe-static' ? mod?.path : mod) ?? null
  } catch {
    return null
  }
}

const ffmpegPath = process.env.FFMPEG_BIN || resolveStatic('ffmpeg-static')
const ffprobePath = process.env.FFPROBE_BIN || resolveStatic('ffprobe-static')

// Use the project's bundled binaries when the system has no ffmpeg
if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)
if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath)

export { ffmpeg }

/** Spawns -version once to verify the binary is truly executable (including the synchronous EFTYPE fallback) */
function probeBinary(binPath: string | null): Promise<boolean> {
  if (!binPath || !fs.existsSync(binPath)) return Promise.resolve(false)
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(ok)
    }
    const timer = setTimeout(() => finish(false), 10_000)
    let child
    try {
      child = spawn(binPath, ['-version'], { stdio: 'ignore', windowsHide: true })
    } catch {
      // On Windows, spawning a non-PE file (e.g. a corrupted downloaded ffmpeg.exe) throws EFTYPE synchronously
      finish(false)
      return
    }
    child.on('error', () => finish(false))
    child.on('close', (code) => finish(code === 0))
  })
}

export interface FfmpegSuite {
  ffmpeg: boolean
  ffprobe: boolean
}

// Caches a successful probe result (probed at most once per process); failures are not cached, so recovery after fixing the binary needs no restart
let okCache: FfmpegSuite | null = null
let warned = false

/** Probes whether the bundled ffmpeg/ffprobe are usable */
export async function checkFfmpegSuite(): Promise<FfmpegSuite> {
  if (okCache) return okCache
  const [ffmpegOk, ffprobeOk] = await Promise.all([probeBinary(ffmpegPath), probeBinary(ffprobePath)])
  const suite = { ffmpeg: ffmpegOk, ffprobe: ffprobeOk }
  if (ffmpegOk && ffprobeOk) {
    okCache = suite
  } else if (!warned) {
    warned = true
    console.warn(
      `[ffmpeg] bundled binaries unavailable (ffmpeg=${ffmpegOk ? 'ok' : 'FAIL'}, ffprobe=${ffprobeOk ? 'ok' : 'FAIL'}). ` +
      `Poster frame extraction and video merging will be skipped/fail. Fix: delete node_modules and run npm install again on this machine, ` +
      `or set FFMPEG_BIN/FFPROBE_BIN to valid executables`
    )
  }
  return suite
}
