/**
 * GPU 串行队列 — 所有 GPU 密集任务（图片/视频生成 + 资产提取 Agent）共用一把锁。
 *
 * fusion-mlx 在 128GB 机器上无法并行多模型（FLUX ~34GB + Qwen3.5 decode burst
 * → GPU 争用 → Metal command buffer execution failed → SIGTERM 进程挂死）。
 * 媒体生成与资产提取都走此队列，确保任意时刻仅一个 GPU 密集任务运行。
 */

let gpuChain: Promise<unknown> = Promise.resolve()

export function enqueueGpuWork<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const run = gpuChain.then(() => fn(), () => fn())
  gpuChain = run.catch(() => { /* 不阻断后续任务 */ })
  return run as Promise<T>
}
