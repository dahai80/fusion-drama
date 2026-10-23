/**
 * ONNX RAG — 本地向量检索，给 Agent 注入剧本/角色/场景/道具上下文
 *
 * 嵌入模型 bge-small-zh-v1.5（ONNX，CPU 推理，onnxruntime-node），
 * 模型经 HF 镜像（HF_MIRROR，默认 hf-mirror.com）下载到 DATA_ROOT/models/embeddings。
 * CPU 嵌入不占 GPU —— 与 fusion-mlx 的 FLUX/LTX/H3 无内存争用。
 *
 * 检索失败（模型缺失/下载失败/无索引）一律静默降级为无上下文，不阻断 Agent 主流程。
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

// transformers.js 懒加载：首次用到才 import（启动零开销，桌面版离线时不受影响）
let extractorPromise: Promise<any> | null = null

async function getExtractor(): Promise<any> {
    if (!extractorPromise) {
        extractorPromise = (async () => {
            const { pipeline, env } = await import('@huggingface/transformers')
            // 模型缓存本地化 + 走镜像站下载（国内网络 hf.co 直连不可达）
            env.cacheDir = path.join(DATA_ROOT, 'models', 'embeddings')
            env.remoteHost = process.env.HF_MIRROR || 'https://hf-mirror.com'
            logTaskProgress('RAG', 'model-loading', { model: EMBED_MODEL, cacheDir: env.cacheDir })
            // 镜像站偶发连接超时（实测 hf-mirror 10s undici connect timeout），
            // 重试 3 次缓解；已缓存的模型文件不触发网络请求
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
            logTaskSuccess('RAG', 'model-loaded', { model: EMBED_MODEL })
            return extractor
        })().catch(err => {
            // 加载失败后允许重试（下次调用重新走加载），但必须大声记录
            extractorPromise = null
            throw err
        })
    }
    return extractorPromise
}

/** 是否已可用（模型已成功加载过）——状态接口用，不触发加载 */
export function isRagModelLoaded(): boolean {
    return extractorPromise !== null
}

/** 嵌入文本数组，返回 L2 归一化向量（bge 系列用 CLS pooling） */
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

/** 剧本按段落滑窗切块：短剧本整块，长剧本 700 字窗口 100 字重叠 */
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

/** 收集一个 drama 的全部可检索内容 */
async function collectDramaChunks(dramaId: number): Promise<ChunkInput[]> {
    const chunks: ChunkInput[] = []

    const episodes = await db.select().from(schema.episodes)
        .where(and(eq(schema.episodes.dramaId, dramaId), isNull(schema.episodes.deletedAt)))
    for (const ep of episodes) {
        const script = ep.scriptContent || ep.content || ''
        for (const piece of chunkScript(script)) {
            chunks.push({ kind: 'script', title: `第${ep.episodeNumber}集 ${ep.title}`, content: piece })
        }
    }

    const characters = await db.select().from(schema.characters)
        .where(and(eq(schema.characters.dramaId, dramaId), isNull(schema.characters.deletedAt)))
    for (const ch of characters) {
        const parts = [
            ch.role ? `角色定位：${ch.role}` : '',
            ch.description ? `简介：${ch.description}` : '',
            ch.appearance ? `外貌：${ch.appearance}` : '',
            ch.personality ? `性格：${ch.personality}` : '',
        ].filter(Boolean).join('\n')
        if (parts) chunks.push({ kind: 'character', title: ch.name, content: `角色「${ch.name}」\n${parts}` })
    }

    const scenes = await db.select().from(schema.scenes)
        .where(and(eq(schema.scenes.dramaId, dramaId), isNull(schema.scenes.deletedAt)))
    for (const sc of scenes) {
        const parts = [
            `地点：${sc.location}`,
            `时间：${sc.time}`,
            sc.lighting ? `光线：${sc.lighting}` : '',
            `画面：${sc.prompt}`,
        ].filter(Boolean).join('\n')
        chunks.push({ kind: 'scene', title: sc.location, content: `场景「${sc.location}」\n${parts}` })
    }

    const props = await db.select().from(schema.props)
        .where(and(eq(schema.props.dramaId, dramaId), isNull(schema.props.deletedAt)))
    for (const p of props) {
        const desc = p.description || ''
        if (desc) chunks.push({ kind: 'prop', title: p.name, content: `道具「${p.name}」\n${desc}` })
    }

    return chunks
}

/** 全量重建一个 drama 的向量索引（旧索引先删） */
export async function indexDrama(dramaId: number): Promise<number> {
    logTaskStart('RAG', 'index-drama', { dramaId })
    const chunks = await collectDramaChunks(dramaId)
    await db.delete(schema.ragChunks).where(eq(schema.ragChunks.dramaId, dramaId))
    if (chunks.length === 0) {
        logTaskProgress('RAG', 'index-drama-empty', { dramaId })
        return 0
    }
    // 分批嵌入（bge-small CPU 单批 32 条以内稳定）
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

/** drama 无索引且已有剧本内容时自动建索引（首次 Agent 对话触发，秒级） */
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
    return dot // 双方已 L2 归一化，点积即余弦
}

export interface RagHit {
    kind: string
    title: string | null
    content: string
    score: number
}

/** 检索 top-k 相关块；失败返回 null（调用方静默降级） */
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

/** 组装注入 Agent 用户消息的上下文块；不可用时返回 null（消息原样发送） */
export async function buildRagContextBlock(dramaId: number, query: string): Promise<string | null> {
    const hits = await searchDrama(dramaId, query)
    if (!hits || hits.length === 0) return null
    const sections = hits.map(h => {
        const label = h.title ? `${h.kind} · ${h.title}` : h.kind
        return `【${label}】\n${h.content}`
    })
    return `以下是从本项目资料库检索到的相关背景（供参考，与用户要求冲突时以用户要求为准）：\n\n${sections.join('\n\n')}`
}

/** 状态接口数据：模型加载状态 + 各 drama 索引量 */
export async function ragStatus(): Promise<{
    model: string
    modelLoaded: boolean
    totalChunks: number
    dramas: { dramaId: number; chunks: number }[]
}> {
    const rows = await db.select({ dramaId: schema.ragChunks.dramaId }).from(schema.ragChunks)
    const byDrama = new Map<number, number>()
    for (const r of rows) byDrama.set(r.dramaId, (byDrama.get(r.dramaId) || 0) + 1)
    return {
        model: EMBED_MODEL,
        modelLoaded: isRagModelLoaded(),
        totalChunks: rows.length,
        dramas: [...byDrama.entries()].map(([dramaId, chunks]) => ({ dramaId, chunks })),
    }
}
