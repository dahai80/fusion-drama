import { Hono } from 'hono'
import { success, badRequest } from '../utils/response.js'
import { saveUploadedFile, generateImageThumb } from '../utils/storage.js'
import sharp from 'sharp'

const app = new Hono()

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const IMAGE_MAX = 10 * 1024 * 1024 // 10MB

const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm', '.m4v'])
const VIDEO_MIME = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'])
const VIDEO_MAX = 50 * 1024 * 1024 // 50MB

const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac'])
const AUDIO_MIME = new Set(['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/aac'])
const AUDIO_MAX = 20 * 1024 * 1024 // 20MB

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

// Images also go through a whitelist + size cap: html/svg written to disk and served same-origin = stored XSS
async function saveImageUpload(c: any) {
  const body = await c.req.parseBody()
  const file = body['file']
  if (!file || !(file instanceof File)) {
    return badRequest(c, 'file is required')
  }
  const ext = extOf(file.name)
  const mimeKnown = file.type && file.type !== 'application/octet-stream'
  if (!IMAGE_EXT.has(ext) || (mimeKnown && !IMAGE_MIME.has(file.type))) {
    return badRequest(c, `Only ${Array.from(IMAGE_EXT).join('/')} image files are supported`)
  }
  // Validate file.size before buffering, to avoid eating memory first and rejecting later
  if (file.size > IMAGE_MAX) {
    return badRequest(c, `Image file must not exceed ${Math.round(IMAGE_MAX / 1024 / 1024)}MB`)
  }
  // B5: sharp decode validation + re-encode — MIME/extension can be forged; "images" that fail
  // decoding (polyglot/hidden html) are rejected outright; png/jpeg/webp re-encoding strips all
  // metadata, gif is only validated (animation preserved)
  let raw = await file.arrayBuffer()
  try {
    const buf = Buffer.from(raw)
    const meta = await sharp(buf).metadata()
    if (!meta.format || !['jpeg', 'png', 'webp', 'gif'].includes(meta.format)) {
      return badRequest(c, 'Unsupported image format')
    }
    if (meta.format !== 'gif') {
      const re = await sharp(buf).toFormat(meta.format as any).toBuffer()
      raw = re.buffer.slice(re.byteOffset, re.byteOffset + re.byteLength) as ArrayBuffer
    }
  } catch {
    return badRequest(c, 'Image file is corrupted or format mismatched')
  }
  const path = await saveUploadedFile(raw, 'uploads', file.name)
  // Generate the list-page thumbnail synchronously so uploads and generated images share the same display pipeline (failure does not affect the upload result)
  await generateImageThumb(path)
  return success(c, { url: `/${path}`, path })
}

async function saveMediaUpload(
  c: any,
  kind: 'video' | 'audio',
  allowedExt: Set<string>,
  allowedMime: Set<string>,
  maxBytes: number,
) {
  const body = await c.req.parseBody()
  const file = body['file']
  if (!file || !(file instanceof File)) {
    return badRequest(c, 'file is required')
  }
  const label = kind === 'video' ? 'video' : 'audio'
  const ext = extOf(file.name)
  // MIME can be forged; extension is the fallback. Empty / octet-stream is treated as unknown and validated by extension only
  const mimeKnown = file.type && file.type !== 'application/octet-stream'
  if (!allowedExt.has(ext) || (mimeKnown && !allowedMime.has(file.type))) {
    return badRequest(c, `Only ${Array.from(allowedExt).join('/')} ${label} files are supported`)
  }
  // Validate file.size before buffering
  if (file.size > maxBytes) {
    return badRequest(c, `${label} file must not exceed ${Math.round(maxBytes / 1024 / 1024)}MB`)
  }
  const buffer = await file.arrayBuffer()
  const path = await saveUploadedFile(new Uint8Array(buffer).buffer as ArrayBuffer, 'uploads', file.name)
  return success(c, { url: `/${path}`, path })
}

// POST /upload/image
app.post('/image', async (c) => saveImageUpload(c))

// POST /upload/video — reference video upload (for Seedance multimodal reference)
app.post('/video', async (c) => saveMediaUpload(c, 'video', VIDEO_EXT, VIDEO_MIME, VIDEO_MAX))

// POST /upload/audio — reference audio upload (for Seedance multimodal reference)
app.post('/audio', async (c) => saveMediaUpload(c, 'audio', AUDIO_EXT, AUDIO_MIME, AUDIO_MAX))

export default app
