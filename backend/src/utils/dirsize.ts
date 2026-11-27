/**
 * Data directory usage stats + free disk space
 *
 * - dirUsage: a single async recursive walk (fs.promises, does not block the event
 *   loop), bucketed by relative path
 * - Database files (fusion.sqlite3/-wal/-shm) are not double-counted in the walk;
 *   they are stat'ed separately (in server mode with STORAGE_PATH override,
 *   SQLITE_PATH may live outside the data root)
 */
import type { Dirent } from 'fs'
import fsp from 'fs/promises'
import path from 'path'

export interface UsageBuckets {
  db: number
  images: number
  videos: number
  merged: number
  uploads: number
  temp: number
  other: number
  total: number
}

const DB_FILE_BASE = 'fusion.sqlite3'

/** Recursive walk, invoking the callback for each regular file (full path + size); unreadable dirs / file races are silently skipped */
async function walkFiles(dir: string, onFile: (filePath: string, size: number) => void): Promise<void> {
  let entries: Dirent[]
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await walkFiles(full, onFile)
    } else if (entry.isFile()) {
      try {
        const st = await fsp.stat(full)
        onFile(full, st.size)
      } catch { /* races like the file disappearing mid-walk are ignored */ }
    }
  }
}

/** Stats data directory usage (bucketed by purpose); db bucket = SQLITE_PATH main db + -wal/-shm files */
export async function dirUsage(dataRoot: string, sqlitePath: string): Promise<UsageBuckets> {
  const usage: UsageBuckets = { db: 0, images: 0, videos: 0, merged: 0, uploads: 0, temp: 0, other: 0, total: 0 }
  const add = (bucket: keyof UsageBuckets, size: number) => {
    usage[bucket] += size
    usage.total += size
  }

  // db bucket: stat the three files directly (regardless of whether they are inside dataRoot; the walk skips them to avoid double counting)
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      const st = await fsp.stat(sqlitePath + suffix)
      if (st.isFile()) add('db', st.size)
    } catch { /* file missing (e.g. -wal absent when WAL is off) */ }
  }

  await walkFiles(dataRoot, (filePath, size) => {
    const rel = path.relative(dataRoot, filePath)
    if (rel === DB_FILE_BASE || rel.startsWith(DB_FILE_BASE + '-')) return // already counted in the db bucket separately
    const parts = rel.split(path.sep)
    if (parts[0] === 'static' && parts.length >= 2) {
      const sub = parts[1]
      if (sub === 'images' || sub === 'videos' || sub === 'merged' || sub === 'uploads' || sub === 'temp') {
        add(sub, size)
        return
      }
    }
    add('other', size)
  })
  return usage
}

/** Free bytes on the volume hosting the target directory; returns null when statfs is unavailable (caller skips the space check) */
export async function volumeFreeBytes(dir: string): Promise<number | null> {
  try {
    const st = await fsp.statfs(dir)
    return st.bavail * st.bsize
  } catch {
    return null
  }
}
