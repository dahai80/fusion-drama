/**
 * Generates the latest.json manifest consumed by the in-app updater
 *
 * Usage: after npm run dist / dist:win, run `node scripts/make-update-feed.mjs`
 *   --base-url <url>  download base URL, defaults to the direct GitHub Releases link
 *                     (https://github.com/<owner>/<repo>/releases/download/v<version>)
 *   --notes "text"    update notes for this release
 *
 * Output release/latest.json structure:
 * { version, notes, platforms: { "<platform>-<arch>": { url, sha256, size } } }
 *
 * Publishing: upload latest.json together with the installers to the GitHub Release
 * (tag like v1.0.1); the updater fetches releases/latest/download/latest.json by default,
 * which completes the rollout.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DESKTOP = path.resolve(__dirname, '..')
const RELEASE = path.join(DESKTOP, 'release')

const argv = process.argv.slice(2)
function argOf(flag) {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}

const pkg = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8'))
const version = pkg.version
const repo = process.env.GITHUB_REPO || 'fusion-drama/fusion-drama'
const baseUrl = argOf('--base-url')
  || process.env.UPDATE_BASE_URL
  || `https://github.com/${repo}/releases/download/v${version}`
const notes = argOf('--notes') || ''

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(file)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

// Platform key (matches the updater's process.platform-process.arch) -> artifact filename
// (electron-builder's mac zip names carry a -mac suffix)
const targets = [
  { key: 'darwin-arm64', file: `FusionDrama-${version}-arm64-mac.zip` },
  { key: 'darwin-x64', file: `FusionDrama-${version}-mac.zip` },
  { key: 'win32-x64', file: `FusionDrama Setup ${version}.exe` },
]

const platforms = {}
const missing = []
for (const t of targets) {
  const file = path.join(RELEASE, t.file)
  if (!fs.existsSync(file)) {
    missing.push(t.file)
    continue
  }
  platforms[t.key] = {
    // GitHub normalizes spaces to dots when uploading assets (both gh CLI and API; spaces cannot
    // be kept), so the URL must match the server-side asset name or downloads 404
    url: `${baseUrl}/${encodeURIComponent(t.file.replace(/ /g, '.'))}`,
    sha256: await sha256(file),
    size: fs.statSync(file).size,
  }
}

if (missing.length === targets.length) {
  console.error('no update artifacts under release/; run npm run dist / dist:win first')
  process.exit(1)
}

const feed = { version, notes, platforms }
const out = path.join(RELEASE, 'latest.json')
fs.writeFileSync(out, JSON.stringify(feed, null, 2))
console.log(`latest.json ok (${Object.keys(platforms).length} platforms)`)
if (missing.length) console.warn(`missing artifacts (excluded from manifest): ${missing.join(', ')}`)
console.log(out)
