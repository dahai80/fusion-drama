/**
 * 文件存储工具 — 下载远程文件到本地
 */
import fs from 'fs'
import path from 'path'
import net from 'net'
import dns from 'dns'
import sharp from 'sharp'
import { v4 as uuid } from 'uuid'
import { STORAGE_ROOT } from './paths.js'

/**
 * 下载远程文件到本地存储
 */
export async function downloadFile(url: string, subDir: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })

  // data URI（如本地模型同步返回的 data:video/mp4;base64,...）直接解码落盘
  if (url.startsWith('data:')) {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(url)
    if (!match) throw new Error('Unsupported data URI (only base64 is supported)')
    const ext = mimeTypeExt(match[1]) || '.bin'
    const filename = `${uuid()}${ext}`
    const filePath = path.join(dir, filename)
    fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'))
    return `static/${subDir}/${filename}`
  }

  const ext = getExtFromUrl(url)
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  // 带超时 + 流式落盘：无超时的 fetch 会在 GPU 串行锁内无限挂起，
  // arrayBuffer 全量缓冲会把 37MB+ 视频整段拉进内存
  const resp = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) })
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
  if (!resp.body) throw new Error('Download failed: empty body')

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

  // 返回相对路径（供 API 返回给前端）
  return `static/${subDir}/${filename}`
}

/**
 * 保存上传的文件
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

/** 常见 MIME 类型 → 文件扩展名（data URI 落盘用） */
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
 * 获取本地文件的绝对路径 — 强制包含在存储根内，拒绝路径穿越
 * （path.join 会静默归一化 `..`，客户端可控的相对路径必须 resolve 后校验）
 */
export function getAbsolutePath(relativePath: string): string {
  if (relativePath.startsWith('static/')) {
    return path.join(STORAGE_ROOT, '..', relativePath)
  }
  return path.join(STORAGE_ROOT, relativePath)
}

/** 同 getAbsolutePath，但 resolve 后断言结果落在数据根内，穿越即抛错 */
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
 * 保存 Base64 编码的图片数据到本地存储
 * 用于 Gemini 等只返回 base64 数据的厂商
 */
export async function saveBase64Image(base64Data: string, mimeType: string, subDir: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })

  // 从 mimeType 推断文件扩展名
  const ext = mimeTypeToExt(mimeType)
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  const buffer = Buffer.from(base64Data, 'base64')
  fs.writeFileSync(filePath, buffer)

  return `static/${subDir}/${filename}`
}

/** 由图片相对路径推导缩略图路径：static/images/x.png → static/images/x_thumb.webp */
export function thumbPathFor(relativePath: string): string {
  return relativePath.replace(/\.[^./]+$/, '_thumb.webp')
}

/**
 * 为已落盘图片生成列表页缩略图（宽 400 WebP，与原图同目录）。
 * 失败（文件损坏/格式异常等）返回 null，不阻断主流程。
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
    console.warn(`[storage] 缩略图生成失败 ${relativePath}:`, (err as Error).message)
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
 * 下载远程图片并压缩为 data URL（远程参考图归一化，供 multipart/base64 上传类厂商使用）
 * 内网/链路本地地址一律拒绝 — 客户端可控 URL 的服务端 fetch 是 SSRF 原语
 */
export async function fetchImageAsCompressedDataUrl(
  url: string,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
  } = {},
): Promise<string> {
  assertPublicHttpUrl(url)
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!resp.ok) throw new Error(`下载参考图失败: HTTP ${resp.status}`)
  return compressImageAsDataUrl(Buffer.from(await resp.arrayBuffer()), options)
}

/** SSRF 防护：仅允许 http(s)，且解析出的全部地址不在私网/链路本地/回环段 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  const u = new URL(rawUrl)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`Unsupported URL scheme: ${u.protocol}`)
  }
  const hostname = u.hostname
  // 字面量 IP 直接判段；域名解析后逐地址判段（防 DNS rebinding 首跳）
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

/** sharp 输入 → 压缩 JPEG data URL（本地路径与远程下载共享同一压缩管线） */
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
