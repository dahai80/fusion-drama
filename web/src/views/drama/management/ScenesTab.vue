<template>
  <div>
    <TabHeader :title="$t('drama.management.sceneList')">
      <template #actions>
        <el-button
          v-if="!isBatchMode"
          size="small"
          @click="isBatchMode = true"
        >{{ $t('common.batchMode') }}</el-button>
        <el-button
          :icon="Document"
          @click="openExtractSceneDialog"
        >{{ $t('scene.extractTitle') }}</el-button>
        <el-button
          type="primary"
          :icon="Plus"
          @click="openAddSceneDialog"
        >{{ $t('scene.addScene') }}</el-button>
      </template>
      <template #filter>
        <el-input
          v-model="searchQuery"
          :placeholder="$t('scene.searchPlaceholder')"
          :prefix-icon="Search"
          clearable
          style="width: 220px"
        />
      </template>
    </TabHeader>

    <!-- 批量操作栏 -->
    <div v-if="isBatchMode" class="batch-bar">
      <el-checkbox
        :model-value="isAllSelected"
        :indeterminate="isIndeterminate"
        @change="toggleAll"
      >{{ $t('common.selectAll') }}</el-checkbox>
      <span class="batch-bar__count">{{ $t('common.selectedCount', { count: selectedCount }) }}</span>
      <el-button
        size="small"
        type="danger"
        :disabled="selectedCount === 0"
        @click="batchDeleteScenes"
      >{{ $t('common.batchDelete') }}</el-button>
      <el-button
        size="small"
        :disabled="selectedCount === 0"
        @click="batchGenerateSceneImages"
      >{{ $t('common.batchGenerate') }}</el-button>
      <el-button size="small" @click="clearSelection">{{ $t('common.cancelBatch') }}</el-button>
    </div>

    <div v-if="filteredItems.length > 0" class="list-container">
      <div
        v-for="scene in filteredItems"
        :key="scene.id"
        class="list-row glass-list-row"
        @click="editScene(scene)"
      >
        <el-checkbox
          v-if="isBatchMode"
          :model-value="selectedIds.has(scene.id)"
          @change="toggleItem(scene.id)"
          @click.stop
        />
        <div class="row-thumb" :class="{ 'row-thumb-icon': !hasSceneImage(scene) }">
          <img v-if="hasSceneImage(scene)" :src="getImageUrl(scene)" :alt="scene.title || scene.location" />
          <el-icon v-else :size="20"><Picture /></el-icon>
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
          <ActionButton :icon="Edit" :tooltip="$t('common.edit')" variant="primary" @click="editScene(scene)" />
          <ActionButton :icon="PictureFilled" :tooltip="$t('prop.generateImage')" @click="generateSceneImage(scene)" />
          <ActionButton :icon="Delete" :tooltip="$t('common.delete')" variant="danger" @click="deleteScene(scene)" />
        </div>
      </div>
    </div>

    <EmptyState
      v-else-if="scenes.length === 0"
      :title="$t('drama.management.noScenes')"
      :description="$t('scene.emptyTip')"
      :icon="Picture"
    >
      <el-button type="primary" :icon="Plus" @click="openAddSceneDialog">{{ $t('scene.addScene') }}</el-button>
    </EmptyState>

    <EmptyState
      v-else
      :title="$t('common.noData')"
      :description="$t('common.noData')"
      :icon="Search"
    />

    <!-- 添加/编辑场景对话框 -->
    <el-dialog
      v-model="addSceneDialogVisible"
      :title="editingScene ? $t('common.edit') : $t('common.add')"
      width="600px"
    >
      <el-form :model="newScene" label-width="100px">
        <el-form-item :label="$t('common.image')">
          <el-upload
            class="avatar-uploader"
            :action="`/api/v1/upload/image`"
            :show-file-list="false"
            :on-success="handleSceneImageSuccess"
            :before-upload="beforeAvatarUpload"
          >
            <img
              v-if="hasSceneImage(newScene)"
              :src="getImageUrl(newScene)"
              class="avatar"
              style="width: 160px; height: 90px; object-fit: cover"
            />
            <el-icon
              v-else
              class="avatar-uploader-icon"
              style="border: 1px dashed #d9d9d9; border-radius: 6px; cursor: pointer; position: relative; overflow: hidden; width: 160px; height: 90px; font-size: 28px; color: #8c939d; text-align: center; line-height: 90px;"
            ><Plus /></el-icon>
          </el-upload>
        </el-form-item>
        <el-form-item :label="$t('scene.location')">
          <el-input v-model="newScene.location" :placeholder="$t('scene.location')" />
        </el-form-item>
        <el-form-item :label="$t('scene.prompt')">
          <el-input v-model="newScene.prompt" type="textarea" :rows="3" :placeholder="$t('scene.prompt')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addSceneDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveScene">{{ $t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 从剧本提取场景对话框 -->
    <el-dialog
      v-model="extractScenesDialogVisible"
      :title="$t('scene.batchExtract')"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item :label="$t('scene.selectEpisodes')">
          <div style="width: 100%">
            <el-checkbox
              v-model="selectAllScenesEpisodes"
              :indeterminate="isScenesIndeterminate"
              @change="handleSelectAllScenesEpisodes"
              style="margin-bottom: 8px"
            >{{ $t('common.selectAll') }}</el-checkbox>
            <el-select
              v-model="selectedScenesEpisodeIds"
              multiple
              collapse-tags
              collapse-tags-tooltip
              :placeholder="$t('common.pleaseSelect')"
              style="width: 100%"
              @change="handleScenesEpisodeSelectionChange"
            >
              <el-option
                v-for="ep in sortedEpisodes"
                :key="ep.id"
                :label="ep.title"
                :value="ep.id"
              />
            </el-select>
          </div>
        </el-form-item>
        <el-alert
          :title="$t('scene.batchExtractTip')"
          type="info"
          :closable="false"
          show-icon
        />
        <div v-if="scenesExtractProgress.active" style="margin-top: 16px">
          <el-progress :percentage="scenesExtractProgress.percent" :status="scenesExtractProgress.status" />
          <p style="margin-top: 8px; color: var(--el-text-color-secondary); font-size: 13px">
            {{ scenesExtractProgress.message }}
          </p>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="extractScenesDialogVisible = false" :disabled="scenesExtractProgress.active">{{ $t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          @click="handleExtractScenes"
          :disabled="selectedScenesEpisodeIds.length === 0 || scenesExtractProgress.active"
          :loading="scenesExtractProgress.active"
        >{{ $t('prop.startExtract') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Document, Plus, Search, Picture, Edit, Delete, PictureFilled } from '@element-plus/icons-vue'
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

let pollingTimer: ReturnType<typeof setInterval> | null = null

onUnmounted(() => {
  if (pollingTimer) clearInterval(pollingTimer)
})

const scenes = computed(() => dramaStore.scenes)
const sortedEpisodes = computed(() =>
  [...dramaStore.episodes].sort((a, b) => a.episode_number - b.episode_number)
)

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
const newScene = ref({
  location: '',
  prompt: '',
  image_url: '',
  local_path: '',
})

const extractScenesDialogVisible = ref(false)
const selectedScenesEpisodeIds = ref<(string | number)[]>([])
const selectAllScenesEpisodes = ref(false)
const isScenesIndeterminate = ref(false)
const scenesExtractProgress = ref({
  active: false,
  percent: 0,
  message: '',
  status: '' as '' | 'success' | 'exception',
})

// --- Actions ---
const reloadDrama = async () => {
  await dramaStore.loadDrama(dramaStore.dramaId)
}

const startPolling = (callback: () => Promise<void>, maxAttempts = 20, interval = 3000) => {
  if (pollingTimer) clearInterval(pollingTimer)
  let attempts = 0
  pollingTimer = setInterval(async () => {
    attempts++
    await callback()
    if (attempts >= maxAttempts) {
      if (pollingTimer) clearInterval(pollingTimer)
      pollingTimer = null
    }
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

const handleSceneImageSuccess = (response: any) => {
  if (response.data && response.data.url) {
    newScene.value.image_url = response.data.url
    newScene.value.local_path = response.data.local_path || ''
  }
}

const beforeAvatarUpload = (file: any) => {
  const isImage = file.type.startsWith('image/')
  const isLt10M = file.size / 1024 / 1024 < 10
  if (!isImage) toast.error(t('message.imageOnlyUpload'))
  if (!isLt10M) toast.error(t('message.imageSizeLimit'))
  return isImage && isLt10M
}

const saveScene = async () => {
  if (!newScene.value.location.trim()) {
    toast.warning(t('message.enterSceneName'))
    return
  }

  try {
    if (editingScene.value) {
      await dramaAPI.updateScene(editingScene.value.id, {
        location: newScene.value.location,
        description: newScene.value.prompt,
        image_url: newScene.value.image_url,
        local_path: newScene.value.local_path,
      })
    } else {
      await dramaAPI.createScene({
        drama_id: Number(dramaStore.dramaId),
        location: newScene.value.location,
        prompt: newScene.value.prompt,
        description: newScene.value.prompt,
        image_url: newScene.value.image_url,
        local_path: newScene.value.local_path,
      })
    }

    toast.success(t(editingScene.value ? 'message.sceneUpdateSuccess' : 'message.sceneAddSuccess'))
    addSceneDialogVisible.value = false
    await reloadDrama()
  } catch (error: any) {
    toast.error(error.message || t('message.operationFailed'))
  }
}

const deleteScene = async (scene: Scene) => {
  if (!scene.id) {
    toast.error(t('message.sceneIdNotExist'))
    return
  }

  if (!window.confirm(t('message.sceneDeleteConfirm', { name: scene.name || scene.location }))) return

  try {
    await dramaAPI.deleteScene(scene.id.toString())
    toast.success(t('message.sceneDeleted'))
    await reloadDrama()
  } catch (error: any) {
    toast.error(error.message || t('message.deleteFailed'))
  }
}

const generateSceneImage = async (scene: Scene) => {
  try {
    await dramaAPI.generateSceneImage({ scene_id: scene.id })
    toast.success(t('message.imageTaskSubmitted'))
    startPolling(reloadDrama)
  } catch (error: any) {
    toast.error(error.message || t('message.generateFailed'))
  }
}

const batchDeleteScenes = async () => {
  if (!window.confirm(t('common.batchDeleteConfirm', { count: selectedCount.value }))) return

  try {
    for (const scene of selectedItems.value) {
      await dramaAPI.deleteScene(scene.id.toString())
    }
    toast.success(t('message.batchDeleteSuccess'))
    clearSelection()
    await reloadDrama()
  } catch (error: any) {
    toast.error(error.message || t('message.deleteFailed'))
  }
}

const batchGenerateSceneImages = async () => {
  try {
    for (const scene of selectedItems.value) {
      await dramaAPI.generateSceneImage({ scene_id: scene.id })
    }
    toast.success(t('message.imageTaskSubmitted'))
    clearSelection()
    startPolling(reloadDrama)
  } catch (error: any) {
    toast.error(error.message || t('message.generateFailed'))
  }
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
  isScenesIndeterminate.value = false
}

const handleScenesEpisodeSelectionChange = (val: (string | number)[]) => {
  const total = sortedEpisodes.value.length
  selectAllScenesEpisodes.value = val.length === total
  isScenesIndeterminate.value = val.length > 0 && val.length < total
}

const handleExtractScenes = async () => {
  if (selectedScenesEpisodeIds.value.length === 0) return

  try {
    scenesExtractProgress.value = { active: true, percent: 0, message: t('character.extracting'), status: '' }

    const res = await dramaAPI.batchExtractBackgrounds(
      dramaStore.dramaId,
      selectedScenesEpisodeIds.value.map(Number),
    )

    const taskId = res.task_id

    const pollInterval = setInterval(async () => {
      try {
        const task = await taskAPI.getStatus(taskId)
        if (task.progress !== undefined) {
          scenesExtractProgress.value.percent = task.progress
        }
        if (task.message) {
          scenesExtractProgress.value.message = task.message
        }

        if (task.status === 'completed') {
          clearInterval(pollInterval)
          const result = typeof task.result === 'string' ? JSON.parse(task.result) : task.result
          scenesExtractProgress.value = {
            active: false,
            percent: 100,
            message: t('scene.extractComplete', {
              scenes: result?.scenes || 0,
              dedup: result?.dedup_scenes || 0,
            }),
            status: 'success',
          }
          await reloadDrama()
        } else if (task.status === 'failed') {
          clearInterval(pollInterval)
          scenesExtractProgress.value = {
            active: false,
            percent: 0,
            message: task.error || t('common.failed'),
            status: 'exception',
          }
        }
      } catch {
        clearInterval(pollInterval)
        scenesExtractProgress.value = { active: false, percent: 0, message: t('common.failed'), status: 'exception' }
      }
    }, 3000)
  } catch (error: any) {
    scenesExtractProgress.value = { active: false, percent: 0, message: '', status: '' }
    toast.error(error.message || t('message.extractFailed'))
  }
}
</script>

<style scoped>
.batch-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
  background: var(--bg-card-hover);
  border-radius: var(--radius-lg);
  flex-wrap: wrap;
}

.batch-bar__count {
  font-size: 0.875rem;
  color: var(--text-secondary);
}
</style>
