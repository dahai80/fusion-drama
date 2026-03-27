import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import { dramaAPI, episodeAPI, storyboardAPI, streamAgent } from '@/api'

export function useWorkbench() {
  const route = useRoute()
  const dramaId = Number(route.params.id)
  const episodeNumber = Number(route.params.episodeNumber)

  const drama = ref<any>(null)
  const episode = ref<any>(null)
  const characters = ref<any[]>([])
  const scenes = ref<any[]>([])
  const storyboards = ref<any[]>([])
  const loading = ref(false)
  const activeTab = ref<'script' | 'storyboard'>('script')

  // Agent execution state
  const agentRunning = ref(false)
  const agentRunningType = ref<string | null>(null)

  const episodeId = computed(() => episode.value?.id || 0)
  const rawContent = computed(() => episode.value?.content || '')
  const scriptContent = computed(() => episode.value?.script_content || episode.value?.scriptContent || '')
  const hasRaw = computed(() => !!rawContent.value)
  const hasScript = computed(() => !!scriptContent.value)
  const hasCharacters = computed(() => characters.value.length > 0)
  const hasScenes = computed(() => scenes.value.length > 0)

  async function loadData() {
    loading.value = true
    try {
      drama.value = await dramaAPI.get(dramaId)
      const ep = drama.value.episodes?.find((e: any) =>
        (e.episode_number || e.episodeNumber) === episodeNumber
      )
      if (ep) {
        episode.value = ep
        characters.value = drama.value.characters || []
        scenes.value = drama.value.scenes || []
        storyboards.value = await episodeAPI.getStoryboards(ep.id)
      }
    } catch (err: any) { toast.error(err.message) }
    finally { loading.value = false }
  }

  async function saveRawContent(content: string) {
    if (!episode.value) return
    episode.value.content = content
    await episodeAPI.update(episode.value.id, { content })
  }

  async function saveScript(content: string) {
    if (!episode.value) return
    episode.value.script_content = content
    episode.value.scriptContent = content
    await episodeAPI.update(episode.value.id, { script_content: content })
  }

  async function saveStoryboardField(id: number, field: string, value: any) {
    await storyboardAPI.update(id, { [field]: value })
  }

  async function addStoryboard() {
    if (!episode.value) return
    const num = storyboards.value.length + 1
    await storyboardAPI.create({
      episode_id: episode.value.id,
      storyboard_number: num,
      title: `镜头 ${num}`,
      duration: 10,
    })
    await loadData()
    toast.success('已添加镜头')
  }

  // Agent execution
  async function runAgent(type: string, message: string, onDone?: () => void) {
    if (agentRunning.value) { toast.warning('有操作正在执行'); return }
    agentRunning.value = true
    agentRunningType.value = type
    const toastId = toast.loading('正在处理...')

    try {
      for await (const event of streamAgent(type, message, dramaId, episodeId.value)) {
        if (event.type === 'tool_call') {
          toast.loading(`调用 ${event.tool_name}...`, { id: toastId })
        } else if (event.type === 'tool_result') {
          toast.loading(`${event.tool_name} 完成`, { id: toastId })
        } else if (event.type === 'done') {
          toast.success('操作完成', { id: toastId })
          onDone?.()
        } else if (event.type === 'error') {
          toast.error(`失败: ${event.data}`, { id: toastId })
        }
      }
    } catch (err: any) {
      toast.error(`连接失败: ${err.message}`, { id: toastId })
    } finally {
      agentRunning.value = false
      agentRunningType.value = null
    }
  }

  onMounted(loadData)

  return {
    dramaId, episodeNumber, drama, episode, characters, scenes, storyboards,
    loading, activeTab, agentRunning, agentRunningType,
    episodeId, rawContent, scriptContent, hasRaw, hasScript, hasCharacters, hasScenes,
    loadData, saveRawContent, saveScript, saveStoryboardField, addStoryboard, runAgent,
  }
}
