/**
 * GPU 串行队列 — 所有 GPU 密集任务（图片/视频生成 + 资产提取 Agent）共用一把锁。
 *
 * fusion-mlx 在 128GB 机器上无法并行多模型（FLUX ~34GB + Qwen3.5 decode burst
 * → GPU 争用 → Metal command buffer execution failed → SIGTERM 进程挂死）。
 * 媒体生成与资产提取都走此队列，确保任意时刻仅一个 GPU 密集任务运行。
 *
 * watchdog：每个任务带 wall-clock 上限（默认 90 分钟），超时后 abort 任务 signal
 * 并释放锁 — 上游（fusion-mlx / 云端）挂死时管线不静默停机，僵尸任务的 fetch
 * 随 signal 中止，不再与后续任务争显存（R1：watchdog 从"放弃等待"升级为真取消）。
 */

const DEFAULT_JOB_TIMEOUT_MS = 90 * 60_000
// R1: 排队上限——分镜批量化会无界堆积 promise 链；超限直接拒绝让上游标 failed
const MAX_QUEUE_DEPTH = 200
let gpuChain: Promise<unknown> = Promise.resolve()
let queueDepth = 0

export function gpuQueueDepth(): number {
  return queueDepth
}

/**
 * NFR-REL-4 排队反馈：入队时刻的排队位置（含自己在内，1=马上执行）。
 * onQueued 在同步入队后立即回调（不等执行），供调用方落事件/打日志。
 */
export function enqueueGpuWork<T>(label: string, fn: (signal?: AbortSignal) => Promise<T>, opts: { timeoutMs?: number, onQueued?: (position: number) => void } = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS
  if (queueDepth >= MAX_QUEUE_DEPTH) {
    return Promise.reject(new Error(`生成队列已满（${queueDepth} 个任务排队），请稍后重试或清理失败任务`))
  }
  queueDepth += 1
  opts.onQueued?.(queueDepth)
  const ac = new AbortController()
  const run = gpuChain.then(
    () => executeWithWatchdog(label, () => fn(ac.signal), timeoutMs, () => ac.abort()),
    () => executeWithWatchdog(label, () => fn(ac.signal), timeoutMs, () => ac.abort()),
  )
  gpuChain = run.catch(() => { /* 不阻断后续任务 */ })
  return run.finally(() => { queueDepth -= 1 }) as Promise<T>
}

async function executeWithWatchdog<T>(label: string, fn: () => Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const watchdog = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.()
      reject(new Error(`GPU job "${label}" exceeded ${Math.round(timeoutMs / 60000)}min watchdog`))
    }, timeoutMs)
  })
  try {
    return await Promise.race([fn(), watchdog])
  } catch (err: any) {
    console.error(`[gpu-queue] job failed: ${label}:`, err?.message || err)
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}
