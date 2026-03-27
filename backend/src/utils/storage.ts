/**
 * 文件存储工具 — 下载远程文件到本地
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_ROOT = process.env.STORAGE_PATH || path.resolve(__dirname, '../../../data/static')

/**
 * 下载远程文件到本地存储
 */
export async function downloadFile(url: string, subDir: string): Promise<string> {
  const dir = path.join(STORAGE_ROOT, subDir)
  fs.mkdirSync(dir, { recursive: true })

  const ext = getExtFromUrl(url)
  const filename = `${uuid()}${ext}`
  const filePath = path.join(dir, filename)

  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)

  const buffer = Buffer.from(await resp.arrayBuffer())
  fs.writeFileSync(filePath, buffer)

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

/**
 * 获取本地文件的绝对路径
 */
export function getAbsolutePath(relativePath: string): string {
  if (relativePath.startsWith('static/')) {
    return path.join(STORAGE_ROOT, '..', relativePath)
  }
  return path.join(STORAGE_ROOT, relativePath)
}
