import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useResourcePanel } from './useResourcePanel'
import { useStoryboardTable } from './useStoryboardTable'
import { useFrameImageGeneration } from './useFrameImageGeneration'
import { useVideoGenerationPro } from './useVideoGenerationPro'

export function useEpisodeWorkbench() {
  const route = useRoute()
  const dramaId = Number(route.params.id)
  const episodeNumber = Number(route.params.episodeNumber)

  const resource = useResourcePanel(dramaId, episodeNumber)
  const table = useStoryboardTable(resource.storyboards)

  // imageGen needs a current storyboard ref — use first selected or null
  const currentStoryboard = computed(() => {
    const selected = table.selectedStoryboards.value
    return selected.length === 1 ? selected[0] : null
  })

  const imageGen = useFrameImageGeneration(currentStoryboard, dramaId)

  const episodeIdRef = computed(() => resource.episode.value?.id || 0)
  const timelineEditorRef = ref(null)

  const videoGen = useVideoGenerationPro(
    currentStoryboard,
    dramaId,
    episodeIdRef,
    resource.storyboards,
    imageGen.videoReferenceImages,
    timelineEditorRef,
  )

  onMounted(async () => {
    await resource.loadData()
    await videoGen.loadVideoModels()
  })

  onBeforeUnmount(() => {
    imageGen.stopPolling()
    videoGen.stopVideoPolling()
  })

  return {
    dramaId,
    episodeNumber,
    resource,
    table,
    imageGen,
    videoGen,
  }
}
