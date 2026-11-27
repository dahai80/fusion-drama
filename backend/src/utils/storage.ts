/**
 * File storage utilities — downloading remote files to local storage
 */
import fs from 'fs'
import path from 'path'
import net from 'net'
import dns from 'dns'
import sharp from 'sharp'
import { v4 as uuid } from 'uuid'
import { STORAGE_ROOT } from './paths.js'

/**
 * Downloads a remote file to local storage
 */
export async function downloadFile(
  url: string,
  subDir: string,
  authHeaders?: Record<string, string>,
  opts?: { allowLoopback?: boolean },
): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })

  // data URI (e.g. data:video/mp4;base64,... synchronously returned by local models) is decoded straight to disk
  // Audit 1107 F-10: cap decoded size — a hostile/huge data URI must not buffer
  // unbounded bytes into memory (decoded cap mirrors MAX_DOWNLOAD_BYTES below)
  if (url.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(url)
    if (!match) throw new Error('Unsupported data URI (only base64 is supported)')
    const MAX_DATA_URI_DECODED = 512 * 1024 * 1024
    const decodedLen = Math.floor(match[2].length * 3 / 4)
    if (decodedLen > MAX_DATA_URI_DECODED) {
      throw new Error(`data URI exceeds ${Math.round(MAX_DATA_URI_DECODED / 1024 / 1024)}MB cap`)
    }
    const ext = mimeTypeExt(match[1]) || '.bin'
    const filename = `${uuid()}${ext}`
    const filePath = path.join(dir, filename)
    fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'))
    return `static/${subDir}/${filename}`
  }

  // Audit 1107 F-10: SSRF gate — result URLs come from provider responses
  // (incl. user-configured custom providers); the server must not fetch
  // private/link-local/loopback addresses. Cloud providers return public URLs;
  // the fusion local engine returns data URIs, except the #1254 job-output
  // handover whose URL is built from the admin-configured baseUrl — that path
  // passes allowLoopback explicitly.
  if (opts?.allowLoopback && isLoopbackUrl(url)) {
    // admin-configured local engine, fetch allowed
  } else {
    await assertPublicHttpUrl(url)
  }

  // Timeout + streaming to disk: a fetch without a timeout would hang forever inside
  // the GPU serial lock, and buffering the whole arrayBuffer pulls a 37MB+ video
  // entirely into memory
  const resp = await fetch(url, { headers: authHeaders, signal: AbortSignal.timeout(5 * 60_000) })
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
  if (!resp.body) throw new Error('Download failed: empty body')

  // Content-Type takes priority: some artifact endpoint URLs have no extension
  // (fusion-mlx /jobs/{id}/output/0 is a bare FileResponse path), URL inference
  // would fall back to .bin
  const ext = extFromContentType(resp.headers.get('content-type')) || getExtFromUrl(url)
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  const MAX_DOWNLOAD_BYTES = 512 * 1024 * 1024
  let received = 0
  const reader = (resp.body as ReadableStream<Uint8Array>).getReader()
  const fd = fs.openSync(filePath, 'w')
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > MAX_DOWNLOAD_BYTES) throw new Error(`Download exceeds ${Math.round(MAX_DOWNLOAD_BYTES / 1024 / 1024)}MB cap`)
      fs.writeSync(fd, value)
    }
  } finally {
    fs.closeSync(fd)
    reader.releaseLock()
  }

  // Returns the relative path (for the API to return to the frontend)
  return `static/${subDir}/${filename}`
}

/**
 * Saves an uploaded file
 */
export async function saveUploadedFile(data: ArrayBuffer, subDir: string, originalName: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })

  const ext = path.extname(originalName) || '.bin'
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  fs.writeFileSync(filePath, Buffer.from(data))
  return `static/${subDir}/${filename}`
}

function getExtFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = path.extname(pathname)
    if (ext && ext.length <= 5) return ext
  } catch {}
  return '.bin'
}

/** Response Content-Type → extension (fallback for artifact endpoints whose URL has no extension) */
function extFromContentType(contentType: string | null): string | null {
  if (!contentType) return null
  const mime = contentType.split(';')[0].trim().toLowerCase()
  return mimeTypeExt(mime)
}

