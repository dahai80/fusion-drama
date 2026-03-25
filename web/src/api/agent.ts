import type { AgentChatRequest, AgentSSEEvent } from '@/types/agent'

const BASE = import.meta.env.VITE_API_PREFIX || '/api/v1'

export const agentAPI = {
  async *streamChat(agentType: string, data: AgentChatRequest): AsyncGenerator<AgentSSEEvent> {
    const response = await fetch(`${BASE}/agent/${agentType}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!response.ok) throw new Error(`Agent request failed: ${response.status}`)
    if (!response.body) throw new Error('No response body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event: AgentSSEEvent = JSON.parse(line.slice(6))
            yield event
          } catch {
            // skip malformed lines
          }
        }
      }
    }
  }
}
