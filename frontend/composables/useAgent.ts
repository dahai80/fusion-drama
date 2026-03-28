import { toast } from 'vue-sonner'
import { streamAgent } from './useApi'

export function useAgent() {
  const running = ref(false)
  const runningType = ref<string | null>(null)

  async function run(type: string, msg: string, dramaId: number, episodeId: number, onDone?: () => void) {
    if (running.value) { toast.warning('操作执行中'); return }
    running.value = true
    runningType.value = type
    const tid = toast.loading('处理中...')
    try {
      for await (const e of streamAgent(type, msg, dramaId, episodeId)) {
        if (e.type === 'tool_call') toast.loading(`${e.tool_name}...`, { id: tid })
        else if (e.type === 'tool_result') toast.loading(`${e.tool_name} ✓`, { id: tid })
        else if (e.type === 'done') { toast.success('完成', { id: tid }); onDone?.() }
        else if (e.type === 'error') toast.error(e.data, { id: tid })
      }
    } catch (err: any) { toast.error(err.message, { id: tid }) }
    finally { running.value = false; runningType.value = null }
  }

  return { running, runningType, run }
}
