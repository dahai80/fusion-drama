import { ref, computed } from 'vue'
import { dramaAPI } from '@/api/drama'
import type { Drama, Episode, Character, Scene, Storyboard } from '@/types/drama'

export type PipelineStage = 'script' | 'extracted' | 'storyboards'

export function useResourcePanel(dramaId: number, episodeNumber: number) {
  const drama = ref<Drama | null>(null)
  const episode = ref<Episode | null>(null)
  const characters = ref<Character[]>([])
  const scenes = ref<Scene[]>([])
  const storyboards = ref<Storyboard[]>([])
  const loading = ref(false)

  const expandedBlock = ref<'script' | 'characters' | 'scenes' | null>('script')

  const rawContent = computed(() => episode.value?.content || '')
  const hasRawContent = computed(() => !!rawContent.value)
  const scriptContent = computed(() => episode.value?.script_content || '')
  const hasScript = computed(() => !!scriptContent.value)
  const hasCharacters = computed(() => characters.value.length > 0)
  const hasScenes = computed(() => scenes.value.length > 0)

  const pipelineStage = computed<PipelineStage>(() => {
    if (storyboards.value.length > 0) return 'storyboards'
    if (hasCharacters.value || hasScenes.value) return 'extracted'
    return 'script'
  })

  function toggleBlock(block: 'script' | 'characters' | 'scenes') {
    expandedBlock.value = expandedBlock.value === block ? null : block
  }

  async function loadData() {
    loading.value = true
    try {
      drama.value = await dramaAPI.get(String(dramaId))
      const ep = drama.value.episodes?.find(e => e.episode_number === episodeNumber)
      if (ep) {
        episode.value = ep
        characters.value = drama.value.characters || []
        scenes.value = drama.value.scenes || []
        storyboards.value = await dramaAPI.getStoryboards(String(ep.id))
      }
    } finally {
      loading.value = false
    }
  }

  async function saveRawContent(content: string) {
    if (!episode.value) return
    episode.value.content = content
    await dramaAPI.updateEpisode(String(episode.value.id), { content })
  }

  async function saveScript(content: string) {
    if (!episode.value) return
    episode.value.script_content = content
    await dramaAPI.updateEpisode(String(episode.value.id), { script_content: content })
  }

  return {
    drama,
    episode,
    characters,
    scenes,
    storyboards,
    loading,
    expandedBlock,
    rawContent,
    hasRawContent,
    scriptContent,
    hasScript,
    hasCharacters,
    hasScenes,
    pipelineStage,
    toggleBlock,
    loadData,
    saveRawContent,
    saveScript,
  }
}
