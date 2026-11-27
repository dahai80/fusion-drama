/**
 * Batch video-prompt task — asynchronously runs the prompt_generator agent per storyboard
 * that is missing video_prompt. Run state lives in an in-memory Map (dedup + progress
 * counters) and is also persisted to sys_task (type=video_prompt): the startup sweep marks
 * leftovers failed after a restart, and status queries fall back to the DB — the frontend
 * no longer sees "task not found" forever
 */
import { and, desc, eq } from 'drizzle-orm'
import { db, getInsertId, schema } from '../db/index.js'
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { enqueueGpuWork } from './gpu-queue.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

export interface VideoPromptBatchStatus {
  status: 'running' | 'done' | 'error'
  total: number
  completed: number
  failed: number
  current_storyboard_id?: number
  started_at: string
  finished_at?: string
  error?: string
}

const tasks = new Map<number, VideoPromptBatchStatus>()

/**
 * Checklist 1107 #5: structured per-model constraints for the prompt agent —
 * replaces the old prose "adapt to the model's traits" hint (agent guessed durations, produced
 * 10s scripts for a 5s-capped model → TTS dialogue overflow, see memory
 * video-duration-storyboard-fallback). Keep in sync with adapters/fusion-video.ts.
 */
export function videoModelConstraints(model?: string | null): { maxSeconds: number, resolution: string } {
    const m = (model || '').toLowerCase()
    if (m.includes('minimax') || m.includes('h3')) return { maxSeconds: 5, resolution: '1024x576' }
    if (m.includes('wan2.2') || m.includes('ti2v') || m.includes('5b')) return { maxSeconds: 10, resolution: '960x544' }
    if (m.includes('ltx')) return { maxSeconds: 10, resolution: '1344x768' }
    return { maxSeconds: 10, resolution: '' }
}

/** sys_task row → status object (used for DB read-back after restart) */
function statusFromRow(row: typeof schema.sysTask.$inferSelect): VideoPromptBatchStatus {
    let params: any = {}
    try { params = JSON.parse(row.params || '{}') } catch { /* corrupted params treated as empty */ }
    return {
        status: row.status === 'completed' ? 'done' : row.status === 'failed' ? 'error' : 'running',
        total: Number(params.total || 0),
        completed: Number(params.completed || 0),
        failed: Number(params.failed || 0),
        started_at: row.createdAt,
        finished_at: row.updatedAt || undefined,
        error: row.errorMsg || undefined,
    }
}

/** Write batch progress back to sys_task (params carries total/completed/failed counters) */
async function writeBatchProgress(dbTaskId: number | undefined, task: VideoPromptBatchStatus, terminal?: { status: 'completed' | 'failed'; errorMsg?: string }) {
    if (!dbTaskId) return
    try {
        await db.update(schema.sysTask).set({
            params: JSON.stringify({ total: task.total, completed: task.completed, failed: task.failed }),
            ...(terminal
                // i18n: user-facing — task-panel summary
                ? { status: terminal.status, errorMsg: terminal.errorMsg ?? null, resultUrl: `完成 ${task.completed}/${task.total}，失败 ${task.failed}`, updatedAt: new Date().toISOString() }
                : { updatedAt: new Date().toISOString() }),
        }).where(eq(schema.sysTask.id, dbTaskId))
    } catch (e: any) {
        logTaskError('VideoPrompt', 'batch-progress-write', { dbTaskId, error: e?.message })
    }
}

/** Start a batch generation (returns immediately); running returns started:false,total:-1;
 *  nothing pending returns started:false,total:0. When storyboardIds is given, only those
 *  storyboards are processed (regenerated even if they already have prompts); otherwise all
 *  storyboards missing prompts are processed */
