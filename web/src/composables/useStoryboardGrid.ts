import { ref, computed, type Ref } from 'vue'
import type { Storyboard } from '@/types/drama'

export type ViewMode = 'grid' | 'edit'

export function useStoryboardGrid(storyboards: Ref<Storyboard[]>) {
  const viewMode = ref<ViewMode>('grid')
  const selectedStoryboardId = ref<string | null>(null)
  const selectedIds = ref<Set<number>>(new Set())

  const safeStoryboards = computed(() => Array.isArray(storyboards.value) ? storyboards.value : [])

  const currentStoryboard = computed(() => {
    if (!selectedStoryboardId.value) return null
    return safeStoryboards.value.find(s => String(s.id) === selectedStoryboardId.value) || null
  })

  const progress = computed(() => {
    const raw = storyboards.value
    const all = Array.isArray(raw) ? raw : []
    const withImage = all.filter(s => s.image_url).length
    const withVideo = all.filter(s => (s as any).videos?.length > 0).length
    return { total: all.length, withImage, withVideo }
  })

  function selectStoryboard(id: string) {
    selectedStoryboardId.value = id
    viewMode.value = 'edit'
  }

  function backToGrid() {
    viewMode.value = 'grid'
  }

  function selectPrev() {
    const all = safeStoryboards.value
    const idx = all.findIndex(s => String(s.id) === selectedStoryboardId.value)
    if (idx > 0) selectedStoryboardId.value = String(all[idx - 1].id)
  }

  function selectNext() {
    const all = safeStoryboards.value
    const idx = all.findIndex(s => String(s.id) === selectedStoryboardId.value)
    if (idx >= 0 && idx < all.length - 1) selectedStoryboardId.value = String(all[idx + 1].id)
  }

  function toggleSelection(id: number) {
    if (selectedIds.value.has(id)) {
      selectedIds.value.delete(id)
    } else {
      selectedIds.value.add(id)
    }
  }

  return {
    viewMode,
    selectedStoryboardId,
    selectedIds,
    currentStoryboard,
    progress,
    selectStoryboard,
    backToGrid,
    selectPrev,
    selectNext,
    toggleSelection,
  }
}
