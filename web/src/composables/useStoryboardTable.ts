import { ref, computed, type Ref } from 'vue'
import type { Storyboard } from '@/types/drama'

export type WorkbenchTab = 'script' | 'storyboard'

export function useStoryboardTable(storyboards: Ref<Storyboard[]>) {
  const activeTab = ref<WorkbenchTab>('script')
  const selectedIds = ref<Set<string>>(new Set())

  const safeStoryboards = computed(() =>
    Array.isArray(storyboards.value) ? storyboards.value : []
  )

  const progress = computed(() => {
    const all = safeStoryboards.value
    const withImage = all.filter(s => s.image_url || s.local_path).length
    const withVideo = all.filter(s => s.video_url).length
    const generating = all.filter(s =>
      s.image_generation_status === 'processing' ||
      s.image_generation_status === 'generating' ||
      s.status === 'processing' ||
      s.status === 'generating'
    ).length
    const totalDuration = all.reduce((sum, s) => sum + (s.duration || 0), 0)
    return { total: all.length, withImage, withVideo, generating, totalDuration }
  })

  const allSelected = computed(() =>
    safeStoryboards.value.length > 0 &&
    safeStoryboards.value.every(s => selectedIds.value.has(s.id))
  )

  const hasSelection = computed(() => selectedIds.value.size > 0)

  const selectedStoryboards = computed(() =>
    safeStoryboards.value.filter(s => selectedIds.value.has(s.id))
  )

  function toggleSelect(id: string) {
    const next = new Set(selectedIds.value)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    selectedIds.value = next
  }

  function toggleSelectAll() {
    if (allSelected.value) {
      selectedIds.value = new Set()
    } else {
      selectedIds.value = new Set(safeStoryboards.value.map(s => s.id))
    }
  }

  function clearSelection() {
    selectedIds.value = new Set()
  }

  return {
    activeTab,
    selectedIds,
    safeStoryboards,
    progress,
    allSelected,
    hasSelection,
    selectedStoryboards,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
  }
}
