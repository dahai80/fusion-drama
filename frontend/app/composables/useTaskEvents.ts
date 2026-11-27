/**
 * Task event stream client (FR-P1-1) — fetch-stream SSE
 *
 * EventSource is not used: it cannot send an Authorization header (server token mode).
 * fetch + ReadableStream hand-parses SSE frames (id:/event:/data:); stream drops auto-reconnect
 * with Last-Event-ID resume; stops on task terminal state (end event) or unmount.
 */
export interface TaskEvent {
    seq: number | string
    type: string
    payload: any
    createdAt?: string
}

export function useTaskEvents() {
    let controller: AbortController | null = null

    /**
     * Connects the event stream. kind='task' (default) uses /tasks/:id/events — task-level
     * lifecycle; kind='episode' uses /episodes/:id/events — Agent-level events (tool_call/
     * tool_result/agent_started/agent_finished, FR-P1-1). Both share the same SSE frame format.
     */
    async function connect(targetId: number | string, onEvent: (e: TaskEvent) => void, onEnd?: () => void, kind: 'task' | 'episode' = 'task') {
        stop()
        controller = new AbortController()
        const token = localStorage.getItem('FUSION_API_TOKEN') || ''
        const headers: Record<string, string> = { Accept: 'text/event-stream' }
        if (token) headers.Authorization = `Bearer ${token}`
        let cursor = ''
        const base = kind === 'episode' ? `/api/v1/episodes/${targetId}/events` : `/api/v1/tasks/${targetId}/events`

        const run = async () => {
            while (controller && !controller.signal.aborted) {
                try {
                    const url = cursor
                        ? `${base}?lastEventId=${encodeURIComponent(cursor)}`
                        : base
                    const resp = await fetch(url, { headers, signal: controller.signal })
                    if (!resp.ok || !resp.body) throw new Error(`SSE HTTP ${resp.status}`)
                    const reader = resp.body.getReader()
                    const decoder = new TextDecoder()
                    let buf = ''
                    for (;;) {
                        const { done, value } = await reader.read()
                        if (done) break
                        buf += decoder.decode(value, { stream: true })
                        let idx
                        while ((idx = buf.indexOf('\n\n')) >= 0) {
                            const frame = buf.slice(0, idx)
                            buf = buf.slice(idx + 2)
                            const ev = parseFrame(frame)
                            if (!ev) continue
                            if (ev.id) cursor = ev.id
                            if (ev.event === 'end') {
                                if (ev.data) onEvent({ seq: 'end', type: 'end', payload: ev.data })
                                onEnd?.()
                                stop()
                                return
                            }
                            if (ev.data) onEvent({ seq: ev.id ?? '', type: ev.event ?? 'message', payload: ev.data })
                        }
                    }
                } catch (err: any) {
                    if (controller?.signal.aborted) return
                    // Reconnect backoff on stream drop; connection-layer errors stay silent (the stream is an
                    // enhancement, task status still falls back to polling)
                    console.warn('[task-events] stream interrupted, retrying:', err?.message)
                    await new Promise(r => setTimeout(r, 3000))
                }
            }
        }
        void run()
    }

    function parseFrame(frame: string): { id?: string, event?: string, data?: any } | null {
        let id: string | undefined
        let event: string | undefined
        let data = ''
        for (const line of frame.split('\n')) {
            if (line.startsWith('id:')) id = line.slice(3).trim()
            else if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5).trim()
        }
        if (!data) return null
        try { return { id, event, data: JSON.parse(data) } } catch { return { id, event, data } }
    }

    function stop() {
        controller?.abort()
        controller = null
    }

    try { onUnmounted(() => stop()) } catch { /* not in a setup context (unit tests) — ignore */ }
    return { connect, stop }
}
