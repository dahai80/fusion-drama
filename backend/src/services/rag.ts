/**
 * ONNX RAG — local vector retrieval, injects script/character/scene/prop context into agents
 *
 * Embedding model bge-small-zh-v1.5 (ONNX, CPU inference, onnxruntime-node);
 * the model is downloaded via the HF mirror (HF_MIRROR, default hf-mirror.com) to
 * DATA_ROOT/models/embeddings. CPU embeddings do not touch the GPU — no memory
 * contention with fusion-mlx's FLUX/LTX/H3.
 *
 * Retrieval failures (model missing / download failed / no index) always degrade
 * silently to no-context and never block the agent's main flow.
 */
import path from 'path'
import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { DATA_ROOT } from '../utils/paths.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

const EMBED_MODEL = 'Xenova/bge-small-zh-v1.5'
const EMBED_DIM = 512
const SCRIPT_CHUNK_SIZE = 700
const SCRIPT_CHUNK_OVERLAP = 100
const TOP_K = 5

// transformers.js lazy load: import only on first use (zero startup cost; desktop
// offline mode unaffected)
let extractorPromise: Promise<any> | null = null
// Most recent load failure reason (surfaced by the status endpoint so silent failures
// on weak networks have a visible root cause in the settings page)
let lastLoadError: string | null = null

async function getExtractor(): Promise<any> {
    if (!extractorPromise) {
        extractorPromise = (async () => {
            const { pipeline, env } = await import('@huggingface/transformers')
            // localize the model cache + download via the mirror site (hf.co is unreachable
            // on direct connections from CN networks)
            env.cacheDir = path.join(DATA_ROOT, 'models', 'embeddings')
            env.remoteHost = process.env.HF_MIRROR || 'https://hf-mirror.com'
            logTaskProgress('RAG', 'model-loading', { model: EMBED_MODEL, cacheDir: env.cacheDir })
            // mirror site occasionally hits connect timeouts (observed hf-mirror 10s undici
            // connect timeout); retry 3 times to mitigate; cached model files make no
            // network requests
            let extractor: any = null
            let lastErr: any = null
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    extractor = await pipeline('feature-extraction', EMBED_MODEL, {
                        dtype: 'q8',
                        device: 'cpu',
                    })
                    break
                } catch (err: any) {
                    lastErr = err
                    logTaskError('RAG', 'model-load-attempt-failed', { attempt, error: err.message })
                    if (attempt < 3) await new Promise(r => setTimeout(r, 10_000 * attempt))
                }
            }
            if (!extractor) throw lastErr
            lastLoadError = null
            logTaskSuccess('RAG', 'model-loaded', { model: EMBED_MODEL })
            return extractor
        })().catch(err => {
            // allow retry after a load failure (next call re-triggers loading), but log loudly
            extractorPromise = null
            lastLoadError = String(err?.message || err).slice(0, 300)
            throw err
        })
    }
    return extractorPromise
}

/** Whether RAG is ready (model successfully loaded at least once) — for the status endpoint, never triggers loading */
export function isRagModelLoaded(): boolean {
    return extractorPromise !== null
}

/** Embed an array of texts, returning L2-normalized vectors (bge family uses CLS pooling) */
async function embedTexts(texts: string[]): Promise<number[][]> {
    const extractor = await getExtractor()
    const out = await extractor(texts, { pooling: 'cls', normalize: true })
    const vectors: number[][] = []
    for (let i = 0; i < texts.length; i++) {
        const vec = Array.from(out[i].data as Float32Array)
        if (vec.length !== EMBED_DIM) throw new Error(`embedding dim ${vec.length} != ${EMBED_DIM}`)
        vectors.push(vec)
    }
    return vectors
}

interface ChunkInput {
    kind: 'script' | 'character' | 'scene' | 'prop'
    title: string | null
    content: string
}