export async function startVideoPromptBatch(
  episodeId: number,
  dramaId: number,
  opts: { model?: string; configId?: number } = {},
  storyboardIds?: number[],
): Promise<{ started: boolean; total: number }> {
  if (tasks.get(episodeId)?.status === 'running') return { started: false, total: -1 }
  // B13 TOCTOU: claim the slot synchronously before querying — a concurrent second request
  // is rejected right away by the "running" check; every failure/empty/error path must
  // release the claim, otherwise the episode shows "running" forever
  tasks.set(episodeId, { status: 'running', total: 0, completed: 0, failed: 0, started_at: new Date().toISOString() })
  const pending: (typeof schema.storyboards.$inferSelect)[] = []
  // i18n: user-facing — label interpolated into the agent prompt
  let videoLabel = '默认'
  let modelConstraints = videoModelConstraints('')
  try {
    const sbs = await db.select().from(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episodeId))
      .orderBy(schema.storyboards.storyboardNumber)
    const found = storyboardIds?.length
      ? sbs.filter(sb => storyboardIds.includes(sb.id))
      : sbs.filter(sb => !(sb.videoPrompt || '').trim())
    pending.push(...found)
    if (!pending.length) {
      tasks.delete(episodeId)
      return { started: false, total: 0 }
    }

    // video-model label: follows the video config locked on this episode, so the agent can
    // adapt generation to the model's traits
    const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
    if (ep?.videoConfigId) {
      const [cfg] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, ep.videoConfigId))
      if (cfg) {
        videoLabel = `${cfg.name} (${cfg.provider})`
        modelConstraints = videoModelConstraints(cfg.model)
      }
    }
  } catch (err) {
    tasks.delete(episodeId)
    throw err
  }

  const task: VideoPromptBatchStatus = tasks.get(episodeId)!

  // Persist sys_task: type=video_prompt (not in the media generation queue, the batch
  // manages its own lifecycle); episode_id lets the task panel aggregate-filter via
  // /episodes/:id/generation-tasks; params persists total/completed/failed counters for
  // status read-back after restart
  let dbTaskId: number | undefined
  try {
    const ts = new Date().toISOString()
    task.total = pending.length
    const insertRes = await db.insert(schema.sysTask).values({
      type: 'video_prompt',
      dramaId,
      episodeId,
      // i18n: user-facing — task-panel label
      prompt: `视频提示词批量 ×${pending.length}`,
      model: opts.model || null,
      params: JSON.stringify({ total: pending.length, completed: 0, failed: 0 }),
      status: 'processing',
      createdAt: ts,
      updatedAt: ts,
    })
    dbTaskId = getInsertId(insertRes)
  } catch (err: any) {
    logTaskError('VideoPrompt', 'batch-db-insert', { episodeId, error: err?.message })
  }

  logTaskStart('VideoPrompt', 'batch', { episodeId, dramaId, total: pending.length, model: opts.model || undefined, dbTaskId })
  // Batch prompt generation shares the GPU serial queue with image/video tasks —
  // prompt_generator's agent.generate hits the text model (Qwen3.5 decode burst); running
  // concurrently with LTX-2.5/FLUX causes GPU contention → Metal crash (see gpu-queue.ts
  // comments). The whole batch takes the lock once and serializes per-storyboard inside
  enqueueGpuWork(`VideoPrompt-batch-ep${episodeId}`, async () => {
    const agent = mastra.getAgent('prompt_generator')
    // i18n: user-facing — surfaces in task error state
    if (!agent) throw new Error('视频提示词 Agent 不可用')
    const requestContext = buildAgentRequestContext({
      episodeId,
      dramaId,
      modelOverride: opts.model || undefined,
      textConfigId: opts.configId || undefined,
    })
    for (const sb of pending) {
      task.current_storyboard_id = sb.id
      logTaskProgress('VideoPrompt', 'batch-shot', { episodeId, storyboardId: sb.id, index: task.completed + task.failed + 1, total: task.total })
      try {
        await agent.generate([{
          role: 'user',
          // i18n: user-facing — LLM-facing task prompt, Chinese keeps agent behavior stable
          content: [
            `请为分镜 #${sb.storyboardNumber}(ID:${sb.id})生成视频提示词(video_prompt)。视频模型:${videoLabel}。`, // i18n: user-facing
            `模型硬约束(必须遵守)：单镜头总时长不超过 ${modelConstraints.maxSeconds} 秒${modelConstraints.resolution ? `，目标分辨率 ${modelConstraints.resolution}（16:9）` : ''}——按分镜 description 的时长切分段落时不得超过该上限，台词朗读时间也要落在总时长内。`, // i18n: user-facing
            `请先调用 read_storyboard_context 获取该分镜的画面描述(含【镜头N】子镜头与台词/旁白)、氛围及时长，据此生成 video_prompt(第一行是信息头：列出该分镜出场的人物与场景，用 @角色名/@场景名 引用；之后按 3 秒分段换行、用 @角色名/@场景名/@道具名 引用参考素材；段落内允许多镜头切镜，段与段可以是不同景别/角度/对象，但不跨场景，切镜点对齐分镜 description 的【镜头N】结构),然后调用 update_storyboard 保存到分镜 ID:${sb.id}。update_storyboard 参数只传 storyboard_id 和 video_prompt 两个键,不要回传该分镜的其他任何字段,不要重新拆分整集。`, // i18n: user-facing
          ].join('\n'),
        }], { maxSteps: 8, requestContext })
        // success is judged by what actually landed in the DB
        const [fresh] = await db.select().from(schema.storyboards).where(eq(schema.storyboards.id, sb.id))
        if ((fresh?.videoPrompt || '').trim()) task.completed++
        else {
          task.failed++
          logTaskError('VideoPrompt', 'batch-shot', { storyboardId: sb.id, error: 'agent finished but video_prompt is empty' })
        }
      } catch (err: any) {
        task.failed++
        logTaskError('VideoPrompt', 'batch-shot', { storyboardId: sb.id, error: err?.message })
      }
      await writeBatchProgress(dbTaskId, task)
    }
  })
    .then(() => {
      task.status = 'done'
      task.finished_at = new Date().toISOString()
      task.current_storyboard_id = undefined
      logTaskSuccess('VideoPrompt', 'batch', { episodeId, total: task.total, completed: task.completed, failed: task.failed })
      // mark failed only when everything failed (errorMsg carries the summary); partial
      // success is marked completed (resultUrl carries the summary)
      void writeBatchProgress(dbTaskId, task, task.completed === 0
        // i18n: user-facing — task-panel error message
        ? { status: 'failed', errorMsg: `批量生成失败：${task.failed}/${task.total} 个分镜未生成提示词` }
        : { status: 'completed' })
    })
    .catch((err: any) => {
      task.status = 'error'
      task.finished_at = new Date().toISOString()
      // i18n: user-facing — task-panel error message
      task.error = err?.message || '批量生成失败'
      logTaskError('VideoPrompt', 'batch', { episodeId, error: err?.message })
      // i18n: user-facing — task-panel error message
      void writeBatchProgress(dbTaskId, task, { status: 'failed', errorMsg: err?.message || '批量生成失败' })
    })
  return { started: true, total: pending.length }
}

/** Query batch task status: in-memory state wins (live counters while running); with no
 *  in-memory state, fall back to the latest sys_task row (the startup sweep already marked
 *  processing rows failed after restart, so this returns a terminal state and the frontend
 *  sees "interrupted" rather than "not started") */
export async function getVideoPromptBatchStatus(episodeId: number): Promise<VideoPromptBatchStatus | null> {
  const mem = tasks.get(episodeId)
  if (mem) return mem
  const [row] = await db.select().from(schema.sysTask)
    .where(and(eq(schema.sysTask.type, 'video_prompt'), eq(schema.sysTask.episodeId, episodeId)))
    .orderBy(desc(schema.sysTask.id))
    .limit(1)
  return row ? statusFromRow(row) : null
}
