<template>
  <div>
    <TabHeader :title="$t('drama.management.sceneList')">
      <template #actions>
        <Button
          v-if="!isBatchMode"
          variant="outline"
          size="sm"
          @click="isBatchMode = true"
        >{{ $t('common.batchMode') }}</Button>
        <Button variant="outline" @click="openExtractSceneDialog">
          <FileText :size="16" class="mr-1" />
          {{ $t('scene.extractTitle') }}
        </Button>
        <Button @click="openAddSceneDialog">
          <Plus :size="16" class="mr-1" />
          {{ $t('scene.addScene') }}
        </Button>
      </template>
      <template #filter>
        <div class="filter-input-wrapper">
          <Search :size="16" class="filter-icon" />
          <Input
            v-model="searchQuery"
            :placeholder="$t('scene.searchPlaceholder')"
            class="filter-input"
          />
        </div>
      </template>
    </TabHeader>

    <!-- 批量操作栏 -->
    <div v-if="isBatchMode" class="batch-bar">
      <Checkbox
        :checked="isAllSelected"
        :indeterminate="isIndeterminate"
        @update:checked="toggleAll"
      />
      <span class="batch-bar__label">{{ $t('common.selectAll') }}</span>
      <span class="batch-bar__count">{{ $t('common.selectedCount', { count: selectedCount }) }}</span>
      <Button size="sm" variant="destructive" :disabled="selectedCount === 0" @click="batchDeleteScenes">{{ $t('common.batchDelete') }}</Button>
      <Button size="sm" variant="outline" :disabled="selectedCount === 0" @click="batchGenerateSceneImages">{{ $t('common.batchGenerate') }}</Button>
      <Button size="sm" variant="ghost" @click="clearSelection">{{ $t('common.cancelBatch') }}</Button>
    </div>

    <div v-if="filteredItems.length > 0" class="list-container">
      <div
        v-for="scene in filteredItems"
        :key="scene.id"
        class="list-row glass-list-row"
        @click="editScene(scene)"
      >
        <Checkbox
          v-if="isBatchMode"
          :checked="selectedIds.has(scene.id)"
          @update:checked="() => toggleItem(scene.id)"
          @click.stop
        />
        <div class="row-thumb" :class="{ 'row-thumb-icon': !hasSceneImage(scene) }">
          <img v-if="hasSceneImage(scene)" :src="getImageUrl(scene)" :alt="scene.title || scene.location" />
          <ImageIcon v-else :size="20" />
        </div>
        <div class="row-body">
          <div class="row-top">
            <span class="row-title">{{ scene.title || scene.location }}</span>
            <span v-if="scene.time" class="glass-chip glass-chip-info">{{ scene.time }}</span>
          </div>
          <div class="row-bottom">
            <span class="row-desc">{{ scene.description || '-' }}</span>
          </div>
        </div>
        <div class="row-actions" @click.stop>
          <ActionButton :icon="Pencil" :tooltip="$t('common.edit')" variant="primary" @click="editScene(scene)" />
          <ActionButton :icon="ImageIcon" :tooltip="$t('prop.generateImage')" @click="generateSceneImage(scene)" />
          <ActionButton :icon="Trash2" :tooltip="$t('common.delete')" variant="danger" @click="deleteScene(scene)" />
        </div>
      </div>
    </div>

    <EmptyState
      v-else-if="scenes.length === 0"
      :title="$t('drama.management.noScenes')"
      :description="$t('scene.emptyTip')"
      :icon="ImageIcon"
    >
      <Button @click="openAddSceneDialog">
        <Plus :size="16" class="mr-1" />
        {{ $t('scene.addScene') }}
      </Button>
    </EmptyState>

    <EmptyState v-else :title="$t('common.noData')" :description="$t('common.noData')" :icon="Search" />

    <!-- 添加/编辑场景对话框 -->
    <Dialog v-model:open="addSceneDialogVisible">
      <DialogContent class="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{{ editingScene ? $t('common.edit') : $t('common.add') }}</DialogTitle>
        </DialogHeader>
        <div class="dialog-form">
          <div class="form-field">
            <label class="form-label">{{ $t('common.image') }}</label>
            <div class="avatar-upload scene-upload" @click="sceneFileInput?.click()">
              <img v-if="hasSceneImage(newScene)" :src="getImageUrl(newScene)" class="avatar-preview" />
              <div v-else class="avatar-placeholder"><Plus :size="28" /></div>
            </div>
            <input ref="sceneFileInput" type="file" accept="image/*" class="hidden" @change="handleSceneFileChange" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ $t('scene.location') }}</label>
            <Input v-model="newScene.location" :placeholder="$t('scene.location')" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ $t('scene.prompt') }}</label>
            <textarea v-model="newScene.prompt" class="glass-input-base form-textarea" :rows="3" :placeholder="$t('scene.prompt')" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="addSceneDialogVisible = false">{{ $t('common.cancel') }}</Button>
          <Button @click="saveScene">{{ $t('common.confirm') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 从剧本提取场景对话框 -->
    <Dialog v-model:open="extractScenesDialogVisible">
      <DialogContent class="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{{ $t('scene.batchExtract') }}</DialogTitle>
        </DialogHeader>
        <div class="dialog-form">
          <div class="form-field">
            <label class="form-label">{{ $t('scene.selectEpisodes') }}</label>
            <div class="episode-select">
              <div class="select-all-row">
                <Checkbox
                  :checked="selectAllScenesEpisodes"
                  :indeterminate="isScenesIndeterminate"
                  @update:checked="handleSelectAllScenesEpisodes"
                />
                <span>{{ $t('common.selectAll') }}</span>
              </div>
              <div class="episode-checkboxes">
                <label v-for="ep in sortedEpisodes" :key="ep.id" class="episode-checkbox-item">
                  <Checkbox
                    :checked="selectedScenesEpisodeIds.includes(ep.id)"
                    @update:checked="(val: boolean) => toggleSceneEpisodeSelection(ep.id, val)"
                  />
                  <span>{{ ep.title }}</span>
                </label>
              </div>
            </div>
          </div>
          <div class="info-alert">
            <Info :size="16" />
            <span>{{ $t('scene.batchExtractTip') }}</span>
          </div>
          <div v-if="scenesExtractProgress.active" class="progress-section">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: scenesExtractProgress.percent + '%' }" :class="{ 'progress-error': scenesExtractProgress.status === 'exception' }" />
            </div>
            <p class="progress-message">{{ scenesExtractProgress.message }}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="extractScenesDialogVisible = false" :disabled="scenesExtractProgress.active">{{ $t('common.cancel') }}</Button>
          <Button
            @click="handleExtractScenes"
            :disabled="selectedScenesEpisodeIds.length === 0 || scenesExtractProgress.active"
          >
            <Loader2 v-if="scenesExtractProgress.active" :size="16" class="animate-spin mr-1" />
            {{ $t('prop.startExtract') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { FileText, Plus, Search, Image as ImageIcon, Pencil, Trash2, Info, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { TabHeader, ActionButton, EmptyState } from '@/components/common'
import { getImageUrl } from '@/utils/image'
import { useFilteredList } from '@/composables/useFilteredList'
import { useBatchSelection } from '@/composables/useBatchSelection'
import { useDramaStore } from '@/stores/drama'
import { dramaAPI } from '@/api/drama'
import { taskAPI } from '@/api/task'
import type { Scene } from '@/types/drama'

const { t } = useI18n()
const dramaStore = useDramaStore()
const sceneFileInput = ref<HTMLInputElement>()

let pollingTimer: ReturnType<typeof setInterval> | null = null

onUnmounted(() => {
  if (pollingTimer) clearInterval(pollingTimer)
})

const scenes = computed(() => dramaStore.scenes)
const sortedEpisodes = computed(() => {
  const eps = dramaStore.episodes
  return Array.isArray(eps) ? [...eps].sort((a, b) => a.episode_number - b.episode_number) : []
})

const hasSceneImage = (scene: { local_path?: string; image_url?: string }) => !!(scene.local_path || scene.image_url)

const { searchQuery, filteredItems } = useFilteredList({
  items: scenes,
  searchFields: ['title', 'location', 'description'] as (keyof Scene)[],
})

const {
  selectedIds, isBatchMode, isAllSelected, isIndeterminate,
  selectedItems, selectedCount, toggleItem, toggleAll, clearSelection,
} = useBatchSelection(filteredItems)

// --- Dialog state ---
const addSceneDialogVisible = ref(false)
const editingScene = ref<Scene | null>(null)
const newScene = ref({ location: '', prompt: '', image_url: '', local_path: '' })

const extractScenesDialogVisible = ref(false)
const selectedScenesEpisodeIds = ref<(string | number)[]>([])
const selectAllScenesEpisodes = ref(false)
const isScenesIndeterminate = ref(false)
const scenesExtractProgress = ref({
  active: false, percent: 0, message: '', status: '' as '' | 'success' | 'exception',
})

const reloadDrama = async () => { await dramaStore.loadDrama(dramaStore.dramaId) }

const startPolling = (callback: () => Promise<void>, maxAttempts = 20, interval = 3000) => {
  if (pollingTimer) clearInterval(pollingTimer)
  let attempts = 0
  pollingTimer = setInterval(async () => {
    attempts++
    await callback()
    if (attempts >= maxAttempts) { if (pollingTimer) clearInterval(pollingTimer); pollingTimer = null }
  }, interval)
}

const openAddSceneDialog = () => {
  editingScene.value = null
  newScene.value = { location: '', prompt: '', image_url: '', local_path: '' }
  addSceneDialogVisible.value = true
}

const editScene = (scene: Scene) => {
  editingScene.value = scene
  newScene.value = {
    location: scene.location || scene.name || '',
    prompt: scene.prompt || scene.description || '',
    image_url: scene.image_url || '',
    local_path: scene.local_path || '',
  }
  addSceneDialogVisible.value = true
}

const handleSceneFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) { toast.error(t('message.imageOnlyUpload')); return }
  if (file.size / 1024 / 1024 >= 10) { toast.error(t('message.imageSizeLimit')); return }

  const formData = new FormData()
  formData.append('file', file)
  try {
    const response = await fetch('/api/v1/upload/image', { method: 'POST', body: formData })
    const result = await response.json()
    if (result.data?.url) {
      newScene.value.image_url = result.data.url
      newScene.value.local_path = result.data.local_path || ''
    }
  } catch { toast.error('Upload failed') }
  input.value = ''
}

const saveScene = async () => {
  if (!newScene.value.location.trim()) { toast.warning(t('message.enterSceneName')); return }
  try {
    if (editingScene.value) {
      await dramaAPI.updateScene(editingScene.value.id, {
        location: newScene.value.location, description: newScene.value.prompt,
        image_url: newScene.value.image_url, local_path: newScene.value.local_path,
      })
    } else {
      await dramaAPI.createScene({
        drama_id: Number(dramaStore.dramaId), location: newScene.value.location,
        prompt: newScene.value.prompt, description: newScene.value.prompt,
        image_url: newScene.value.image_url, local_path: newScene.value.local_path,
      })
    }
    toast.success(t(editingScene.value ? 'message.sceneUpdateSuccess' : 'message.sceneAddSuccess'))
    addSceneDialogVisible.value = false
    await reloadDrama()
  } catch (error: any) { toast.error(error.message || t('message.operationFailed')) }
}

const deleteScene = async (scene: Scene) => {
  if (!scene.id) { toast.error(t('message.sceneIdNotExist')); return }
  if (!window.confirm(t('message.sceneDeleteConfirm', { name: scene.name || scene.location }))) return
  try {
    await dramaAPI.deleteScene(scene.id.toString())
    toast.success(t('message.sceneDeleted'))
    await reloadDrama()
  } catch (error: any) { toast.error(error.message || t('message.deleteFailed')) }
}

const generateSceneImage = async (scene: Scene) => {
  try {
    await dramaAPI.generateSceneImage({ scene_id: scene.id })
    toast.success(t('message.imageTaskSubmitted'))
    startPolling(reloadDrama)
  } catch (error: any) { toast.error(error.message || t('message.generateFailed')) }
}

const batchDeleteScenes = async () => {
  if (!window.confirm(t('common.batchDeleteConfirm', { count: selectedCount.value }))) return
  try {
    for (const scene of selectedItems.value) { await dramaAPI.deleteScene(scene.id.toString()) }
    toast.success(t('message.batchDeleteSuccess'))
    clearSelection()
    await reloadDrama()
  } catch (error: any) { toast.error(error.message || t('message.deleteFailed')) }
}

const batchGenerateSceneImages = async () => {
  try {
    for (const scene of selectedItems.value) { await dramaAPI.generateSceneImage({ scene_id: scene.id }) }
    toast.success(t('message.imageTaskSubmitted'))
    clearSelection()
    startPolling(reloadDrama)
  } catch (error: any) { toast.error(error.message || t('message.generateFailed')) }
}

// --- Extract scenes ---
const openExtractSceneDialog = () => {
  extractScenesDialogVisible.value = true
  selectedScenesEpisodeIds.value = []
  selectAllScenesEpisodes.value = false
  isScenesIndeterminate.value = false
  scenesExtractProgress.value = { active: false, percent: 0, message: '', status: '' }
}

const handleSelectAllScenesEpisodes = (val: boolean) => {
  selectedScenesEpisodeIds.value = val ? sortedEpisodes.value.map(ep => ep.id) : []
  selectAllScenesEpisodes.value = val
  isScenesIndeterminate.value = false
}

const toggleSceneEpisodeSelection = (id: string | number, checked: boolean) => {
  if (checked) { selectedScenesEpisodeIds.value = [...selectedScenesEpisodeIds.value, id] }
  else { selectedScenesEpisodeIds.value = selectedScenesEpisodeIds.value.filter(v => v !== id) }
  const total = sortedEpisodes.value.length
  selectAllScenesEpisodes.value = selectedScenesEpisodeIds.value.length === total
  isScenesIndeterminate.value = selectedScenesEpisodeIds.value.length > 0 && selectedScenesEpisodeIds.value.length < total
}

const handleExtractScenes = async () => {
  if (selectedScenesEpisodeIds.value.length === 0) return
  try {
    scenesExtractProgress.value = { active: true, percent: 0, message: t('character.extracting'), status: '' }
    const res = await dramaAPI.batchExtractBackgrounds(dramaStore.dramaId, selectedScenesEpisodeIds.value.map(Number))
    const taskId = res.task_id
    const pollInterval = setInterval(async () => {
      try {
        const task = await taskAPI.getStatus(taskId)
        if (task.progress !== undefined) scenesExtractProgress.value.percent = task.progress
        if (task.message) scenesExtractProgress.value.message = task.message
        if (task.status === 'completed') {
          clearInterval(pollInterval)
          const result = typeof task.result === 'string' ? JSON.parse(task.result) : task.result
          scenesExtractProgress.value = { active: false, percent: 100, message: t('scene.extractComplete', { scenes: result?.scenes || 0, dedup: result?.dedup_scenes || 0 }), status: 'success' }
          await reloadDrama()
        } else if (task.status === 'failed') {
          clearInterval(pollInterval)
          scenesExtractProgress.value = { active: false, percent: 0, message: task.error || t('common.failed'), status: 'exception' }
        }
      } catch { clearInterval(pollInterval); scenesExtractProgress.value = { active: false, percent: 0, message: t('common.failed'), status: 'exception' } }
    }, 3000)
  } catch (error: any) {
    scenesExtractProgress.value = { active: false, percent: 0, message: '', status: '' }
    toast.error(error.message || t('message.extractFailed'))
  }
}
</script>

<style scoped>
.batch-bar { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4); background: var(--bg-card-hover); border-radius: var(--radius-lg); flex-wrap: wrap; }
.batch-bar__label { font-size: 0.875rem; color: var(--text-primary); }
.batch-bar__count { font-size: 0.875rem; color: var(--text-secondary); }
.hidden { display: none; }
.avatar-upload { width: 160px; height: 90px; border: 1px dashed var(--border-primary); border-radius: 6px; cursor: pointer; overflow: hidden; display: flex; align-items: center; justify-content: center; color: var(--text-muted); transition: border-color 0.2s; }
.avatar-upload:hover { border-color: var(--accent); }
.avatar-preview { width: 100%; height: 100%; object-fit: cover; }
.avatar-placeholder { display: flex; align-items: center; justify-content: center; }
.dialog-form { display: flex; flex-direction: column; gap: 1rem; }
.form-field { display: flex; flex-direction: column; gap: 0.5rem; }
.form-label { font-size: 0.875rem; font-weight: 500; color: var(--text-primary); }
.form-textarea { width: 100%; resize: none; padding: 0.5rem 0.75rem; border-radius: var(--radius-md); font-size: 0.875rem; }
.filter-input-wrapper { position: relative; width: 220px; }
.filter-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-tertiary); pointer-events: none; z-index: 1; }
.filter-input { padding-left: 32px; }
.mr-1 { margin-right: 0.25rem; }
.episode-select { display: flex; flex-direction: column; gap: 8px; }
.select-all-row { display: flex; align-items: center; gap: 8px; }
.episode-checkboxes { display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto; padding-left: 4px; }
.episode-checkbox-item { display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer; }
.info-alert { display: flex; align-items: flex-start; gap: 8px; padding: 12px; background: var(--glass-tone-info-bg); border-radius: var(--radius-md); font-size: 0.8125rem; color: var(--glass-tone-info-fg); }
.progress-section { margin-top: 8px; }
.progress-bar { width: 100%; height: 6px; background: var(--bg-secondary); border-radius: 3px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent); border-radius: 3px; transition: width 0.3s; }
.progress-fill.progress-error { background: #ef4444; }
.progress-message { margin-top: 8px; font-size: 0.8125rem; color: var(--text-secondary); }
</style>
