/**
 * 跨会话记忆 — 对接 fusion-memory（fm-server HTTP :11435，JSON-RPC 2.0）
 * Agent 对话前检索历史偏好/决定注入上下文，对话后异步写入本轮流。
 * 命名空间 project / fusion-drama：项目级可见，不污染其他 fusion-* 应用记忆。
 * 全链路 fail-open：fm-server 未启/超时/报错一律返回 null 不阻断 Agent 主流程。
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { logTaskWarn } from '../utils/task-logger.js'

const FM_BASE_URL = process.env.FUSION_MEMORY_URL || 'http://127.0.0.1:11435'
const NAMESPACE = 'project'
const NAMESPACE_KEY = 'fusion-drama'
const RETRIEVE_TOP_K = 5
const REQUEST_TIMEOUT_MS = 8000

let cachedApiKey: string | null = null

function fmApiKey(): string {
    if (cachedApiKey) return cachedApiKey
    if (process.env.FUSION_MEMORY_API_KEY) {
        cachedApiKey = process.env.FUSION_MEMORY_API_KEY
        return cachedApiKey
    }
    // 与 fm-server 共享同一密钥文件（~/.fusion-memory/api_key，0600）
    try {
        const keyFile = path.join(os.homedir(), '.fusion-memory', 'api_key')
        cachedApiKey = fs.readFileSync(keyFile, 'utf8').trim()
    } catch {
        cachedApiKey = ''
    }
    return cachedApiKey
}

async function fmRpc<T>(method: string, params: Record<string, unknown>): Promise<T | null> {
    const key = fmApiKey()
    if (!key) {
        logTaskWarn('AgentMemory', 'no-api-key', { hint: '缺少 fusion-memory 密钥（~/.fusion-memory/api_key 或 FUSION_MEMORY_API_KEY）' })
        return null
    }
    try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
        const resp = await fetch(`${FM_BASE_URL}/v1/memory/${method === 'memory.retrieve_context' ? 'retrieve' : 'commit'}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({ jsonrpc: '2.0', method, params, id: Date.now() }),
            signal: controller.signal,
        })
        clearTimeout(timer)
        if (!resp.ok) {
            logTaskWarn('AgentMemory', 'rpc-http-fail', { method, status: resp.status, body: (await resp.text().catch(() => '')).slice(0, 200) })
            return null
        }
        const body: any = await resp.json()
        if (body?.error) {
            logTaskWarn('AgentMemory', 'rpc-error', { method, code: body.error.code, message: String(body.error.message).slice(0, 200) })
            return null
        }
        return body?.result ?? null
    } catch (e: any) {
        logTaskWarn('AgentMemory', 'rpc-unreachable', { method, error: e?.message })
        return null
    }
}

export interface MemoryStatus {
    reachable: boolean
    memoryCount: number | null
    baseUrl: string
    namespace: string
    namespaceKey: string
}

/** 健康探测（healthz 公开端点 + count RPC） */
export async function memoryStatus(): Promise<MemoryStatus> {
    const status: MemoryStatus = { reachable: false, memoryCount: null, baseUrl: FM_BASE_URL, namespace: NAMESPACE, namespaceKey: NAMESPACE_KEY }
    try {
        const resp = await fetch(`${FM_BASE_URL}/healthz`, { signal: AbortSignal.timeout(3000) })
        if (resp.ok) {
            status.reachable = true
            const body: any = await resp.json().catch(() => null)
            status.memoryCount = typeof body?.count === 'number' ? body.count : null
        }
    } catch { /* reachable=false */ }
    return status
}

/**
 * 检索跨会话记忆上下文块；无可召回内容/失败返回 null。
 * 返回块格式与 RAG 块一致：前缀说明 + 与用户要求冲突时以用户要求为准
 */
export async function retrieveMemoryContext(query: string, topK = RETRIEVE_TOP_K): Promise<string | null> {
    if (!query.trim()) return null
    const result = await fmRpc<{ context?: string }>('memory.retrieve_context', {
        query: query.slice(0, 2000),
        top_k: topK,
        namespace: NAMESPACE,
        namespace_key: NAMESPACE_KEY,
    })
    const context = (result?.context || '').trim()
    if (!context) return null
    return [
        '以下是跨会话记忆（此前创作中的偏好与决定，供参考，与用户当前要求冲突时以用户要求为准）：',
        context,
    ].join('\n')
}

export interface AgentMemoryTurn {
    agentType: string
    dramaId: number
    episodeId: number
    userMessage: string
    assistantMessage: string
    modelName?: string
}

/** 对话后异步写入记忆（调用方不 await，失败仅告警） */
export async function commitAgentMemory(turn: AgentMemoryTurn): Promise<boolean> {
    const ts = Math.floor(Date.now() / 1000)
    const interactionId = `drama-${turn.dramaId}-ep${turn.episodeId}-${ts}`
    const result = await fmRpc<{ memory_ids?: string[] }>('commit', {
        session_id: `fusion-drama-${turn.dramaId}`,
        namespace: NAMESPACE,
        namespace_key: NAMESPACE_KEY,
        interaction: {
            id: interactionId,
            session_id: `fusion-drama-${turn.dramaId}`,
            tenant: '',
            namespace: NAMESPACE,
            namespace_key: NAMESPACE_KEY,
            turns: [{
                turn_idx: 0,
                user_message: turn.userMessage.slice(0, 4000),
                assistant_message: turn.assistantMessage.slice(0, 4000),
                tool_calls: [],
            }],
            timestamp: ts,
            metadata: {
                project_path: 'fusion-drama',
                model_name: turn.modelName || '',
                agent_type: turn.agentType,
                node_id: `drama-${turn.dramaId}/episode-${turn.episodeId}`,
            },
        },
    })
    return !!(result && (result as any).memory_ids?.length)
}
