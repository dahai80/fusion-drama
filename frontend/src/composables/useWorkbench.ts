import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { toast } from 'vue-sonner'
import { dramaAPI, episodeAPI, storyboardAPI, characterAPI, imageAPI, videoAPI, composeAPI, mergeAPI, streamAgent } from '@/api'

export type Panel = 'script' | 'storyboard' | 'production' | 'export'

export function useWorkbench() {
  const route = useRoute()
  const dramaId = Number(route.params.id)
  const episodeNumber = Number(route.params.episodeNumber)

  const drama = ref<any>(null)
  const episode = ref<any>(null)
  const characters = ref<any[]>([])
  const scenes = ref<any[]>([])
  const storyboards = ref<any[]>([])
  const pipelineStatus = ref<any>(null)
  const mergeStatus = ref<any>(null)
  const loading = ref(false)

  const activePanel = ref<Panel>('script')
  const agentRunning = ref(false)
  const agentRunningType = ref<string | null>(null)

  const episodeId = computed(() => episode.value?.id || 0)
  const rawContent = computed(() => episode.value?.content || '')
  const scriptContent = computed(() => episode.value?.script_content || episode.value?.scriptContent || '')

  async function loadData() {
    loading.value = true
    try {
      drama.value = await dramaAPI.get(dramaId)
      const ep = drama.value.episodes?.find((e: any) => (e.episode_number || e.episodeNumber) === episodeNumber)
      if (ep) {
        episode.value = ep
        characters.value = drama.value.characters || []
        scenes.value = drama.value.scenes || []
        storyboards.value = await episodeAPI.getStoryboards(ep.id)
      }
    } catch (err: any) { toast.error(err.message) }
    finally { loading.value = false }
  }

  async function loadPipelineStatus() {
    if (!episodeId.value) return
    try { pipelineStatus.value = await episodeAPI.getPipelineStatus(episodeId.value) } catch {}
  }

  async function loadMergeStatus() {
    if (!episodeId.value) return
    try { mergeStatus.value = await mergeAPI.getStatus(episodeId.value) } catch {}
  }

  async function saveRawContent(content: string) {
    if (!episode.value) return
    episode.value.content = content
    await episodeAPI.update(episode.value.id, { content })
  }

  async function saveScript(content: string) {
    if (!episode.value) return
    episode.value.script_content = content
    await episodeAPI.update(episode.value.id, { script_content: content })
  }

  async function generateVoiceSample(charId: number) {
    try {
      await characterAPI.generateVoiceSample(charId)
      toast.success('试听音频已生成')
      await loadData()
    } catch (err: any) { toast.error(err.message) }
  }

  async function saveStoryboardField(id: number, field: string, value: any) {
    await storyboardAPI.update(id, { [field]: value })
  }

  async function addStoryboard() {
    if (!episode.value) return
    await storyboardAPI.create({ episode_id: episode.value.id, storyboard_number: storyboards.value.length + 1, title: `镜头 ${storyboards.value.length + 1}`, duration: 10 })
    await loadData()
    toast.success('已添加镜头')
  }

  async function generateImage(sbId: number, prompt: string) {
    try { await imageAPI.generate({ storyboard_id: sbId, drama_id: dramaId, prompt }); toast.success('图片生成已开始') } catch (err: any) { toast.error(err.message) }
  }

  async function generateVideo(sbId: number, prompt: string) {
    try { await videoAPI.generate({ storyboard_id: sbId, drama_id: dramaId, prompt }); toast.success('视频生成已开始') } catch (err: any) { toast.error(err.message) }
  }

  async function composeShot(sbId: number) {
    try { await composeAPI.composeShot(sbId); toast.success('合成完成'); await loadData() } catch (err: any) { toast.error(err.message) }
  }

  async function composeAll() {
    if (!episodeId.value) return
    try { await composeAPI.composeAll(episodeId.value); toast.success('批量合成已开始') } catch (err: any) { toast.error(err.message) }
  }

  async function mergeEpisode() {
    if (!episodeId.value) return
    try {
      await mergeAPI.merge(episodeId.value)
      toast.success('视频拼接已开始')
      const poll = setInterval(async () => {
        await loadMergeStatus()
        if (mergeStatus.value?.status === 'completed' || mergeStatus.value?.status === 'failed') {
          clearInterval(poll)
          if (mergeStatus.value.status === 'completed') toast.success('拼接完成！')
          else toast.error('拼接失败')
        }
      }, 3000)
    } catch (err: any) { toast.error(err.message) }
  }

  async function runAgent(type: string, message: string, onDone?: () => void) {
    if (agentRunning.value) { toast.warning('有操作正在执行'); return }
    agentRunning.value = true
    agentRunningType.value = type
    const toastId = toast.loading('正在处理...')
    try {
      for await (const event of streamAgent(type, message, dramaId, episodeId.value)) {
        if (event.type === 'tool_call') toast.loading(`调用 ${event.tool_name}...`, { id: toastId })
        else if (event.type === 'tool_result') toast.loading(`${event.tool_name} 完成`, { id: toastId })
        else if (event.type === 'done') { toast.success('操作完成', { id: toastId }); onDone?.() }
        else if (event.type === 'error') toast.error(`失败: ${event.data}`, { id: toastId })
      }
    } catch (err: any) { toast.error(`连接失败: ${err.message}`, { id: toastId }) }
    finally { agentRunning.value = false; agentRunningType.value = null }
  }

  onMounted(() => { loadData(); loadPipelineStatus() })

  return {
    dramaId, episodeNumber, drama, episode, characters, scenes, storyboards,
    pipelineStatus, mergeStatus, loading, activePanel, agentRunning, agentRunningType,
    episodeId, rawContent, scriptContent,
    loadData, loadPipelineStatus, loadMergeStatus,
    saveRawContent, saveScript, generateVoiceSample,
    saveStoryboardField, addStoryboard,
    generateImage, generateVideo, composeShot, composeAll,
    mergeEpisode, runAgent,
  }
}
