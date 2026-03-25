<template>
  <div>
    <TabHeader :title="$t('drama.management.propList')">
      <template #actions>
        <el-button
          v-if="!isBatchMode"
          size="small"
          @click="isBatchMode = true"
        >{{ $t('common.batchMode') }}</el-button>
        <el-button
          :icon="Document"
          @click="openExtractDialog"
        >{{ $t('prop.extract') }}</el-button>
        <el-button
          type="primary"
          :icon="Plus"
          @click="openAddPropDialog"
        >{{ $t('common.add') }}</el-button>
      </template>
      <template #filter>
        <el-input
          v-model="searchQuery"
          :placeholder="$t('prop.searchPlaceholder')"
          :prefix-icon="Search"
          clearable
          style="width: 220px"
        />
        <el-select
          v-model="filterValue"
          :placeholder="$t('prop.filterType')"
          clearable
          style="width: 150px"
        >
          <el-option
            v-for="propType in propTypes"
            :key="propType"
            :label="propType"
            :value="propType"
          />
        </el-select>
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
        @click="batchDeleteProps"
      >{{ $t('common.batchDelete') }}</el-button>
      <el-button
        size="small"
        :disabled="selectedCount === 0"
        @click="batchGeneratePropImages"
      >{{ $t('common.batchGenerate') }}</el-button>
      <el-button size="small" @click="clearSelection">{{ $t('common.cancelBatch') }}</el-button>
    </div>

    <div v-if="filteredItems.length > 0" class="list-container">
      <div
        v-for="prop in filteredItems"
        :key="prop.id"
        class="list-row glass-list-row"
        @click="editProp(prop)"
      >
        <el-checkbox
          v-if="isBatchMode"
          :model-value="selectedIds.has(prop.id)"
          @change="toggleItem(prop.id)"
          @click.stop
        />
        <div class="row-thumb" :class="{ 'row-thumb-icon': !hasImage(prop) }">
          <img v-if="hasImage(prop)" :src="getImageUrl(prop)" :alt="prop.name" />
          <el-icon v-else :size="20"><Box /></el-icon>
        </div>
        <div class="row-body">
          <div class="row-top">
            <span class="row-title">{{ prop.name }}</span>
            <span v-if="prop.type" class="glass-chip glass-chip-info">{{ prop.type }}</span>
          </div>
          <div class="row-bottom">
            <span class="row-desc">{{ prop.description || prop.prompt || '-' }}</span>
          </div>
        </div>
        <div class="row-actions" @click.stop>
          <ActionButton :icon="Edit" :tooltip="$t('common.edit')" variant="primary" @click="editProp(prop)" />
          <ActionButton :icon="PictureFilled" :tooltip="$t('prop.generateImage')" :disabled="!prop.prompt" @click="generatePropImage(prop)" />
          <ActionButton :icon="Delete" :tooltip="$t('common.delete')" variant="danger" @click="deleteProp(prop)" />
        </div>
      </div>
    </div>

    <EmptyState
      v-else-if="propsList.length === 0"
      :title="$t('drama.management.noProps')"
      :description="$t('prop.emptyTip')"
      :icon="Box"
    >
      <el-button type="primary" :icon="Plus" @click="openAddPropDialog">{{ $t('common.add') }}</el-button>
    </EmptyState>

    <EmptyState
      v-else
      :title="$t('common.noData')"
      :description="$t('common.noData')"
      :icon="Search"
    />

    <!-- 添加/编辑道具对话框 -->
    <el-dialog
      v-model="addPropDialogVisible"
      :title="editingProp ? $t('common.edit') : $t('common.add')"
      width="600px"
    >
      <el-form :model="newProp" label-width="100px">
        <el-form-item :label="$t('common.image')">
          <el-upload
            class="avatar-uploader"
            :action="`/api/v1/upload/image`"
            :show-file-list="false"
            :on-success="handlePropImageSuccess"
            :before-upload="beforeAvatarUpload"
          >
            <img
              v-if="hasImage(newProp)"
              :src="getImageUrl(newProp)"
              class="avatar"
              style="width: 100px; height: 100px; object-fit: cover"
            />
            <el-icon
              v-else
              class="avatar-uploader-icon"
              style="border: 1px dashed #d9d9d9; border-radius: 6px; cursor: pointer; position: relative; overflow: hidden; width: 100px; height: 100px; font-size: 28px; color: #8c939d; text-align: center; line-height: 100px;"
            ><Plus /></el-icon>
          </el-upload>
        </el-form-item>
        <el-form-item :label="$t('prop.name')">
          <el-input v-model="newProp.name" :placeholder="$t('prop.name')" />
        </el-form-item>
        <el-form-item :label="$t('prop.type')">
          <el-input v-model="newProp.type" :placeholder="$t('prop.typePlaceholder')" />
        </el-form-item>
        <el-form-item :label="$t('prop.description')">
          <el-input v-model="newProp.description" type="textarea" :rows="3" :placeholder="$t('prop.description')" />
        </el-form-item>
        <el-form-item :label="$t('prop.prompt')">
          <el-input v-model="newProp.prompt" type="textarea" :rows="3" :placeholder="$t('prop.promptPlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addPropDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveProp">{{ $t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 从剧本提取道具对话框 -->
    <el-dialog
      v-model="extractPropsDialogVisible"
      :title="$t('prop.batchExtract')"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item :label="$t('prop.selectEpisodes')">
          <div style="width: 100%">
            <el-checkbox
              v-model="selectAllPropsEpisodes"
              :indeterminate="isPropsIndeterminate"
              @change="handleSelectAllPropsEpisodes"
              style="margin-bottom: 8px"
            >{{ $t('common.selectAll') }}</el-checkbox>
            <el-select
              v-model="selectedPropsEpisodeIds"
              multiple
              collapse-tags
              collapse-tags-tooltip
              :placeholder="$t('common.pleaseSelect')"
              style="width: 100%"
              @change="handlePropsEpisodeSelectionChange"
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
          :title="$t('prop.batchExtractTip')"
          type="info"
          :closable="false"
          show-icon
        />
        <div v-if="propsExtractProgress.active" style="margin-top: 16px">
          <el-progress :percentage="propsExtractProgress.percent" :status="propsExtractProgress.status" />
          <p style="margin-top: 8px; color: var(--el-text-color-secondary); font-size: 13px">
            {{ propsExtractProgress.message }}
          </p>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="extractPropsDialogVisible = false" :disabled="propsExtractProgress.active">{{ $t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          @click="handleExtractProps"
          :disabled="selectedPropsEpisodeIds.length === 0 || propsExtractProgress.active"
          :loading="propsExtractProgress.active"
        >{{ $t('prop.startExtract') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Document, Plus, Search, Box, Edit, Delete, PictureFilled } from '@element-plus/icons-vue'
import { TabHeader, ActionButton, EmptyState } from '@/components/common'
import { getImageUrl } from '@/utils/image'
import { useFilteredList } from '@/composables/useFilteredList'
import { useBatchSelection } from '@/composables/useBatchSelection'
import { useDramaStore } from '@/stores/drama'
import { propAPI } from '@/api/prop'
import { taskAPI } from '@/api/task'
import type { Prop } from '@/types/prop'

const { t } = useI18n()
const dramaStore = useDramaStore()

let pollingTimer: ReturnType<typeof setInterval> | null = null

onUnmounted(() => {
  if (pollingTimer) clearInterval(pollingTimer)
})

const propsList = computed(() => dramaStore.props)
const sortedEpisodes = computed(() =>
  [...dramaStore.episodes].sort((a, b) => a.episode_number - b.episode_number)
)

const hasImage = (prop: { image_url?: string }) => !!prop.image_url

const propTypes = computed(() => {
  const types = new Set(dramaStore.props.map(p => p.type).filter(Boolean))
  return Array.from(types)
})

const { searchQuery, filterValue, filteredItems } = useFilteredList({
  items: propsList,
  searchFields: ['name', 'description'] as (keyof Prop)[],
  filterField: 'type' as keyof Prop,
})

const {
  selectedIds, isBatchMode, isAllSelected, isIndeterminate,
  selectedItems, selectedCount, toggleItem, toggleAll, clearSelection,
} = useBatchSelection(filteredItems)

// --- Dialog state ---
const addPropDialogVisible = ref(false)
const editingProp = ref<Prop | null>(null)
const newProp = ref({
  name: '',
  description: '',
  prompt: '',
  type: '',
  image_url: '',
  local_path: '',
})

const extractPropsDialogVisible = ref(false)
const selectedPropsEpisodeIds = ref<(string | number)[]>([])
const selectAllPropsEpisodes = ref(false)
const isPropsIndeterminate = ref(false)
const propsExtractProgress = ref({
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

const openAddPropDialog = () => {
  editingProp.value = null
  newProp.value = { name: '', description: '', prompt: '', type: '', image_url: '', local_path: '' }
  addPropDialogVisible.value = true
}

const editProp = (prop: Prop) => {
  editingProp.value = prop
  newProp.value = {
    name: prop.name,
    description: prop.description || '',
    prompt: prop.prompt || '',
    type: prop.type || '',
    image_url: prop.image_url || '',
    local_path: prop.local_path || '',
  }
  addPropDialogVisible.value = true
}

const handlePropImageSuccess = (response: any) => {
  if (response.data && response.data.url) {
    newProp.value.image_url = response.data.url
    newProp.value.local_path = response.data.local_path || ''
  }
}

const beforeAvatarUpload = (file: any) => {
  const isImage = file.type.startsWith('image/')
  const isLt10M = file.size / 1024 / 1024 < 10
  if (!isImage) toast.error(t('message.imageOnlyUpload'))
  if (!isLt10M) toast.error(t('message.imageSizeLimit'))
  return isImage && isLt10M
}

const saveProp = async () => {
  if (!newProp.value.name.trim()) {
    toast.warning(t('message.enterPropName'))
    return
  }

  try {
    const propData = {
      drama_id: dramaStore.dramaId,
      name: newProp.value.name,
      description: newProp.value.description,
      prompt: newProp.value.prompt,
      type: newProp.value.type,
      image_url: newProp.value.image_url,
      local_path: newProp.value.local_path,
    }

    if (editingProp.value) {
      await propAPI.update(editingProp.value.id, propData)
      toast.success(t('message.propUpdateSuccess'))
    } else {
      await propAPI.create(propData as any)
      toast.success(t('message.propAddSuccess'))
    }

    addPropDialogVisible.value = false
    await reloadDrama()
  } catch (error: any) {
    toast.error(error.message || t('message.operationFailed'))
  }
}

const deleteProp = async (prop: Prop) => {
  if (!window.confirm(t('message.propDeleteConfirm', { name: prop.name }))) return

  try {
    await propAPI.delete(prop.id)
    toast.success(t('message.propDeleted'))
    await reloadDrama()
  } catch (error: any) {
    toast.error(error.message || t('message.deleteFailed'))
  }
}

const generatePropImage = async (prop: Prop) => {
  if (!prop.prompt) {
    toast.warning(t('message.setPropPromptFirst'))
    editProp(prop)
    return
  }

  try {
    await propAPI.generateImage(prop.id)
    toast.success(t('message.imageTaskSubmitted'))
    startPolling(reloadDrama)
  } catch (error: any) {
    toast.error(error.message || t('message.generateFailed'))
  }
}

const batchDeleteProps = async () => {
  if (!window.confirm(t('common.batchDeleteConfirm', { count: selectedCount.value }))) return

  try {
    for (const prop of selectedItems.value) {
      await propAPI.delete(prop.id)
    }
    toast.success(t('message.batchDeleteSuccess'))
    clearSelection()
    await reloadDrama()
  } catch (error: any) {
    toast.error(error.message || t('message.deleteFailed'))
  }
}

const batchGeneratePropImages = async () => {
  try {
    for (const prop of selectedItems.value) {
      if (prop.prompt) {
        await propAPI.generateImage(prop.id)
      }
    }
    toast.success(t('message.imageTaskSubmitted'))
    clearSelection()
    startPolling(reloadDrama)
  } catch (error: any) {
    toast.error(error.message || t('message.generateFailed'))
  }
}

// --- Extract props ---
const openExtractDialog = () => {
  extractPropsDialogVisible.value = true
  selectedPropsEpisodeIds.value = []
  selectAllPropsEpisodes.value = false
  isPropsIndeterminate.value = false
  propsExtractProgress.value = { active: false, percent: 0, message: '', status: '' }
}

const handleSelectAllPropsEpisodes = (val: boolean) => {
  selectedPropsEpisodeIds.value = val ? sortedEpisodes.value.map(ep => ep.id) : []
  isPropsIndeterminate.value = false
}

const handlePropsEpisodeSelectionChange = (val: (string | number)[]) => {
  const total = sortedEpisodes.value.length
  selectAllPropsEpisodes.value = val.length === total
  isPropsIndeterminate.value = val.length > 0 && val.length < total
}

const handleExtractProps = async () => {
  if (selectedPropsEpisodeIds.value.length === 0) return

  try {
    propsExtractProgress.value = { active: true, percent: 0, message: t('prop.extracting') || t('character.extracting'), status: '' }

    const res = await propAPI.batchExtractFromEpisodes(
      dramaStore.dramaId,
      selectedPropsEpisodeIds.value.map(Number),
    )

    const taskId = res.task_id

    const pollInterval = setInterval(async () => {
      try {
        const task = await taskAPI.getStatus(taskId)
        if (task.progress !== undefined) {
          propsExtractProgress.value.percent = task.progress
        }
        if (task.message) {
          propsExtractProgress.value.message = task.message
        }

        if (task.status === 'completed') {
          clearInterval(pollInterval)
          const result = typeof task.result === 'string' ? JSON.parse(task.result) : task.result
          propsExtractProgress.value = {
            active: false,
            percent: 100,
            message: t('prop.extractComplete', {
              props: result?.props || 0,
              dedup: result?.dedup_props || 0,
            }),
            status: 'success',
          }
          await reloadDrama()
        } else if (task.status === 'failed') {
          clearInterval(pollInterval)
          propsExtractProgress.value = {
            active: false,
            percent: 0,
            message: task.error || t('common.failed'),
            status: 'exception',
          }
        }
      } catch {
        clearInterval(pollInterval)
        propsExtractProgress.value = { active: false, percent: 0, message: t('common.failed'), status: 'exception' }
      }
    }, 3000)
  } catch (error: any) {
    propsExtractProgress.value = { active: false, percent: 0, message: '', status: '' }
    toast.error(error.message || t('common.failed'))
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