/** Common MIME type → file extension (used for writing data URIs to disk) */
function mimeTypeExt(mime: string): string | null {
  const map: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
  }
  return map[mime.toLowerCase()] ?? null
}

/**
 * Gets the absolute path of a local file — forced to stay inside the storage root,
 * rejecting path traversal
 * (path.join silently normalizes `..`; client-controlled relative paths must be
 * resolved first and then validated)
 */
/** R2: deletes a stored artifact (jail assertion prevents path escape). Business tables may still reference the same path; callers must confirm no references first */
export function deleteStoredFile(relativePath: string): boolean {
  try {
    const root = path.resolve(STORAGE_ROOT)
    const abs = path.resolve(root, relativePath)
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      console.warn(`[storage] refuse to delete outside STORAGE_ROOT: ${relativePath}`)
      return false
    }
    fs.rmSync(abs, { force: true })
    return true
  } catch (err: any) {
    console.warn(`[storage] delete failed: ${relativePath}: ${err?.message}`)
    return false
  }
}

export function getAbsolutePath(relativePath: string): string {
  if (relativePath.startsWith('static/')) {
    return path.join(STORAGE_ROOT, '..', relativePath)
  }
  return path.join(STORAGE_ROOT, relativePath)
}

/** Same as getAbsolutePath, but asserts after resolve that the result stays inside the data root, throwing on traversal */
export function getContainedAbsolutePath(relativePath: string): string {
  const abs = getAbsolutePath(relativePath)
  const resolved = path.resolve(abs)
  const dataRoot = path.resolve(STORAGE_ROOT, '..')
  if (!resolved.startsWith(dataRoot + path.sep)) {
    throw new Error(`Path escapes data root: ${relativePath}`)
  }
  return resolved
}

/**
 * Saves Base64-encoded image data to local storage
 * Used for vendors like Gemini that only return base64 data
 */
export async function saveBase64Image(base64Data: string, mimeType: string, subDir: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })

  // Infers the file extension from mimeType
  const ext = mimeTypeToExt(mimeType)
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  const buffer = Buffer.from(base64Data, 'base64')
  fs.writeFileSync(filePath, buffer)

  return `static/${subDir}/${filename}`
}

/** Derives the thumbnail path from an image's relative path: static/images/x.png → static/images/x_thumb.webp */
export function thumbPathFor(relativePath: string): string {
  return relativePath.replace(/\.[^./]+$/, '_thumb.webp')
}

/**
 * Generates a list-page thumbnail for an already-stored image (width 400 WebP, same
 * directory as the original).
 * Returns null on failure (corrupted file / unsupported format etc.) without blocking the main flow.
 */
