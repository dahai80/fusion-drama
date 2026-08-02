/**
 * 资产提取任务 — 异步执行，按「集 × 类型」粒度跟踪
 * 角色 / 场景 / 道具 可分别单独提取，同一集的不同类型可并行
 * 任务状态为进程内内存态：后端重启后运行中的任务状态丢失（Agent 调用本身已被中断）
 */
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { logTaskError, logTaskStart, logTaskSuccess } from '../utils/task-logger.js'

export type ExtractTarget = 'characters' | 'scenes' | 'props'
export const EXTRACT_TARGETS: ExtractTarget[] = ['characters', 'scenes', 'props']

export interface ExtractTask {
  status: 'running' | 'done' | 'error'
  started_at: string
  finished_at?: string
  error?: string
}

const tasks = new Map<string, ExtractTask>()
const keyOf = (episodeId: number, target: string) => `${episodeId}:${target}`

/** 每类资产的提取指令：限定只提取该类型，并要求与已有数据去重合并 */
const EXTRACT_MESSAGES: Record<ExtractTarget, string> = {
  characters: '请从本集剧本中提取所有角色信息（外貌需融合性格、含妆造），先用 read_existing_characters 读取已有角色去重，再用 save_dedup_characters 保存。本次只提取角色，不要提取场景和道具。',
  scenes: '请从本集剧本中提取所有场景信息（地点、时间、光影等），先用 read_existing_scenes 读取已有场景去重，再用 save_dedup_scenes 保存。本次只提取场景，不要提取角色和道具。',
  props: '请从本集剧本中提取推动事态发展的关键道具（只记录物品外貌；与事态发展无关的不要提取），先用 read_existing_props 读取已有道具去重，再用 save_dedup_props 保存。本次只提取道具，不要提取角色和场景。',
}

/** 启动异步提取任务（立即返回）；同集同类型已在运行时返回 false */
export function startExtraction(episodeId: number, dramaId: number, target: ExtractTarget): boolean {
  const key = keyOf(episodeId, target)
  if (tasks.get(key)?.status === 'running') return false

  const task: ExtractTask = { status: 'running', started_at: new Date().toISOString() }
  tasks.set(key, task)

  logTaskStart('Extract', target, { episodeId, dramaId })
  ;(async () => {
    const agent = mastra.getAgent('extractor')
    if (!agent) throw new Error('提取 Agent 不可用')
    const requestContext = buildAgentRequestContext({ episodeId, dramaId })
    await agent.generate([{ role: 'user', content: EXTRACT_MESSAGES[target] }], { maxSteps: 20, requestContext })
  })()
    .then(() => {
      task.status = 'done'
      task.finished_at = new Date().toISOString()
      logTaskSuccess('Extract', target, { episodeId })
    })
    .catch((err: any) => {
      task.status = 'error'
      task.finished_at = new Date().toISOString()
      task.error = err?.message || '提取失败'
      logTaskError('Extract', target, { episodeId, error: err?.message })
    })
  return true
}

/** 查询某集三类资产的提取任务状态（未启动过的类型为 null） */
export function getExtractionStatus(episodeId: number): Record<ExtractTarget, ExtractTask | null> {
  const result = {} as Record<ExtractTarget, ExtractTask | null>
  for (const target of EXTRACT_TARGETS) result[target] = tasks.get(keyOf(episodeId, target)) || null
  return result
}
