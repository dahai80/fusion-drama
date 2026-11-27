/**
 * Unified data directory resolution — the single path anchor for the whole project
 *
 * dev: anchored at the repo root data/ (inferred relative to __dirname; src and tsc
 * output sit at the same depth).
 * Electron desktop: the main process injects FUSION_DATA_DIR pointing at a writable
 * userData directory (relative __dirname inference is unusable inside the packaged
 * asar; write paths must land outside the bundle).
 *
 * STORAGE_PATH semantics unchanged: only overrides the static storage root; when
 * FUSION_DATA_DIR is not injected, its parent directory is the data root, preserving
 * the existing getAbsolutePath('static/...') behavior.
 */
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// src/utils → three levels up is the repo root
const repoRoot = path.resolve(__dirname, '../../..')

export const DATA_ROOT = process.env.FUSION_DATA_DIR
  ?? (process.env.STORAGE_PATH
    ? path.dirname(path.resolve(process.env.STORAGE_PATH))
    : path.join(repoRoot, 'data'))

export const STORAGE_ROOT = process.env.STORAGE_PATH ?? path.join(DATA_ROOT, 'static')
