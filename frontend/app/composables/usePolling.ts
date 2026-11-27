/**
 * FR-P2-4 polling consolidation — centrally managed in-component polling timers.
 *
 * setInterval registered via start() is fully cleared on component unmount, so callers no
 * longer maintain their own onUnmounted cleanup (a missed one meant timers kept running
 * after leaving the page — a recurring regression source).
 * Returns the id so callers can stop early (stop on terminal state); semantics match
 * native setInterval.
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

    try { onUnmounted(() => stopAll()) } catch { /* non-setup context (unit tests); ignore */ }
    return { start, stop, stopAll }
}
