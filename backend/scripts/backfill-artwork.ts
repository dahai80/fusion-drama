/**
 * Backfill script for existing files — generates missing thumbnails and poster frames
 * for historically produced images/videos
 *
 * Usage: cd backend && npx tsx scripts/backfill-artwork.ts
 *
 * Scans under data/static:
 *   images/  -> generates thumbnails (400px-wide WebP) for images missing *_thumb.webp
 *   videos/, merged/ -> extracts poster frames for videos missing *_poster.jpg
 * Existing outputs are skipped; safe to re-run.
 */
import fs from 'fs'
import path from 'path'
import { generateImageThumb, thumbPathFor, getAbsolutePath } from '../src/utils/storage.js'
import { extractVideoPoster, posterPathFor } from '../src/utils/video-poster.js'
import { STORAGE_ROOT } from '../src/utils/paths.js'

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov'])

function listFiles(subDir: string): string[] {
  const dir = path.join(STORAGE_ROOT, subDir)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile())
}

async function backfillImages(subDir: string) {
  let done = 0, skipped = 0, failed = 0
  for (const file of listFiles(subDir)) {
    const ext = path.extname(file).toLowerCase()
    if (!IMAGE_EXTS.has(ext) || file.endsWith('_thumb.webp')) continue
    const rel = `static/${subDir}/${file}`
    if (fs.existsSync(getAbsolutePath(thumbPathFor(rel)))) { skipped++; continue }
    const ok = await generateImageThumb(rel)
    ok ? done++ : failed++
    if (ok) console.log(`  thumb ✓ ${rel}`)
    else console.warn(`  thumb ✗ ${rel}`)
  }
  console.log(`[${subDir}] thumbnails: generated ${done}, already existed ${skipped}, failed ${failed}`)
}

async function backfillVideos(subDir: string) {
  let done = 0, skipped = 0, failed = 0
  for (const file of listFiles(subDir)) {
    const ext = path.extname(file).toLowerCase()
    if (!VIDEO_EXTS.has(ext)) continue
    const rel = `static/${subDir}/${file}`
    if (fs.existsSync(getAbsolutePath(posterPathFor(rel)))) { skipped++; continue }
    const ok = await extractVideoPoster(rel)
    ok ? done++ : failed++
    if (ok) console.log(`  poster ✓ ${rel}`)
    else console.warn(`  poster ✗ ${rel}`)
  }
  console.log(`[${subDir}] posters: generated ${done}, already existed ${skipped}, failed ${failed}`)
}

console.log(`backfill root: ${STORAGE_ROOT}`)
await backfillImages('images')
await backfillVideos('videos')
await backfillVideos('merged')
console.log('backfill complete')
