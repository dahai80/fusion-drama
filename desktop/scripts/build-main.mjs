/**
 * esbuild 打包 Electron 主进程 — desktop/src/main.ts → desktop/dist/main.js
 */
import { build } from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: [path.resolve(__dirname, '../src/main.ts')],
  outfile: path.resolve(__dirname, '../dist/main.js'),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
})
