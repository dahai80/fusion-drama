/**
 * 打包资源准备 — 组装 desktop/resources/（electron-builder extraResources 的来源）
 *
 * 1. frontend/           ← nuxt generate 产物（.output/public，含 index.html）
 * 2. workspace-template/ ← backend/workspace（skills + prompts，首启动拷入 userData）
 * 3. bin/                ← ffmpeg/ffprobe 静态二进制（保留执行位）
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

// 1. 前端静态产物
const frontendSrc = path.join(REPO, 'frontend', '.output', 'public')
if (!fs.existsSync(path.join(frontendSrc, 'index.html'))) {
  console.error('缺少前端产物：请先在 frontend/ 执行 npm run generate')
  process.exit(1)
}
fs.cpSync(frontendSrc, path.join(RES, 'frontend'), { recursive: true })
console.log('resources/frontend ✓')

// 2. workspace 模板（skills 技能 + prompts 提示词）
const workspaceSrc = path.join(REPO, 'backend', 'workspace')
fs.cpSync(workspaceSrc, path.join(RES, 'workspace-template'), { recursive: true })
console.log('resources/workspace-template ✓')

// 3. ffmpeg 二进制
const req = createRequire(import.meta.url)
const binDir = path.join(RES, 'bin')
fs.mkdirSync(binDir, { recursive: true })
const ffmpegPath = req('ffmpeg-static')
const ffprobePath = req('ffprobe-static')?.path
if (!ffmpegPath || !ffprobePath || !fs.existsSync(ffmpegPath) || !fs.existsSync(ffprobePath)) {
  console.error('ffmpeg-static/ffprobe-static 二进制缺失，请重新 npm install（或配置 FFMPEG_BINARIES_URL 镜像）')
  process.exit(1)
}
fs.copyFileSync(ffmpegPath, path.join(binDir, 'ffmpeg'))
fs.copyFileSync(ffprobePath, path.join(binDir, 'ffprobe'))
fs.chmodSync(path.join(binDir, 'ffmpeg'), 0o755)
fs.chmodSync(path.join(binDir, 'ffprobe'), 0o755)
console.log('resources/bin ✓')
