/**
 * electron-builder afterPack hook — fixes the Windows bundle's better-sqlite3 native module.
 *
 * Background: dist:win cross-packages on mac; @electron/rebuild/prebuild-install download
 * prebuilds for the host platform, so the win bundle's build/Release/better_sqlite3.node is
 * actually a Mach-O (mac binary), which fails to dlopen on Windows → backend exit code 1.
 *
 * Fix: after packaging (once win-unpacked exists, before NSIS wrapping) overwrite it with the
 * official win32-x64 prebuilt .node. The prebuilt file is cached at
 * build/win-bin/better_sqlite3.node (same caching approach as ffmpeg.exe; a better-sqlite3 or
 * Electron major upgrade requires re-downloading the matching ABI:
 * https://github.com/WiseLibs/better-sqlite3/releases)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WIN_BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'win-bin', 'better_sqlite3.node')

export default async function afterPack(context) {
  // electron-builder only warns (does not fail) on missing extraResources (this once shipped
  // a whole bundle without ffmpeg); hard-validate here: every platform must have its own
  // ffmpeg/ffprobe
  const resourcesDir = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources')
  const exe = context.electronPlatformName === 'win32' ? '.exe' : ''
  for (const name of [`ffmpeg${exe}`, `ffprobe${exe}`]) {
    const p = path.join(resourcesDir, 'bin', name)
    if (!fs.existsSync(p)) throw new Error(`packaged output missing bin/${name} (check prepare-resources and the \${os} directory naming)`)
  }

  if (context.electronPlatformName !== 'win32') return
  if (!fs.existsSync(WIN_BIN)) {
    throw new Error(
      `win32 better-sqlite3 prebuilt missing: ${WIN_BIN}\n` +
      'download https://github.com/WiseLibs/better-sqlite3/releases/download/v12.11.1/' +
      'better-sqlite3-v12.11.1-electron-v136-win32-x64.tar.gz and place its build/Release/better_sqlite3.node at that path',
    )
  }
  const target = path.join(
    context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules',
    'better-sqlite3', 'build', 'Release', 'better_sqlite3.node',
  )
  if (!fs.existsSync(target)) throw new Error(`better_sqlite3.node to replace not found: ${target}`)
  fs.copyFileSync(WIN_BIN, target)
  // also clear the host-platform prebuilt leftovers (bindings won't hit them, but they waste space)
  fs.rmSync(path.join(path.dirname(path.dirname(path.dirname(target))), 'bin'), { recursive: true, force: true })
  console.log(`[after-pack] win32 better_sqlite3.node replaced with the PE binary (${(fs.statSync(target).size / 1024 / 1024).toFixed(1)}MB)`)
}
