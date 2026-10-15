/**
 * 任务事件流（FR-P1-1）— SSE 事件的落库与读取
 *
 * 事件写 sys_task_events（seq 单调递增，SSE Last-Event-ID 续传游标）。
 * 追加失败只 warn 不阻断主流程（事件流是增强，不是关键路径）。
 */
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from './response.js'

/** 追加一条任务事件；失败不抛出（不阻断生成主流程） */
export async function appendTaskEvent(taskId: number, type: string, payload?: Record<string, unknown>): Promise<void> {
    try {
        const [row] = await db.select({ maxSeq: sql<number>`COALESCE(MAX(${schema.sysTaskEvents.seq}), 0)` })
            .from(schema.sysTaskEvents)
            .where(eq(schema.sysTaskEvents.taskId, taskId))
        const seq = Number(row?.maxSeq ?? 0) + 1
        await db.insert(schema.sysTaskEvents).values({
            taskId,
            seq,
            type,
            payload: payload ? JSON.stringify(payload) : null,
            createdAt: now(),
        })
    } catch (err) {
        console.warn(`[task-events] append failed task=${taskId} type=${type}:`, (err as Error).message)
    }
}

/**
 * FR-P1-1 补齐：Agent 级事件（agent_started/tool_call/tool_result/agent_finished）——
 * Agent 链路（提取/分镜/提示词/对话）没有 sys_task 行，事件以 episodeId 归组。
 * taskId 传 0 占位（列 NOT NULL 约束保留，语义=非任务事件）。episode 维度 seq
 * 用自增 id 保证单调，读取按 id 排序。
 */
export async function appendEpisodeEvent(episodeId: number, type: string, payload?: Record<string, unknown>): Promise<void> {
    try {
        await db.insert(schema.sysTaskEvents).values({
            taskId: 0,
            seq: 0,
            type,
            payload: payload ? JSON.stringify(payload) : null,
            createdAt: now(),
            episodeId,
        })
    } catch (err) {
        console.warn(`[task-events] append episode event failed ep=${episodeId} type=${type}:`, (err as Error).message)
    }
}

/** 回放某剧集最近的 Agent 事件（afterId 游标，SSE 续传） */
export async function readEpisodeEvents(episodeId: number, afterId = 0, limit = 100) {
    return db.select().from(schema.sysTaskEvents)
        .where(and(eq(schema.sysTaskEvents.episodeId, episodeId), gt(schema.sysTaskEvents.id, afterId)))
        .orderBy(asc(schema.sysTaskEvents.id))
        .limit(limit)
}

/** 回放某任务 seq > afterSeq 的事件（SSE Last-Event-ID 续传） */
export async function readTaskEvents(taskId: number, afterSeq = 0, limit = 100) {
    return db.select().from(schema.sysTaskEvents)
        .where(and(eq(schema.sysTaskEvents.taskId, taskId), gt(schema.sysTaskEvents.seq, afterSeq)))
        .orderBy(asc(schema.sysTaskEvents.seq))
        .limit(limit)
}

/** SSE data 行：事件全量序列化（含 seq/createdAt，前端可直接渲染；episode 事件以 id 作 seq） */
export function formatTaskEvent(e: { id?: number, seq: number, type: string, payload: string | null, createdAt: string | null }): string {
    let payload: unknown = null
    if (e.payload) {
        try { payload = JSON.parse(e.payload) } catch { payload = e.payload }
    }
    return JSON.stringify({ seq: e.seq || e.id || 0, type: e.type, payload, createdAt: e.createdAt })
}
