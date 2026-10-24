import { toast } from 'vue-sonner'
import { toastError } from './useToast'
import { i18n } from './i18n'

// L8: agent 多步对话（maxSteps 20 + 本地模型）远超 useApi POST 默认 120s，给独立上限
const AGENT_TIMEOUT_MS = 30 * 60_000

const BASE = '/api/v1'

// 全局流式状态（单 agent 实例运行，全局唯一即可）：episode.vue 的 AgentStreamPanel 订阅
const streamText = ref('')
const streamTools = ref<string[]>([])

function resetStream() {
    streamText.value = ''
    streamTools.value = []
}

export function useAgent() {
  const running = ref(false)
  const runningType = ref<string | null>(null)

  // SSE 流式版：delta 增量入 streamText，tool/tool_result 入 streamTools，
  // done 事件 resolve（语义与旧非流式一致：onDone 在完整结果落地后触发）
  // 返回 done 事件负载（text/toolCalls/review），失败返回 null——调用方需要区分成败时用返回值
  async function run(type: string, msg: string, dramaId: number, episodeId: number, onDone?: () => void, model?: string, configId?: number) {
    if (running.value) { toast.warning(i18n.global.t('composables.agent.busy')); return null }
    running.value = true
    runningType.value = type
    resetStream()
    let doneData: any = null
    try {
      const resp = await fetch(`${BASE}/agent/${type}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          drama_id: dramaId,
          episode_id: episodeId,
          model: model || undefined,
          config_id: configId || undefined,
        }),
        signal: AbortSignal.timeout(AGENT_TIMEOUT_MS),
      })
      if (!resp.ok || !resp.body) {
        let message = `HTTP ${resp.status}`
        try { const j: any = await resp.json(); if (j?.message) message = j.message } catch { /* non-JSON */ }
        throw new Error(message)
      }
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        // SSE 事件以空行分隔；逐块解析已完整的事件
        let sep: number
        while ((sep = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, sep)
          buf = buf.slice(sep + 2)
          let event = 'message'
          let data = ''
          for (const line of block.split('\n')) {
              if (line.startsWith('event: ')) event = line.slice(7).trim()
              else if (line.startsWith('data: ')) data += line.slice(6)
          }
          if (!data) continue
          let payload: any = null
          try { payload = JSON.parse(data) } catch { /* 跳过坏块 */ }
          if (event === 'delta' && payload?.text) {
              streamText.value += payload.text
          } else if (event === 'tool' && payload?.toolName) {
              streamTools.value.push(payload.toolName)
          } else if (event === 'tool_result' && payload?.toolName) {
              streamTools.value.push(`${payload.toolName} ✓`)
          } else if (event === 'done') {
              doneData = payload
          } else if (event === 'error') {
              throw new Error(payload?.message || 'Agent 流式执行失败')
          }
        }
      }
      toast.success(i18n.global.t('composables.agent.done'))
      // 监督层判定：不通过时把问题清单顶给用户（通过/降级不额外打扰）
      const review = doneData?.review
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
      return doneData
    } catch (err: any) {
      toastError(err)
      return null
    } finally {
      running.value = false
      runningType.value = null
      setTimeout(resetStream, 4000)
    }
  }

  return { running, runningType, run, streamText, streamTools }
}
