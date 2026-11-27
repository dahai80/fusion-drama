/**
 * esbuild bundling of the backend — backend/src -> desktop/build/backend.mjs (single-file ESM)
 *
 * - format esm: the backend's top-level await initDb() requires ESM
 * - external four-pack: sharp / better-sqlite3 (native modules, rebuilt by electron-builder
 *   against the Electron ABI and asarUnpacked), ffmpeg-static / ffprobe-static (binaries
 *   downloaded by postinstall; ffmpeg.ts loads them via createRequire at runtime, so they
 *   cannot be statically bundled)
 * - banner injects createRequire: externals resolve via require inside the ESM output to
 *   desktop/node_modules (the copy sharing the main app's ABI)
 */
import { build } from 'esbuild'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: [path.resolve(__dirname, '../../backend/src/index.ts')],
  outfile: path.resolve(__dirname, '../build/backend.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  external: ['sharp', 'better-sqlite3', 'ffmpeg-static', 'ffprobe-static', '@huggingface/transformers', 'onnxruntime-node', 'onnxruntime-web', '@huggingface/tokenizers'],
  banner: {
    // esbuild's CJS->ESM conversion does not shim __dirname/__filename/require (fluent-ffmpeg and
    // other deps), so inject them at the top of the output; __dirname points at build/, affecting
    // only relative paths in unused modules such as presets
    js: [
      `import { createRequire as __hbCreateRequire } from 'module'`,
      `import __hbPath from 'path'`,
      `import { fileURLToPath as __hbFileURLToPath } from 'url'`,
      `const require = __hbCreateRequire(import.meta.url)`,
      // var on purpose: esbuild also emits var __filename for some CJS deps; duplicate declaration stays legal
      `var __filename = __hbFileURLToPath(import.meta.url)`,
      `var __dirname = __hbPath.dirname(__filename)`,
    ].join('\n'),
  },
  logLevel: 'info',
})
