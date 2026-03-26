import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { agentAPI } from '@/api/agent'
import type { AgentType } from '@/types/agent'

/**
 * 一键执行 Agent 操作（流水线模式，不需要用户输入）
 * 调用 agent SSE 接口，自动发送预设消息，流式接收结果
 */
export function useAgentAction() {
  const running = ref(false)
  const runningType = ref<AgentType | null>(null)
  const progress = ref('')

  async function execute(
    agentType: AgentType,
    dramaId: number,
    episodeId: number,
    message: string,
    onDone?: () => void,
  ) {
    if (running.value) {
      toast.warning('有操作正在执行中')
      return
    }

    running.value = true
    runningType.value = agentType
    progress.value = '正在处理...'

    const toastId = toast.loading(progress.value, { duration: Infinity })

    try {
      let lastContent = ''

      for await (const event of agentAPI.streamChat(agentType, {
        message,
        drama_id: dramaId,
        episode_id: episodeId,
      })) {
        switch (event.type) {
          case 'tool_call':
            progress.value = `调用 ${event.tool_name || '工具'}...`
            toast.loading(progress.value, { id: toastId })
            break
          case 'tool_result':
            progress.value = `${event.tool_name || '工具'} 完成`
            toast.loading(progress.value, { id: toastId })
            break
          case 'content':
            lastContent += event.data
            // Show first 50 chars of content as progress
            const preview = lastContent.length > 50
              ? lastContent.slice(0, 50) + '...'
              : lastContent
            progress.value = preview
            toast.loading(progress.value, { id: toastId })
            break
          case 'done':
            toast.success('操作完成', { id: toastId })
            onDone?.()
            break
          case 'error':
            toast.error(`操作失败: ${event.data}`, { id: toastId })
            break
        }
      }
    } catch (err) {
      toast.error(`连接失败: ${err instanceof Error ? err.message : '未知错误'}`, { id: toastId })
    } finally {
      running.value = false
      runningType.value = null
      progress.value = ''
    }
  }

  return {
    running,
    runningType,
    progress,
    execute,
  }
}
