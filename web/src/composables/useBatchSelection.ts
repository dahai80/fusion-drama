import { ref, computed, type Ref } from 'vue'

export function useBatchSelection<T extends { id: number | string }>(items: Ref<T[]>) {
  const selectedIds = ref<Set<number | string>>(new Set())
  const isBatchMode = ref(false)

  const safeItems = computed(() => Array.isArray(items.value) ? items.value : [])

  const isAllSelected = computed(() =>
    safeItems.value.length > 0 && selectedIds.value.size === safeItems.value.length
  )

  const isIndeterminate = computed(() =>
    selectedIds.value.size > 0 && selectedIds.value.size < safeItems.value.length
  )

  const selectedItems = computed(() =>
    safeItems.value.filter(item => selectedIds.value.has(item.id))
  )

  const selectedCount = computed(() => selectedIds.value.size)

  function toggleItem(id: number | string) {
    const newSet = new Set(selectedIds.value)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    selectedIds.value = newSet
  }

  function toggleAll() {
    if (isAllSelected.value) {
      selectedIds.value = new Set()
    } else {
      selectedIds.value = new Set(safeItems.value.map(item => item.id))
    }
  }

  function clearSelection() {
    isBatchMode.value = false
    selectedIds.value = new Set()
  }

  return {
    selectedIds,
    isBatchMode,
    isAllSelected,
    isIndeterminate,
    selectedItems,
    selectedCount,
    toggleItem,
    toggleAll,
    clearSelection,
  }
}
