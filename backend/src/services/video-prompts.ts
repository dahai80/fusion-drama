/**
 * 批量视频提示词任务 — 异步为缺少 video_prompt 的分镜逐个运行 prompt_generator Agent
 * 运行态在内存 Map（去重 + 进度计数），同时落 sys_task（type=video_prompt）持久化：
 * 重启后启动清扫统一标 failed，状态查询回退读 DB——前端不再「永远查无此任务」
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

/** sys_task 行 → 状态对象（重启后 DB 回读用） */
function statusFromRow(row: typeof schema.sysTask.$inferSelect): VideoPromptBatchStatus {
    let params: any = {}
    try { params = JSON.parse(row.params || '{}') } catch { /* 损坏 params 按空处理 */ }
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

/** 批次进度回写 sys_task（params 内含 total/completed/failed 计数） */
async function writeBatchProgress(dbTaskId: number | undefined, task: VideoPromptBatchStatus, terminal?: { status: 'completed' | 'failed'; errorMsg?: string }) {
    if (!dbTaskId) return
    try {
        await db.update(schema.sysTask).set({
            params: JSON.stringify({ total: task.total, completed: task.completed, failed: task.failed }),
            ...(terminal
                ? { status: terminal.status, errorMsg: terminal.errorMsg ?? null, resultUrl: `完成 ${task.completed}/${task.total}，失败 ${task.failed}`, updatedAt: new Date().toISOString() }
                : { updatedAt: new Date().toISOString() }),
        }).where(eq(schema.sysTask.id, dbTaskId))
    } catch (e: any) {
        logTaskError('VideoPrompt', 'batch-progress-write', { dbTaskId, error: e?.message })
    }
}

/** 启动批量生成（立即返回）；运行中返回 started:false,total:-1；无待生成分镜返回 started:false,total:0；
 *  传入 storyboardIds 时只处理所选分镜（即使已有提示词也重新生成），否则处理全部缺失提示词的分镜 */
export async function startVideoPromptBatch(
  episodeId: number,
  dramaId: number,
  opts: { model?: string; configId?: number } = {},
  storyboardIds?: number[],
): Promise<{ started: boolean; total: number }> {
  if (tasks.get(episodeId)?.status === 'running') return { started: false, total: -1 }
  // B13 TOCTOU：先同步占坑再查库——并发第二次请求「运行中」检查直接拒绝；
  // 查询失败/空批次/异常路径都必须释放占坑，否则该集永远显示「运行中」
  tasks.set(episodeId, { status: 'running', total: 0, completed: 0, failed: 0, started_at: new Date().toISOString() })
  const pending: (typeof schema.storyboards.$inferSelect)[] = []
  let videoLabel = '默认'
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

    // 视频模型标签：跟随该集锁定的视频配置，供 Agent 按模型特性生成
    const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
    if (ep?.videoConfigId) {
      const [cfg] = await db.select().from(schema.aiServiceConfigs).where(eq(schema.aiServiceConfigs.id, ep.videoConfigId))
      if (cfg) videoLabel = `${cfg.name} (${cfg.provider})`
    }
  } catch (err) {
    tasks.delete(episodeId)
    throw err
  }

  const task: VideoPromptBatchStatus = tasks.get(episodeId)!

  // 落 sys_task：type=video_prompt（不进媒体生成队列，批次自管生命周期），
  // episode_id 供任务面板 /episodes/:id/generation-tasks 聚合过滤；
  // params 持久化 total/completed/failed 计数供重启后状态回读
  let dbTaskId: number | undefined
  try {
    const ts = new Date().toISOString()
    task.total = pending.length
    const insertRes = await db.insert(schema.sysTask).values({
      type: 'video_prompt',
      dramaId,
      episodeId,
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
  // 批量提示词生成与图片/视频任务共用 GPU 串行队列——prompt_generator 的
  // agent.generate 打文本模型（Qwen3.5 decode burst），与 LTX-2.5/FLUX 并发会
  // GPU 争用触发 Metal crash（见 gpu-queue.ts 注释），整个批次占锁一次，内部逐分镜串行
  enqueueGpuWork(`VideoPrompt-batch-ep${episodeId}`, async () => {
    const agent = mastra.getAgent('prompt_generator')
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
          content: `请为分镜 #${sb.storyboardNumber}(ID:${sb.id})生成视频提示词(video_prompt)。视频模型:${videoLabel},请根据该模型的特性和时长限制生成。
请先调用 read_storyboard_context 获取该分镜的画面描述(含【镜头N】子镜头与台词/旁白)、氛围及时长，据此生成 video_prompt(第一行是信息头：列出该分镜出场的人物与场景，用 @角色名/@场景名 引用；之后按 3 秒分段换行、用 @角色名/@场景名/@道具名 引用参考素材；段落内允许多镜头切镜，段与段可以是不同景别/角度/对象，但不跨场景，切镜点对齐分镜 description 的【镜头N】结构),然后调用 update_storyboard 保存到分镜 ID:${sb.id}。update_storyboard 参数只传 storyboard_id 和 video_prompt 两个键,不要回传该分镜的其他任何字段,不要重新拆分整集。`,
        }], { maxSteps: 8, requestContext })
        // 以实际落库为准判定成败
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
      // 全部失败才标 failed（errorMsg 带汇总），部分成功标 completed（resultUrl 带汇总）
      void writeBatchProgress(dbTaskId, task, task.completed === 0
        ? { status: 'failed', errorMsg: `批量生成失败：${task.failed}/${task.total} 个分镜未生成提示词` }
        : { status: 'completed' })
    })
    .catch((err: any) => {
      task.status = 'error'
      task.finished_at = new Date().toISOString()
      task.error = err?.message || '批量生成失败'
      logTaskError('VideoPrompt', 'batch', { episodeId, error: err?.message })
      void writeBatchProgress(dbTaskId, task, { status: 'failed', errorMsg: err?.message || '批量生成失败' })
    })
  return { started: true, total: pending.length }
}

/** 查询批量任务状态：内存优先（运行中实时计数），无内存态时回退读 sys_task 最近一行
 *  （重启后启动清扫已把 processing 标 failed，此处返回终态让前端看到「已中断」而非「未启动」） */
export async function getVideoPromptBatchStatus(episodeId: number): Promise<VideoPromptBatchStatus | null> {
  const mem = tasks.get(episodeId)
  if (mem) return mem
  const [row] = await db.select().from(schema.sysTask)
    .where(and(eq(schema.sysTask.type, 'video_prompt'), eq(schema.sysTask.episodeId, episodeId)))
    .orderBy(desc(schema.sysTask.id))
    .limit(1)
  return row ? statusFromRow(row) : null
}
