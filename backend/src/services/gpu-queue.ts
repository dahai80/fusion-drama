/**
 * GPU 串行队列 — 所有 GPU 密集任务（图片/视频生成 + 资产提取 Agent）共用一把锁。
 *
 * fusion-mlx 在 128GB 机器上无法并行多模型（FLUX ~34GB + Qwen3.5 decode burst
 * → GPU 争用 → Metal command buffer execution failed → SIGTERM 进程挂死）。
 * 媒体生成与资产提取都走此队列，确保任意时刻仅一个 GPU 密集任务运行。
 *
 * watchdog：每个任务带 wall-clock 上限（默认 90 分钟），超时后释放锁并拒绝
 * 后续执行权 — 上游（fusion-mlx / 云端）挂死时管线不静默停机。挂死任务自身
 * 的 promise 无法强杀，只能标记超时：调用方各自负责超时后把任务行标 failed。
 */

const DEFAULT_JOB_TIMEOUT_MS = 90 * 60_000
let gpuChain: Promise<unknown> = Promise.resolve()
let queueDepth = 0

export function gpuQueueDepth(): number {
  return queueDepth
}

export function enqueueGpuWork<T>(label: string, fn: () => Promise<T>, opts: { timeoutMs?: number } = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_JOB_TIMEOUT_MS
  queueDepth += 1
  const run = gpuChain.then(
    () => executeWithWatchdog(label, fn, timeoutMs),
    () => executeWithWatchdog(label, fn, timeoutMs),
  )
  gpuChain = run.catch(() => { /* 不阻断后续任务 */ })
  return run.finally(() => { queueDepth -= 1 }) as Promise<T>
}

async function executeWithWatchdog<T>(label: string, fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  const watchdog = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`GPU job "${label}" exceeded ${Math.round(timeoutMs / 60000)}min watchdog`)), timeoutMs)
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
