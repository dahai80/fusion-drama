import { toast } from 'vue-sonner'
import { api } from './useApi'
import { toastError } from './useToast'
import { i18n } from './i18n'

// L8: agent 多步对话（maxSteps 20 + 本地模型）远超 useApi POST 默认 120s，给独立上限
const AGENT_TIMEOUT_MS = 30 * 60_000

export function useAgent() {
  const running = ref(false)
  const runningType = ref<string | null>(null)

  async function run(type: string, msg: string, dramaId: number, episodeId: number, onDone?: () => void, model?: string, configId?: number) {
    if (running.value) { toast.warning(i18n.global.t('composables.agent.busy')); return }
    running.value = true
    runningType.value = type
    try {
      const data = await api.post<any>(`/agent/${type}/chat`, {
        message: msg,
        drama_id: dramaId,
        episode_id: episodeId,
        model: model || undefined,
        config_id: configId || undefined,
      }, AGENT_TIMEOUT_MS)
      toast.success(i18n.global.t('composables.agent.done'))
      // 监督层判定：不通过时把问题清单顶给用户（通过/降级不额外打扰）
      const review = data?.review
      if (review && review.pass === false) {
        const issues = Array.isArray(review.issues) && review.issues.length
          ? review.issues.join('；')
          : ''
        toast.warning(i18n.global.t('composables.agent.reviewFailed', { summary: review.summary || '' }), {
          description: issues,
          duration: 10000,
        })
      }
      onDone?.()
    } catch (err: any) {
      toastError(err)
    } finally {
      running.value = false
      runningType.value = null
    }
  }

  return { running, runningType, run }
}
