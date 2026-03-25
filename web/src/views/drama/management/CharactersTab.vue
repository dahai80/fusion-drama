<template>
  <div>
    <TabHeader :title="$t('drama.management.characterList')">
      <template #actions>
        <el-button
          v-if="!isBatchMode"
          size="small"
          @click="isBatchMode = true"
        >{{ $t('common.batchMode') }}</el-button>
        <el-button
          :icon="Document"
          @click="openExtractCharacterDialog"
        >{{ $t('prop.extract') }}</el-button>
        <el-button
          type="primary"
          :icon="Plus"
          @click="openAddCharacterDialog"
        >{{ $t('character.add') }}</el-button>
      </template>
      <template #filter>
        <el-input
          v-model="searchQuery"
          :placeholder="$t('character.searchPlaceholder')"
          :prefix-icon="Search"
          clearable
          style="width: 220px"
        />
        <el-select
          v-model="filterValue"
          :placeholder="$t('character.filterRole')"
          clearable
          style="width: 150px"
        >
          <el-option label="Main" value="main" />
          <el-option label="Supporting" value="supporting" />
          <el-option label="Minor" value="minor" />
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
        @click="batchDeleteCharacters"
      >{{ $t('common.batchDelete') }}</el-button>
      <el-button
        size="small"
        :disabled="selectedCount === 0"
        @click="batchGenerateCharacterImages"
      >{{ $t('common.batchGenerate') }}</el-button>
      <el-button size="small" @click="clearSelection">{{ $t('common.cancelBatch') }}</el-button>
    </div>

    <div v-if="filteredItems.length > 0" class="list-container">
      <div
        v-for="character in filteredItems"
        :key="character.id"
        class="list-row glass-list-row"
        @click="editCharacter(character)"
      >
        <el-checkbox
          v-if="isBatchMode"
          :model-value="selectedIds.has(character.id)"
          @change="toggleItem(character.id)"
          @click.stop
        />
        <div class="row-thumb" :class="{ 'row-thumb-icon': !hasCharacterImage(character) }">
          <img v-if="hasCharacterImage(character)" :src="getImageUrl(character)" :alt="character.name" />
          <el-icon v-else :size="20"><User /></el-icon>
        </div>
        <div class="row-body">
          <div class="row-top">
            <span class="row-title">{{ character.name }}</span>
            <span :class="['glass-chip', roleChipClass(character.role)]">{{ character.role === 'main' ? 'Main' : character.role === 'supporting' ? 'Supporting' : 'Minor' }}</span>
          </div>
          <div class="row-bottom">
            <span class="row-desc">{{ character.appearance || character.description || '-' }}</span>
          </div>
        </div>
        <div class="row-actions" @click.stop>
          <ActionButton :icon="Edit" :tooltip="$t('common.edit')" variant="primary" @click="editCharacter(character)" />
          <ActionButton :icon="PictureFilled" :tooltip="$t('prop.generateImage')" @click="generateCharacterImage(character)" />
          <ActionButton :icon="Delete" :tooltip="$t('common.delete')" variant="danger" @click="deleteCharacter(character)" />
        </div>
      </div>
    </div>

    <EmptyState
      v-else
      :title="$t('drama.management.noCharacters')"
      :description="$t('character.emptyTip')"
      :icon="User"
    >
      <el-button type="primary" :icon="Plus" @click="openAddCharacterDialog">{{ $t('character.add') }}</el-button>
    </EmptyState>

    <!-- 添加/编辑角色对话框 -->
    <el-dialog
      v-model="addCharacterDialogVisible"
      :title="editingCharacter ? $t('character.edit') : $t('character.add')"
      width="600px"
    >
      <el-form :model="newCharacter" label-width="100px">
        <el-form-item :label="$t('character.image')">
          <el-upload
            class="avatar-uploader"
            :action="`/api/v1/upload/image`"
            :show-file-list="false"
            :on-success="handleCharacterAvatarSuccess"
            :before-upload="beforeAvatarUpload"
          >
            <img
              v-if="hasCharacterImage(newCharacter)"
              :src="getImageUrl(newCharacter)"
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
        <el-form-item :label="$t('character.name')">
          <el-input v-model="newCharacter.name" :placeholder="$t('character.name')" />
        </el-form-item>
        <el-form-item :label="$t('character.role')">
          <el-select v-model="newCharacter.role" :placeholder="$t('common.pleaseSelect')">
            <el-option label="Main" value="main" />
            <el-option label="Supporting" value="supporting" />
            <el-option label="Minor" value="minor" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('character.appearance')">
          <el-input v-model="newCharacter.appearance" type="textarea" :rows="3" :placeholder="$t('character.appearance')" />
        </el-form-item>
        <el-form-item :label="$t('character.personality')">
          <el-input v-model="newCharacter.personality" type="textarea" :rows="3" :placeholder="$t('character.personality')" />
        </el-form-item>
        <el-form-item :label="$t('character.description')">
          <el-input v-model="newCharacter.description" type="textarea" :rows="3" :placeholder="$t('common.description')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addCharacterDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveCharacter">{{ $t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 从剧本提取角色对话框 -->
    <el-dialog
      v-model="extractCharactersDialogVisible"
      :title="$t('character.batchExtract')"
      width="500px"
    >
      <el-form label-width="100px">
        <el-form-item :label="$t('character.selectEpisodes')">
          <div style="width: 100%">
            <el-checkbox
              v-model="selectAllEpisodes"
              :indeterminate="isEpisodesIndeterminate"
              @change="handleSelectAllEpisodes"
              style="margin-bottom: 8px"
            >{{ $t('common.selectAll') }}</el-checkbox>
            <el-select
              v-model="selectedExtractEpisodeIds"
              multiple
              collapse-tags
              collapse-tags-tooltip
              :placeholder="$t('common.pleaseSelect')"
              style="width: 100%"
              @change="handleEpisodeSelectionChange"
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
          :title="$t('character.batchExtractTip')"
          type="info"
          :closable="false"
          show-icon
        />
        <div v-if="extractProgress.active" style="margin-top: 16px">
          <el-progress :percentage="extractProgress.percent" :status="extractProgress.status" />
          <p style="margin-top: 8px; color: var(--el-text-color-secondary); font-size: 13px">
            {{ extractProgress.message }}
          </p>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="extractCharactersDialogVisible = false" :disabled="extractProgress.active">{{ $t('common.cancel') }}</el-button>
        <el-button
          type="primary"
          @click="handleExtractCharacters"
          :disabled="selectedExtractEpisodeIds.length === 0 || extractProgress.active"
          :loading="extractProgress.active"
        >{{ $t('prop.startExtract') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Document, Plus, Search, User, Edit, Delete, PictureFilled } from '@element-plus/icons-vue'
import { TabHeader, ActionButton, EmptyState } from '@/components/common'
import { getImageUrl } from '@/utils/image'
import { useFilteredList } from '@/composables/useFilteredList'
import { useBatchSelection } from '@/composables/useBatchSelection'
import { useDramaStore } from '@/stores/drama'
import { dramaAPI } from '@/api/drama'
import { characterLibraryAPI } from '@/api/character-library'
import { taskAPI } from '@/api/task'
import type { Character } from '@/types/drama'

const { t } = useI18n()
const dramaStore = useDramaStore()

let pollingTimer: ReturnType<typeof setInterval> | null = null

onUnmounted(() => {
  if (pollingTimer) clearInterval(pollingTimer)
})

const charactersList = computed(() => dramaStore.characters)
const sortedEpisodes = computed(() =>
  [...dramaStore.episodes].sort((a, b) => a.episode_number - b.episode_number)
)

const hasCharacterImage = (character: { local_path?: string; image_url?: string }) => !!(character.local_path || character.image_url)

const roleChipClass = (role?: string) => {
  if (role === 'main') return 'glass-chip-danger'
  if (role === 'supporting') return 'glass-chip-info'
  return 'glass-chip-neutral'
}

const { searchQuery, filterValue, filteredItems } = useFilteredList({
  items: charactersList,
  searchFields: ['name', 'description', 'appearance'] as (keyof Character)[],
  filterField: 'role' as keyof Character,
})

const {
  selectedIds, isBatchMode, isAllSelected, isIndeterminate,
  selectedItems, selectedCount, toggleItem, toggleAll, clearSelection,
} = useBatchSelection(filteredItems)

// --- Dialog state ---
const addCharacterDialogVisible = ref(false)
const editingCharacter = ref<Character | null>(null)
const newCharacter = ref({
  name: '',
  role: 'supporting',
  appearance: '',
  personality: '',
  description: '',
  image_url: '',
  local_path: '',
})

const extractCharactersDialogVisible = ref(false)
const selectedExtractEpisodeIds = ref<(string | number)[]>([])
const selectAllEpisodes = ref(false)
const isEpisodesIndeterminate = ref(false)
const extractProgress = ref({
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

const openAddCharacterDialog = () => {
  editingCharacter.value = null
  newCharacter.value = { name: '', role: 'supporting', appearance: '', personality: '', description: '', image_url: '', local_path: '' }
  addCharacterDialogVisible.value = true
}

const editCharacter = (character: Character) => {
  editingCharacter.value = character
  newCharacter.value = {
    name: character.name,
    role: character.role || 'supporting',
    appearance: character.appearance || '',
    personality: character.personality || '',
    description: character.description || '',
    image_url: character.image_url || '',
    local_path: character.local_path || '',
  }
  addCharacterDialogVisible.value = true
}

const handleCharacterAvatarSuccess = (response: any) => {
  if (response.data && response.data.url) {
    newCharacter.value.image_url = response.data.url
    newCharacter.value.local_path = response.data.local_path || ''
  }
}

const beforeAvatarUpload = (file: any) => {
  const isImage = file.type.startsWith('image/')
  const isLt10M = file.size / 1024 / 1024 < 10
  if (!isImage) toast.error(t('message.imageOnlyUpload'))
  if (!isLt10M) toast.error(t('message.imageSizeLimit'))
  return isImage && isLt10M
}

const saveCharacter = async () => {
  if (!newCharacter.value.name.trim()) {
    toast.warning(t('message.enterCharacterName'))
    return
  }

  try {
    if (editingCharacter.value) {
      await dramaAPI.updateCharacter(editingCharacter.value.id, {
        name: newCharacter.value.name,
        role: newCharacter.value.role,
        appearance: newCharacter.value.appearance,
        personality: newCharacter.value.personality,
        description: newCharacter.value.description,
        image_url: newCharacter.value.image_url,
        local_path: newCharacter.value.local_path,
      })
      toast.success(t('message.characterUpdateSuccess'))
    } else {
      const allCharacters = [
        ...dramaStore.characters.map((c) => ({
          name: c.name,
          role: c.role,
          appearance: c.appearance,
          personality: c.personality,
          description: c.description,
          image_url: c.image_url,
          local_path: c.local_path,
        })),
        newCharacter.value,
      ]
      await dramaAPI.saveCharacters(dramaStore.dramaId, allCharacters)
      toast.success(t('message.characterAddSuccess'))
    }

    addCharacterDialogVisible.value = false
    await reloadDrama()
  } catch (error: any) {
    toast.error(error.message || t('message.operationFailed'))
  }
}

const deleteCharacter = async (character: Character) => {
  if (!character.id) {
    toast.error(t('message.characterIdNotExist'))
    return
  }

  if (!window.confirm(t('message.characterDeleteConfirm', { name: character.name }))) return

  try {
    await characterLibraryAPI.deleteCharacter(character.id)
    toast.success(t('message.characterDeleted'))
    await reloadDrama()
  } catch (error: any) {
    toast.error(error.message || t('message.deleteFailed'))
  }
}

const generateCharacterImage = async (character: Character) => {
  try {
    await characterLibraryAPI.generateCharacterImage(character.id)
    toast.success(t('message.imageTaskSubmitted'))
    startPolling(reloadDrama)
  } catch (error: any) {
    toast.error(error.message || t('message.generateFailed'))
  }
}

const batchDeleteCharacters = async () => {
  if (!window.confirm(t('common.batchDeleteConfirm', { count: selectedCount.value }))) return

  try {
    for (const character of selectedItems.value) {
      await characterLibraryAPI.deleteCharacter(character.id)
    }
    toast.success(t('message.batchDeleteSuccess'))
    clearSelection()
    await reloadDrama()
  } catch (error: any) {
    toast.error(error.message || t('message.deleteFailed'))
  }
}

const batchGenerateCharacterImages = async () => {
  try {
    const ids = selectedItems.value.map(c => c.id.toString())
    await characterLibraryAPI.batchGenerateCharacterImages(ids)
    toast.success(t('message.imageTaskSubmitted'))
    clearSelection()
    startPolling(reloadDrama)
  } catch (error: any) {
    toast.error(error.message || t('message.generateFailed'))
  }
}

// --- Extract characters ---
const openExtractCharacterDialog = () => {
  extractCharactersDialogVisible.value = true
  selectedExtractEpisodeIds.value = []
  selectAllEpisodes.value = false
  isEpisodesIndeterminate.value = false
  extractProgress.value = { active: false, percent: 0, message: '', status: '' }
}

const handleSelectAllEpisodes = (val: boolean) => {
  selectedExtractEpisodeIds.value = val ? sortedEpisodes.value.map(ep => ep.id) : []
  isEpisodesIndeterminate.value = false
}

const handleEpisodeSelectionChange = (val: (string | number)[]) => {
  const total = sortedEpisodes.value.length
  selectAllEpisodes.value = val.length === total
  isEpisodesIndeterminate.value = val.length > 0 && val.length < total
}

const handleExtractCharacters = async () => {
  if (selectedExtractEpisodeIds.value.length === 0) return

  try {
    extractProgress.value = { active: true, percent: 0, message: t('character.extracting'), status: '' }

    const res = await characterLibraryAPI.batchExtractFromEpisodes(
      dramaStore.dramaId,
      selectedExtractEpisodeIds.value.map(Number),
    )

    const taskId = res.task_id

    const pollInterval = setInterval(async () => {
      try {
        const task = await taskAPI.getStatus(taskId)
        if (task.progress !== undefined) {
          extractProgress.value.percent = task.progress
        }
        if (task.message) {
          extractProgress.value.message = task.message
        }

        if (task.status === 'completed') {
          clearInterval(pollInterval)
          const result = typeof task.result === 'string' ? JSON.parse(task.result) : task.result
          extractProgress.value = {
            active: false,
            percent: 100,
            message: t('character.extractComplete', {
              characters: result?.characters || 0,
              scenes: result?.dedup_scenes || 0,
            }),
            status: 'success',
          }
          await reloadDrama()
        } else if (task.status === 'failed') {
          clearInterval(pollInterval)
          extractProgress.value = {
            active: false,
            percent: 0,
            message: task.error || t('common.failed'),
            status: 'exception',
          }
        }
      } catch {
        clearInterval(pollInterval)
        extractProgress.value = { active: false, percent: 0, message: t('common.failed'), status: 'exception' }
      }
    }, 3000)
  } catch (error: any) {
    extractProgress.value = { active: false, percent: 0, message: '', status: '' }
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
