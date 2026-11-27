/**
 * Task event stream (FR-P1-1) — persisting and reading SSE events
 *
 * Events are written to sys_task_events (seq monotonically increasing, used as the
 * SSE Last-Event-ID resume cursor).
 * Append failures only warn and never block the main flow (the event stream is an
 * enhancement, not the critical path).
 */
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { now } from './response.js'

/** Appends one task event; failures do not throw (never blocks the generation main flow) */
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
 * FR-P1-1 completion: Agent-level events (agent_started/tool_call/tool_result/agent_finished) —
 * Agent flows (extraction/storyboard/prompt/dialogue) have no sys_task row, so events are
 * grouped by episodeId.
 * taskId is passed as 0 as a placeholder (the NOT NULL column constraint is kept; semantics
 * = non-task event). Episode-dimension seq monotonicity relies on the auto-increment id,
 * and reads sort by id.
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

/** Replays recent Agent events for an episode (afterId cursor, SSE resume) */
export async function readEpisodeEvents(episodeId: number, afterId = 0, limit = 100) {
    return db.select().from(schema.sysTaskEvents)
        .where(and(eq(schema.sysTaskEvents.episodeId, episodeId), gt(schema.sysTaskEvents.id, afterId)))
        .orderBy(asc(schema.sysTaskEvents.id))
        .limit(limit)
}

/** Replays events with seq > afterSeq for a task (SSE Last-Event-ID resume) */
export async function readTaskEvents(taskId: number, afterSeq = 0, limit = 100) {
    return db.select().from(schema.sysTaskEvents)
        .where(and(eq(schema.sysTaskEvents.taskId, taskId), gt(schema.sysTaskEvents.seq, afterSeq)))
        .orderBy(asc(schema.sysTaskEvents.seq))
        .limit(limit)
}

/** SSE data line: fully serializes the event (including seq/createdAt so the frontend can render directly; episode events use id as seq) */
export function formatTaskEvent(e: { id?: number, seq: number, type: string, payload: string | null, createdAt: string | null }): string {
    let payload: unknown = null
    if (e.payload) {
        try { payload = JSON.parse(e.payload) } catch { payload = e.payload }
    }
    return JSON.stringify({ seq: e.seq || e.id || 0, type: e.type, payload, createdAt: e.createdAt })
}
