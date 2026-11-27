/**
 * Packaging resource prep — assembles desktop/resources/ (the source of electron-builder
 * extraResources)
 *
 * 1. frontend/           ← nuxt generate output (.output/public, includes index.html)
 * 2. workspace-template/ ← backend/workspace (skills + prompts, copied into userData on first boot)
 * 3. bin-<os>/           ← ffmpeg/ffprobe split per platform (electron-builder ${os} macro picks
 *                          what it needs, so the mac bundle doesn't ship exe files and the win
 *                          bundle doesn't ship mac binaries for a wasted +144MB)
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP = path.resolve(__dirname, '..')
const REPO = path.resolve(DESKTOP, '..')
const RES = path.join(DESKTOP, 'resources')

fs.rmSync(RES, { recursive: true, force: true })
fs.mkdirSync(RES, { recursive: true })

// 1. frontend static build output
const frontendSrc = path.join(REPO, 'frontend', '.output', 'public')
if (!fs.existsSync(path.join(frontendSrc, 'index.html'))) {
  console.error('missing frontend build output: run npm run generate in frontend/ first')
  process.exit(1)
}
fs.cpSync(frontendSrc, path.join(RES, 'frontend'), { recursive: true })
console.log('resources/frontend ✓')

// 2. workspace template (skills + prompts)
const workspaceSrc = path.join(REPO, 'backend', 'workspace')
fs.cpSync(workspaceSrc, path.join(RES, 'workspace-template'), { recursive: true })
console.log('resources/workspace-template ✓')

// 3. ffmpeg binaries (macOS/Linux use the ffmpeg-static build for the current platform;
//    Windows cross-packaging: ffmpeg.exe comes from the ffmpeg-static GitHub release
//    (locally cached), ffprobe.exe uses ffprobe-static's bundled win32/x64 build)
const req = createRequire(import.meta.url)
const binMac = path.join(RES, 'bin-mac')
const binWin = path.join(RES, 'bin-win')
fs.mkdirSync(binMac, { recursive: true })
fs.mkdirSync(binWin, { recursive: true })
const ffmpegPath = req('ffmpeg-static')
const ffprobePath = req('ffprobe-static')?.path
if (!ffmpegPath || !ffprobePath || !fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
  console.error('ffmpeg-static/ffprobe-static binaries missing; re-run npm install (or set the FFMPEG_BINARIES_URL mirror)')
  process.exit(1)
}
fs.copyFileSync(ffmpegPath, path.join(binMac, 'ffmpeg'))
fs.copyFileSync(ffprobePath, path.join(binMac, 'ffprobe'))
fs.chmodSync(path.join(binMac, 'ffmpeg'), 0o755)
fs.chmodSync(path.join(binMac, 'ffprobe'), 0o755)
console.log('resources/bin-mac ✓')

// 3b. Windows binaries (for the win bundle; absence only warns, never fails non-win packaging)
const winBinDir = path.join(DESKTOP, 'build', 'win-bin')
const ffmpegWin = path.join(winBinDir, 'ffmpeg.exe')
const ffprobeWinSrc = path.join(path.dirname(req.resolve('ffprobe-static/package.json')), 'bin', 'win32', 'x64', 'ffprobe.exe')
if (!fs.existsSync(ffmpegWin)) {
  console.warn('note: build/win-bin/ffmpeg.exe is missing, the Windows bundle will not embed ffmpeg.' +
    ' Get it from: https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-win32-x64')
}
if (fs.existsSync(ffmpegWin) && fs.existsSync(ffprobeWinSrc)) {
  fs.copyFileSync(ffmpegWin, path.join(binWin, 'ffmpeg.exe'))
  fs.copyFileSync(ffprobeWinSrc, path.join(binWin, 'ffprobe.exe'))
  console.log('resources/bin-win ✓')
}

// 4. fm-server (optional, cross-session memory desktop bootstrap): copied from the local
//    fusion-memory release build. Absence only warns and does not block packaging — at
//    runtime a missing fm-server degrades gracefully (memory off, settings page shows offline)
import os from 'os'
const fmServerSrc = process.env.FM_SERVER_BIN
  || path.join(os.homedir(), 'fusion', 'fusion-memory', 'target', 'release', 'fm-server')
if (fs.existsSync(fmServerSrc)) {
  fs.copyFileSync(fmServerSrc, path.join(binMac, 'fm-server'))
  fs.chmodSync(path.join(binMac, 'fm-server'), 0o755)
  console.log('resources/bin-mac/fm-server ✓')
} else {
  console.warn('note: fm-server binary missing (fusion-memory not built), desktop cross-session memory unavailable.' +
    ' Build it: cd ~/fusion/fusion-memory && cargo build --release -p fm-server (or point FM_SERVER_BIN at a path)')
}
