import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useResourcePanel } from './useResourcePanel'
import { useStoryboardGrid } from './useStoryboardGrid'
import { useFrameImageGeneration } from './useFrameImageGeneration'
import { useVideoGenerationPro } from './useVideoGenerationPro'

export function useEpisodeWorkbench() {
  const route = useRoute()
  const dramaId = Number(route.params.id)
  const episodeNumber = Number(route.params.episodeNumber)

  const resource = useResourcePanel(dramaId, episodeNumber)
  const grid = useStoryboardGrid(resource.storyboards)

  // imageGen expects Ref<Storyboard | null> — grid.currentStoryboard is computed ref
  const imageGen = useFrameImageGeneration(grid.currentStoryboard, dramaId)

  // videoGen expects Ref types
  const episodeIdRef = computed(() => resource.episode.value?.id || 0)
  const timelineEditorRef = ref(null)

  const videoGen = useVideoGenerationPro(
    grid.currentStoryboard,
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
    grid,
    imageGen,
    videoGen,
  }
}
