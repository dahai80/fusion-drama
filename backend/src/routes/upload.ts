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

// 图片同样走白名单 + 大小上限：html/svg 落盘并同源服务 = stored XSS
async function saveImageUpload(c: any) {
  const body = await c.req.parseBody()
  const file = body['file']
  if (!file || !(file instanceof File)) {
    return badRequest(c, '文件必填')
  }
  const ext = extOf(file.name)
  const mimeKnown = file.type && file.type !== 'application/octet-stream'
  if (!IMAGE_EXT.has(ext) || (mimeKnown && !IMAGE_MIME.has(file.type))) {
    return badRequest(c, `仅支持 ${Array.from(IMAGE_EXT).join('/')} 格式的图片文件`)
  }
  // file.size 在缓冲前校验，避免先吃满内存再拒绝
  if (file.size > IMAGE_MAX) {
    return badRequest(c, `图片文件大小不能超过 ${Math.round(IMAGE_MAX / 1024 / 1024)}MB`)
  }
  // B5: sharp 解码校验 + 重编码——MIME/扩展名可伪造，解码不过的"图片"（polyglot/
  // html 夹带）直接拒收；png/jpeg/webp 重编码剥掉一切元数据，gif 仅校验（保动画）
  let raw = await file.arrayBuffer()
  try {
    const buf = Buffer.from(raw)
    const meta = await sharp(buf).metadata()
    if (!meta.format || !['jpeg', 'png', 'webp', 'gif'].includes(meta.format)) {
      return badRequest(c, '不支持的图片格式')
    }
    if (meta.format !== 'gif') {
      const re = await sharp(buf).toFormat(meta.format as any).toBuffer()
      raw = re.buffer.slice(re.byteOffset, re.byteOffset + re.byteLength) as ArrayBuffer
    }
  } catch {
    return badRequest(c, '图片文件已损坏或格式不符')
  }
  const path = await saveUploadedFile(raw, 'uploads', file.name)
  // 同步生成列表页缩略图，上传图与生图走同一套展示链路（失败不影响上传结果）
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
    return badRequest(c, '文件必填')
  }
  const label = kind === 'video' ? '视频' : '音频'
  const ext = extOf(file.name)
  // MIME 可伪造，扩展名兜底；空 / octet-stream 视为未知类型，仅按扩展名校验
  const mimeKnown = file.type && file.type !== 'application/octet-stream'
  if (!allowedExt.has(ext) || (mimeKnown && !allowedMime.has(file.type))) {
    return badRequest(c, `仅支持 ${Array.from(allowedExt).join('/')} 格式的${label}文件`)
  }
  // file.size 在缓冲前校验
  if (file.size > maxBytes) {
    return badRequest(c, `${label}文件大小不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB`)
  }
  const buffer = await file.arrayBuffer()
  const path = await saveUploadedFile(new Uint8Array(buffer).buffer as ArrayBuffer, 'uploads', file.name)
  return success(c, { url: `/${path}`, path })
}

// POST /upload/image
app.post('/image', async (c) => saveImageUpload(c))

// POST /upload/video — 参考视频上传（Seedance 多模态参考用）
app.post('/video', async (c) => saveMediaUpload(c, 'video', VIDEO_EXT, VIDEO_MIME, VIDEO_MAX))

// POST /upload/audio — 参考音频上传（Seedance 多模态参考用）
app.post('/audio', async (c) => saveMediaUpload(c, 'audio', AUDIO_EXT, AUDIO_MIME, AUDIO_MAX))

export default app
