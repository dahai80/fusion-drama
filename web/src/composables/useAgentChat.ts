import { ref, type Ref } from 'vue'
import { agentAPI } from '@/api/agent'
import type { AgentType, AgentMessage, AgentChatRequest } from '@/types/agent'

export function useAgentChat(dramaId: number, episodeId: Ref<number>) {
  const agentType = ref<AgentType>('prompt_generator')
  const messages = ref<AgentMessage[]>([])
  const streaming = ref(false)
  const currentStreamContent = ref('')

  async function sendMessage(text: string) {
    // Add user message
    messages.value.push({
      role: 'user',
      content: text,
      timestamp: Date.now(),
    })

    streaming.value = true
    currentStreamContent.value = ''
    const toolCalls: { name: string; result: string }[] = []

    try {
      const request: AgentChatRequest = {
        message: text,
        drama_id: dramaId,
        episode_id: episodeId.value,
      }

      for await (const event of agentAPI.streamChat(agentType.value, request)) {
        switch (event.type) {
          case 'content':
            currentStreamContent.value += event.data
            break
          case 'tool_call':
            toolCalls.push({ name: event.tool_name || 'unknown', result: '' })
            break
          case 'tool_result':
            if (toolCalls.length > 0) {
              toolCalls[toolCalls.length - 1].result = event.data
            }
            break
          case 'done':
            messages.value.push({
              role: 'assistant',
              content: currentStreamContent.value,
              agentType: agentType.value,
              toolCalls: toolCalls.length > 0 ? [...toolCalls] : undefined,
              timestamp: Date.now(),
            })
            currentStreamContent.value = ''
            break
          case 'error':
            messages.value.push({
              role: 'system',
              content: `Error: ${event.data}`,
              timestamp: Date.now(),
            })
            break
        }
      }
    } catch (err) {
      messages.value.push({
        role: 'system',
        content: `Connection error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now(),
      })
    } finally {
      streaming.value = false
    }
  }

  function clearMessages() {
    messages.value = []
    currentStreamContent.value = ''
  }

  return {
    agentType,
    messages,
    streaming,
    currentStreamContent,
    sendMessage,
    clearMessages,
  }
}