/** Sliding-window chunking for scripts: short scripts stay whole; long ones use a 700-char window with 100-char overlap */
function chunkScript(script: string): string[] {
    const text = script.trim()
    if (!text) return []
    if (text.length <= SCRIPT_CHUNK_SIZE) return [text]
    const chunks: string[] = []
    for (let i = 0; i < text.length; i += SCRIPT_CHUNK_SIZE - SCRIPT_CHUNK_OVERLAP) {
        chunks.push(text.slice(i, i + SCRIPT_CHUNK_SIZE))
        if (i + SCRIPT_CHUNK_SIZE >= text.length) break
    }
    return chunks
}

/** Collect all retrievable content for one drama */
async function collectDramaChunks(dramaId: number): Promise<ChunkInput[]> {
    const chunks: ChunkInput[] = []

    const episodes = await db.select().from(schema.episodes)
        .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
    for (const ep of episodes) {
        const script = ep.scriptContent || ep.content || ''
        for (const piece of chunkScript(script)) {
            // i18n: user-facing — chunk labels feed the zh embedding model and agent context
            chunks.push({ kind: 'script', title: `第${ep.episodeNumber}集 ${ep.title}`, content: piece })
        }
    }

    const characters = await db.select().from(schema.characters)
        .where(and(eq(schema.characters.dramaId, dramaId), isNull(schema.characters.deletedAt)))
    for (const ch of characters) {
        const parts = [
            // i18n: user-facing — chunk labels feed the zh embedding model and agent context
            ch.role ? `角色定位：${ch.role}` : '',
            // i18n: user-facing — chunk labels feed the zh embedding model and agent context
            ch.description ? `简介：${ch.description}` : '',
            // i18n: user-facing — chunk labels feed the zh embedding model and agent context
            ch.appearance ? `外貌：${ch.appearance}` : '',
            // i18n: user-facing — chunk labels feed the zh embedding model and agent context
            ch.personality ? `性格：${ch.personality}` : '',
        ].filter(Boolean).join('\n')
        // i18n: user-facing — chunk labels feed the zh embedding model and agent context
        if (parts) chunks.push({ kind: 'character', title: ch.name, content: `角色「${ch.name}」\n${parts}` })
    }

    const scenes = await db.select().from(schema.scenes)
        .where(and(eq(schema.scenes.dramaId, dramaId), isNull(schema.scenes.deletedAt)))
    for (const sc of scenes) {
        const parts = [
            // i18n: user-facing — chunk labels feed the zh embedding model and agent context
            `地点：${sc.location}`,
            // i18n: user-facing — chunk labels feed the zh embedding model and agent context
            `时间：${sc.time}`,
            // i18n: user-facing — chunk labels feed the zh embedding model and agent context
            sc.lighting ? `光线：${sc.lighting}` : '',
            // i18n: user-facing — chunk labels feed the zh embedding model and agent context
            `画面：${sc.prompt}`,
        ].filter(Boolean).join('\n')
        // i18n: user-facing — chunk labels feed the zh embedding model and agent context
        chunks.push({ kind: 'scene', title: sc.location, content: `场景「${sc.location}」\n${parts}` })
    }

    const props = await db.select().from(schema.props)
        .where(and(eq(schema.props.dramaId, dramaId), isNull(schema.props.deletedAt)))
    for (const p of props) {
        const desc = p.description || ''
        // i18n: user-facing — chunk labels feed the zh embedding model and agent context
        if (desc) chunks.push({ kind: 'prop', title: p.name, content: `道具「${p.name}」\n${desc}` })
    }

    return chunks
}

