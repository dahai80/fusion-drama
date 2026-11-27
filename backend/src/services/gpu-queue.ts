/**
 * GPU serial queue — all GPU-intensive tasks (image/video generation + asset extraction Agents) share one lock.
 *
 * fusion-mlx cannot run multiple models in parallel on a 128GB machine (FLUX ~34GB + Qwen3.5 decode burst
 * → GPU contention → Metal command buffer execution failed → SIGTERM process hang).
 * Media generation and asset extraction both go through this queue, ensuring only one GPU-intensive task runs at any moment.
 *
 * watchdog: each task carries a wall-clock cap (default 90 minutes); on timeout the task signal is aborted
 * and the lock released — when upstream (fusion-mlx / cloud) hangs, the pipeline does not silently stall; the zombie task's fetch
 * is aborted with the signal and no longer competes for VRAM with subsequent tasks (R1: watchdog upgraded from "give up waiting" to real cancellation).
 */

const DEFAULT_JOB_TIMEOUT_MS = 90 * 60_000
// R1: queue depth cap — storyboard batching would pile up the promise chain unboundedly; reject beyond the limit so upstream marks the task failed
const MAX_QUEUE_DEPTH = 200
let gpuChain: Promise<unknown> = Promise.resolve()
let queueDepth = 0

export function gpuQueueDepth(): number {
  return queueDepth
}

/**
 * NFR-REL-4 queue feedback: queue position at enqueue time (including self, 1 = executes immediately).
 * onQueued fires right after the synchronous enqueue (does not wait for execution), for callers to record events/log.
 */
export function enqueueGpuWork<T>(label: string, fn: (signal?: AbortSignal) => Promise<T>, opts: { timeoutMs?: number, onQueued?: (position: number) => void } = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS
  if (queueDepth >= MAX_QUEUE_DEPTH) {
    // i18n: user-facing
    return Promise.reject(new Error(`生成队列已满（${queueDepth} 个任务排队），请稍后重试或清理失败任务`))
  }
  queueDepth += 1
  opts.onQueued?.(queueDepth)
  const ac = new AbortController()
  const run = gpuChain.then(
    () => executeWithWatchdog(label, () => fn(ac.signal), timeoutMs, () => ac.abort()),
    () => executeWithWatchdog(label, () => fn(ac.signal), timeoutMs, () => ac.abort()),
  )
  gpuChain = run.catch(() => { /* do not block subsequent tasks */ })
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
