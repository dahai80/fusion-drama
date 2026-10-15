/**
 * FR-P2-4 轮询收敛 — 组件内轮询定时器统一托管。
 *
 * start() 登记的 setInterval 在组件 unmount 时自动全清，调用方不再
 * 各自维护 onUnmounted 清理（漏挂即页面离开后照跑的回归源头）。
 * 返回 id 供调用方提前 stop（终态即停），语义与原生 setInterval 对齐。
 */
import { onUnmounted } from 'vue'

export function usePolling() {
    const timers = new Set<ReturnType<typeof setInterval>>()

    function start(fn: () => void, ms: number) {
        const id = setInterval(fn, ms)
        timers.add(id)
        return id
    }

    function stop(id: ReturnType<typeof setInterval>) {
        clearInterval(id)
        timers.delete(id)
    }

    function stopAll() {
        for (const id of timers) clearInterval(id)
        timers.clear()
    }

    try { onUnmounted(() => stopAll()) } catch { /* 非 setup 上下文（单测）忽略 */ }
    return { start, stop, stopAll }
}
