/**
 * Media URL helpers — lists/cards use thumbnails and poster frames; full-size preview still uses the original
 *
 * Naming convention (produced automatically when the backend generates artifacts, see
 * backend/src/utils/storage.ts and video-poster.ts):
 *   image static/images/x.png        -> thumbnail static/images/x_thumb.webp
 *   video static/videos|merged/x.mp4 -> poster frame static/videos|merged/x_poster.jpg
 * Existing files can be backfilled with `npm run backfill-artwork` (backend).
 */

/** Image URL -> thumbnail URL; non-/static images (remote URLs etc.) returned as-is */
export function thumbOf(url: string): string {
  if (!url || !url.includes('/static/')) return url
  if (!/\.(png|jpe?g|webp|gif)$/i.test(url)) return url
  return url.replace(/\.[^./]+$/, '_thumb.webp')
}

/** Falls back to the original image when the thumbnail fails to load (old data not backfilled) */
export function thumbFallback(e: Event, orig: string) {
  const el = e.target as HTMLImageElement
  if (!el || el.dataset.fbk || !orig) return
  el.dataset.fbk = '1'
  el.src = orig
}

/** Video URL -> poster frame URL; returns an empty string when it cannot be derived (remote URLs etc.), no poster set */
export function posterOf(url: string): string {
  if (!url || !url.includes('/static/')) return ''
  if (!/\.(mp4|webm|mov)$/i.test(url)) return ''
  return url.replace(/\.[^./]+$/, '_poster.jpg')
}
