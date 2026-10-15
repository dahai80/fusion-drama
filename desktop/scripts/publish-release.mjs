/**
 * 一键发布 — GitHub Releases
 *
 * 用法(在 desktop/ 下执行):
 *   npm run publish [-- --notes "更新说明"]
 *
 * 前置:
 *   - desktop/release/ 已有本版本产物(npm run dist / dist:win 之后)
 *   - gh 已登录且对目标仓库有发布权限(GITHUB_REPOSITORY 可覆盖默认仓库)
 *
 * 产物布局: vX.Y.Z Release(空格文件名自动规范化为点号,见 make-update-feed)
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP = path.resolve(__dirname, '..')
const RELEASE = path.join(DESKTOP, 'release')

const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'))
const version = pkg.version
const tag = `v${version}`

const argv = process.argv.slice(2)
function argOf(flag) { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined }
const notes = argOf('--notes') || ''
const skipGh = argv.includes('--skip-gh')

// 与 make-update-feed 相同的产物清单。注意 electron-builder 的 NSIS 本地产物带空格
// （FusionDrama Setup X.Y.Z.exe），GitHub 服务端会规范化为点号
const assets = [
  `FusionDrama-${version}-arm64.dmg`,
  `FusionDrama-${version}.dmg`,
  `FusionDrama-${version}-arm64-mac.zip`,
  `FusionDrama-${version}-mac.zip`,
  `FusionDrama Setup ${version}.exe`,
]
// URL 使用的规范化文件名（空格 → 点号，与 GitHub 服务端一致）
const dotName = (f) => f.replace(/ /g, '.')
const existing = assets.filter(f => fs.existsSync(path.join(RELEASE, f)))
if (!existing.length) {
  console.error(`release/ 下没有版本 ${version} 的产物,请先 npm run dist / dist:win`)
  process.exit(1)
}

// ---- 1. GitHub ----
if (!skipGh) {
  console.log(`[1/2] GitHub Release ${tag} …`)
  // gh release upload 要求 Release 已存在，不存在则先创建（--clobber 才能重复传）
  try {
    execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' })
  } catch {
    console.log(`  Release 不存在，先创建 …`)
    execFileSync('gh', ['release', 'create', tag, '--title', tag, '--notes', notes || tag], { stdio: 'inherit' })
  }
  const ghArgs = ['release', 'upload', tag, ...existing.map(f => path.join(RELEASE, f)), '--clobber']
  execFileSync('gh', ghArgs, { stdio: 'inherit' })
  console.log(`  ✓ 已上传 ${existing.length} 个资产`)
}

// ---- 2. latest.json(指向 GitHub 直链,更新器默认源) ----
console.log('[2/2] 生成更新清单 latest.json …')
async function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(file).on('data', c => hash.update(c)).on('end', () => resolve(hash.digest('hex'))).on('error', reject)
  })
}
const baseUrl = `https://github.com/fusion-drama/fusion-drama/releases/download/${tag}`
const platforms = {}
for (const f of existing) {
  const key = f.includes('Setup') ? 'win32-x64'
    : f.includes('-arm64') ? 'darwin-arm64'
    : 'darwin-x64'
  // 同一平台 dmg/zip 都存在时只取 zip(更新器用),dmg 是给手动安装的
  if (key !== 'win32-x64' && !f.endsWith('.zip')) continue
  platforms[key] = {
    url: `${baseUrl}/${encodeURIComponent(dotName(f))}`,
    sha256: await sha256(path.join(RELEASE, f)),
    size: fs.statSync(path.join(RELEASE, f)).size,
  }
}
fs.writeFileSync(path.join(RELEASE, 'latest.json'), JSON.stringify({ version, notes, platforms }, null, 2))
console.log(`  ✓ latest.json 平台: ${Object.keys(platforms).join(', ')}`)
if (!skipGh) execFileSync('gh', ['release', 'upload', tag, path.join(RELEASE, 'latest.json'), '--clobber'], { stdio: 'inherit' })

console.log(`
发布完成:
  https://github.com/fusion-drama/fusion-drama/releases/${tag}
`)