export async function generateImageThumb(relativePath: string): Promise<string | null> {
  try {
    const thumbRel = thumbPathFor(relativePath)
    await sharp(getContainedAbsolutePath(relativePath))
      .rotate()
      .resize({ width: 400, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(getAbsolutePath(thumbRel))
    return thumbRel
  } catch (err) {
    console.warn(`[storage] thumbnail generation failed ${relativePath}:`, (err as Error).message)
    return null
  }
}

export function readImageAsDataUrl(relativePath: string): string {
  const filePath = getContainedAbsolutePath(relativePath)
  const buffer = fs.readFileSync(filePath)
  const ext = path.extname(filePath).toLowerCase()
  const mimeType = extToMimeType(ext)
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export async function readImageAsCompressedDataUrl(
  relativePath: string,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
  } = {},
): Promise<string> {
  return compressImageAsDataUrl(getContainedAbsolutePath(relativePath), options)
}

/**
 * Downloads a remote image and compresses it into a data URL (normalizes remote
 * reference images, used for multipart/base64 upload style vendors)
 * Private/link-local addresses are always refused — a server-side fetch of a
 * client-controlled URL is an SSRF primitive
 */
// B21: LRU cache of compressed reference image results — re-downloading and re-compressing
// the same set of reference images across tasks with sharp is pure waste (uuid-named
// /static content is immutable; cache key = url + compression params). Only successful
// results are cached; failures are not.
const REF_IMAGE_CACHE_MAX = 32
const refImageCache = new Map<string, string>()

export async function fetchImageAsCompressedDataUrl(
  url: string,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
  } = {},
): Promise<string> {
  const cacheKey = `${url}|${options.maxWidth ?? 768}|${options.maxHeight ?? 768}|${options.quality ?? 68}`
  const cached = refImageCache.get(cacheKey)
  if (cached) {
    // Map insertion order acts as LRU: re-insert at the tail on hit to refresh
    refImageCache.delete(cacheKey)
    refImageCache.set(cacheKey, cached)
    return cached
  }
  assertPublicHttpUrl(url)
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!resp.ok) throw new Error(`Failed to download reference image: HTTP ${resp.status}`)
  // P5: 20MB response body cap — Content-Length precheck + recheck after actually reading, preventing oversized responses from blowing up memory during decode
  const REF_FETCH_MAX = 20 * 1024 * 1024
  const declared = Number(resp.headers.get('content-length') || 0)
  if (declared > REF_FETCH_MAX) throw new Error(`Reference image too large: ${Math.round(declared / 1024 / 1024)}MB`)
  const buf = Buffer.from(await resp.arrayBuffer())
  if (buf.length > REF_FETCH_MAX) throw new Error(`Reference image too large: ${Math.round(buf.length / 1024 / 1024)}MB`)
  const dataUrl = await compressImageAsDataUrl(buf, options)
  refImageCache.set(cacheKey, dataUrl)
  while (refImageCache.size > REF_IMAGE_CACHE_MAX) {
    refImageCache.delete(refImageCache.keys().next().value as string)
  }
  return dataUrl
}

/** SSRF guard: only http(s) allowed, and every resolved address must not fall in private/link-local/loopback ranges */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  const u = new URL(rawUrl)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme: ${u.protocol}`)
  }
  const hostname = u.hostname
  // IP literals are range-checked directly; domains are resolved and each address range-checked (guards the first hop of DNS rebinding)
  const addresses = isIpLiteral(hostname)
    ? [hostname]
    : await dns.promises.lookup(hostname, { all: true }).then(rs => rs.map(r => r.address))
  if (!addresses.length) throw new Error(`Cannot resolve host: ${hostname}`)
  for (const addr of addresses) {
    if (isPrivateAddress(addr)) {
      throw new Error(`Refusing to fetch private address: ${addr}`)
    }
  }
}

function isIpLiteral(hostname: string): boolean {
  return net.isIPv4(hostname) || net.isIPv6(hostname)
}

/** Loopback-only check for the allowLoopback opt-out (never covers LAN ranges) */
function isLoopbackUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    return u.protocol === 'http:' || u.protocol === 'https:'
      ? ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(u.hostname)
      : false
  } catch {
    return false
  }
}

function isPrivateAddress(addr: string): boolean {
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split('.').map(Number)
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
    return false
  }
  const lower = addr.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) return true
  // IPv4-mapped IPv6
  if (lower.startsWith('::ffff:')) return isPrivateAddress(lower.slice(7))
  return false
}

/** sharp input → compressed JPEG data URL (local paths and remote downloads share the same compression pipeline) */
async function compressImageAsDataUrl(
  input: string | Buffer,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
  } = {},
): Promise<string> {
  const maxWidth = options.maxWidth ?? 768
  const maxHeight = options.maxHeight ?? 768
  const quality = options.quality ?? 68

  const resized = sharp(input).rotate().resize({
    width: maxWidth,
    height: maxHeight,
    fit: 'inside',
    withoutEnlargement: true,
  })
  const metadata = await resized.metadata()
  const output = metadata.hasAlpha
    ? await resized.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }).toBuffer()
    : await resized.jpeg({ quality, mozjpeg: true }).toBuffer()
  const mimeType = 'image/jpeg'
  return `data:${mimeType};base64,${output.toString('base64')}`
}

export function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  return {
    mimeType: match[1],
    data: match[2],
  }
}

function mimeTypeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
  }
  return map[mimeType] || '.png'
}

function extToMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  }
  return map[ext] || 'image/png'
}
