/**
 * One-click publish — GitHub Releases
 *
 * Usage (run inside desktop/):
 *   npm run publish [-- --notes "update notes"]
 *
 * Prerequisites:
 *   - desktop/release/ already contains this version's artifacts (after npm run dist / dist:win)
 *   - gh is logged in and has release permission on the target repo (GITHUB_REPOSITORY overrides the default repo)
 *
 * Artifact layout: vX.Y.Z Release (space filenames are normalized to dots, see make-update-feed)
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

// Same artifact list as make-update-feed. Note that electron-builder's local NSIS artifact name
// contains spaces (FusionDrama Setup X.Y.Z.exe); GitHub normalizes them to dots server-side
const assets = [
  `FusionDrama-${version}-arm64.dmg`,
  `FusionDrama-${version}.dmg`,
  `FusionDrama-${version}-arm64-mac.zip`,
  `FusionDrama-${version}-mac.zip`,
  `FusionDrama Setup ${version}.exe`,
]
// Dot-normalized filename used in URLs (spaces -> dots, matching GitHub server-side)
const dotName = (f) => f.replace(/ /g, '.')
const existing = assets.filter(f => fs.existsSync(path.join(RELEASE, f)))
if (!existing.length) {
  console.error(`no version ${version} artifacts under release/; run npm run dist / dist:win first`)
  process.exit(1)
}

// ---- 1. GitHub ----
if (!skipGh) {
  console.log(`[1/2] GitHub Release ${tag} …`)
  // gh release upload requires the Release to exist; create it first when missing (--clobber allows re-upload)
  try {
    execFileSync('gh', ['release', 'view', tag], { stdio: 'ignore' })
  } catch {
    console.log('  Release missing, creating it first...')
    execFileSync('gh', ['release', 'create', tag, '--title', tag, '--notes', notes || tag], { stdio: 'inherit' })
  }
  const ghArgs = ['release', 'upload', tag, ...existing.map(f => path.join(RELEASE, f)), '--clobber']
  execFileSync('gh', ghArgs, { stdio: 'inherit' })
  console.log(`  ✓ uploaded ${existing.length} assets`)
}

// ---- 2. latest.json (points at GitHub direct links; the updater's default feed) ----
console.log('[2/2] generating update manifest latest.json...')
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
  // When both dmg/zip exist for a platform keep only the zip (updater uses it); dmg is for manual installs
  if (key !== 'win32-x64' && !f.endsWith('.zip')) continue
  platforms[key] = {
    url: `${baseUrl}/${encodeURIComponent(dotName(f))}`,
    sha256: await sha256(path.join(RELEASE, f)),
    size: fs.statSync(path.join(RELEASE, f)).size,
  }
}
fs.writeFileSync(path.join(RELEASE, 'latest.json'), JSON.stringify({ version, notes, platforms }, null, 2))
console.log(`  ✓ latest.json platforms: ${Object.keys(platforms).join(', ')}`)
if (!skipGh) execFileSync('gh', ['release', 'upload', tag, path.join(RELEASE, 'latest.json'), '--clobber'], { stdio: 'inherit' })

console.log(`
Publish complete:
  https://github.com/fusion-drama/fusion-drama/releases/${tag}
`)