/** Fully rebuild one drama's vector index (old index deleted first) */
export async function indexDrama(dramaId: number): Promise<number> {
    logTaskStart('RAG', 'index-drama', { dramaId })
    const chunks = await collectDramaChunks(dramaId)
    await db.delete(schema.ragChunks).where(eq(schema.ragChunks.dramaId, dramaId))
    if (chunks.length === 0) {
        logTaskProgress('RAG', 'index-drama-empty', { dramaId })
        return 0
    }
    // embed in batches (bge-small on CPU is stable up to 32 items per batch)
    const ts = now()
    const rows: any[] = []
    for (let i = 0; i < chunks.length; i += 32) {
        const batch = chunks.slice(i, i + 32)
        const vectors = await embedTexts(batch.map(c => c.content))
        batch.forEach((c, j) => rows.push({
            dramaId,
            kind: c.kind,
            title: c.title,
            content: c.content,
            embedding: JSON.stringify(vectors[j]),
            createdAt: ts,
        }))
    }
    await db.insert(schema.ragChunks).values(rows)
    logTaskSuccess('RAG', 'index-drama', { dramaId, chunks: rows.length })
    return rows.length
}

/** Auto-build the index when a drama has none but has script content (triggered on first agent chat, takes seconds) */
async function ensureIndexed(dramaId: number): Promise<void> {
    const existing = await db.select({ id: schema.ragChunks.id }).from(schema.ragChunks)
        .where(eq(schema.ragChunks.dramaId, dramaId)).limit(1)
    if (existing.length > 0) return
    const chunks = await collectDramaChunks(dramaId)
    if (chunks.length === 0) return
    logTaskProgress('RAG', 'auto-index-start', { dramaId, chunks: chunks.length })
    await indexDrama(dramaId)
}

function cosine(a: number[], b: number[]): number {
    let dot = 0
    for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
    return dot // both vectors are L2-normalized, so the dot product is the cosine
}

export interface RagHit {
    kind: string
    title: string | null
    content: string
    score: number
}

/** Retrieve the top-k relevant chunks; returns null on failure (callers degrade silently) */
export async function searchDrama(dramaId: number, query: string, topK = TOP_K): Promise<RagHit[] | null> {
    const q = query.trim()
    if (!q) return null
    try {
        await ensureIndexed(dramaId)
        const rows = await db.select().from(schema.ragChunks)
            .where(eq(schema.ragChunks.dramaId, dramaId))
        if (rows.length === 0) return null
        const [queryVec] = await embedTexts([q])
        const hits = rows
            .map(r => ({
                kind: r.kind,
                title: r.title,
                content: r.content,
                score: cosine(queryVec, JSON.parse(r.embedding)),
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
        logTaskProgress('RAG', 'search', { dramaId, hits: hits.length, top: Number(hits[0]?.score.toFixed(3)) })
        return hits
    } catch (err: any) {
        logTaskError('RAG', 'search-failed', { dramaId, error: err.message })
        return null
    }
}

/** Assemble the context block injected into the agent's user message; returns null when unavailable (message sent as-is) */
export async function buildRagContextBlock(dramaId: number, query: string): Promise<string | null> {
    const hits = await searchDrama(dramaId, query)
    if (!hits || hits.length === 0) return null
    const sections = hits.map(h => {
        const label = h.title ? `${h.kind} · ${h.title}` : h.kind
        return `【${label}】\n${h.content}`
    })
    // i18n: user-facing — LLM-facing context preamble, Chinese keeps agent behavior stable
    return `以下是从本项目资料库检索到的相关背景（供参考，与用户要求冲突时以用户要求为准）：\n\n${sections.join('\n\n')}`
}

/** Status endpoint payload: model load state + most recent load failure reason + per-drama index counts */
export async function ragStatus(): Promise<{
    model: string
    modelLoaded: boolean
    lastError: string | null
    totalChunks: number
    dramas: { dramaId: number; chunks: number }[]
}> {
    const rows = await db.select({ dramaId: schema.ragChunks.dramaId }).from(schema.ragChunks)
    const byDrama = new Map<number, number>()
    for (const r of rows) byDrama.set(r.dramaId, (byDrama.get(r.dramaId) || 0) + 1)
    return {
        model: EMBED_MODEL,
        modelLoaded: isRagModelLoaded(),
        lastError: lastLoadError,
        totalChunks: rows.length,
        dramas: [...byDrama.entries()].map(([dramaId, chunks]) => ({ dramaId, chunks })),
    }
}
