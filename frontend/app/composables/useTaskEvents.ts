/**
 * 任务事件流客户端（FR-P1-1）— fetch-stream SSE
 *
 * 不用 EventSource：无法带 Authorization 头（服务器 token 模式）。
 * fetch + ReadableStream 手解 SSE 帧（id:/event:/data:），断流自动重连并带
 * Last-Event-ID 续传；任务终态（end 事件）或 unmount 时停止。
 */
export interface TaskEvent {
    seq: number | string
    type: string
    payload: any
    createdAt?: string
}

export function useTaskEvents() {
    let controller: AbortController | null = null

    async function connect(taskId: number | string, onEvent: (e: TaskEvent) => void, onEnd?: () => void) {
        stop()
        controller = new AbortController()
        const token = localStorage.getItem('FUSION_API_TOKEN') || ''
        const headers: Record<string, string> = { Accept: 'text/event-stream' }
        if (token) headers.Authorization = `Bearer ${token}`
        let cursor = ''

        const run = async () => {
            while (controller && !controller.signal.aborted) {
                try {
                    const url = cursor
                        ? `/api/v1/tasks/${taskId}/events?lastEventId=${encodeURIComponent(cursor)}`
                        : `/api/v1/tasks/${taskId}/events`
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
                    // 断流重连退避；连接层错误不打扰用户（事件流是增强，任务状态仍由轮询兜底）
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

    try { onUnmounted(() => stop()) } catch { /* 非 setup 上下文（单测）忽略 */ }
    return { connect, stop }
}
