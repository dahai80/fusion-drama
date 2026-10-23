import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('rag_chunks table shipped in migration v7, drizzle schema and sqlite-schema', () => {
    const migrations = read('src/db/migrations.ts')
    assert.match(migrations, /version: 7, name: 'rag-chunks'/)
    assert.match(migrations, /CREATE TABLE IF NOT EXISTS rag_chunks/)

    const schema = read('src/db/schema.ts')
    assert.match(schema, /export const ragChunks = sqliteTable\('rag_chunks'/)

    const sqliteSchema = read('src/db/sqlite-schema.ts')
    assert.match(sqliteSchema, /CREATE TABLE IF NOT EXISTS rag_chunks/)
})

test('rag service embeds on CPU via mirror with retries and fails open', () => {
    const rag = read('src/services/rag.ts')
    // bge-small ONNX CPU 嵌入：不占 GPU，与 fusion-mlx 视频模型无争用
    assert.match(rag, /bge-small-zh-v1\.5/)
    assert.match(rag, /device: 'cpu'/)
    assert.match(rag, /dtype: 'q8'/)
    // 模型走 HF 镜像 + 本地缓存目录
    assert.match(rag, /HF_MIRROR/)
    assert.match(rag, /hf-mirror\.com/)
    assert.match(rag, /models', 'embeddings/)
    // 镜像站偶发超时：加载重试 3 次
    assert.match(rag, /attempt <= 3/)
    // 检索失败静默降级（fail-open）：返回 null 不抛错，Agent 主流程不受影响
    assert.match(rag, /search-failed/)
    assert.match(rag, /return null/)
})

test('agent chat injects rag context into user message behind enabled toggle', () => {
    const agent = read('src/routes/agent.ts')
    assert.match(agent, /isRagEnabled\(\)/)
    assert.match(agent, /buildRagContextBlock\(drama_id, message\)/)
    assert.match(agent, /ragBlock \? `\$\{ragBlock\}\\n\\n\$\{message\}` : message/)
    // 注入失败仅告警不阻断
    assert.match(agent, /rag-context-failed/)

    const settings = read('src/services/app-settings.ts')
    assert.match(settings, /export function isRagEnabled/)
    assert.match(settings, /export function setRagEnabled/)
})

test('script save triggers async reindex; rag routes mounted with index-all', () => {
    const episodes = read('src/routes/episodes.ts')
    assert.match(episodes, /isRagEnabled\(\)/)
    assert.match(episodes, /indexDrama\(ep\.dramaId\)/)

    const ragRoutes = read('src/routes/rag.ts')
    assert.match(ragRoutes, /app\.get\('\/status'/)
    assert.match(ragRoutes, /app\.put\('\/enabled'/)
    assert.match(ragRoutes, /app\.post\('\/index\/:dramaId'/)
    assert.match(ragRoutes, /app\.post\('\/index-all'/)
    assert.match(ragRoutes, /app\.get\('\/search'/)

    const index = read('src/index.ts')
    assert.match(index, /api\.route\('\/rag', rag\)/)
})

test('desktop packaging keeps transformers native modules external and unpacked', () => {
    const buildBackend = read('../desktop/scripts/build-backend.mjs')
    assert.match(buildBackend, /'@huggingface\/transformers'/)
    assert.match(buildBackend, /'onnxruntime-node'/)

    const builderYml = read('../desktop/electron-builder.yml')
    assert.match(builderYml, /node_modules\/onnxruntime-node\//)
    assert.match(builderYml, /node_modules\/@huggingface\/tokenizers\//)

    const pkg = read('../desktop/package.json')
    assert.match(pkg, /"@huggingface\/transformers"/)
})
