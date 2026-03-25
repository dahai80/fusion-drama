<template>
  <div>
    <TabHeader :title="$t('drama.management.propList')">
      <template #actions>
        <Button v-if="!isBatchMode" variant="outline" size="sm" @click="isBatchMode = true">{{ $t('common.batchMode') }}</Button>
        <Button variant="outline" @click="openExtractDialog">
          <FileText :size="16" class="mr-1" />
          {{ $t('prop.extract') }}
        </Button>
        <Button @click="openAddPropDialog">
          <Plus :size="16" class="mr-1" />
          {{ $t('common.add') }}
        </Button>
      </template>
      <template #filter>
        <div class="filter-input-wrapper">
          <Search :size="16" class="filter-icon" />
          <Input v-model="searchQuery" :placeholder="$t('prop.searchPlaceholder')" class="filter-input" />
        </div>
        <Select v-model="filterValue">
          <SelectTrigger class="w-[150px]">
            <SelectValue :placeholder="$t('prop.filterType')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="propType in propTypes" :key="propType" :value="propType">{{ propType }}</SelectItem>
          </SelectContent>
        </Select>
      </template>
    </TabHeader>

    <!-- 批量操作栏 -->
    <div v-if="isBatchMode" class="batch-bar">
      <Checkbox :checked="isAllSelected" :indeterminate="isIndeterminate" @update:checked="toggleAll" />
      <span class="batch-bar__label">{{ $t('common.selectAll') }}</span>
      <span class="batch-bar__count">{{ $t('common.selectedCount', { count: selectedCount }) }}</span>
      <Button size="sm" variant="destructive" :disabled="selectedCount === 0" @click="batchDeleteProps">{{ $t('common.batchDelete') }}</Button>
      <Button size="sm" variant="outline" :disabled="selectedCount === 0" @click="batchGeneratePropImages">{{ $t('common.batchGenerate') }}</Button>
      <Button size="sm" variant="ghost" @click="clearSelection">{{ $t('common.cancelBatch') }}</Button>
    </div>

    <div v-if="filteredItems.length > 0" class="list-container">
      <div v-for="prop in filteredItems" :key="prop.id" class="list-row glass-list-row" @click="editProp(prop)">
        <Checkbox v-if="isBatchMode" :checked="selectedIds.has(prop.id)" @update:checked="() => toggleItem(prop.id)" @click.stop />
        <div class="row-thumb" :class="{ 'row-thumb-icon': !hasImage(prop) }">
          <img v-if="hasImage(prop)" :src="getImageUrl(prop)" :alt="prop.name" />
          <Package v-else :size="20" />
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
          <ActionButton :icon="Pencil" :tooltip="$t('common.edit')" variant="primary" @click="editProp(prop)" />
          <ActionButton :icon="ImageIcon" :tooltip="$t('prop.generateImage')" :disabled="!prop.prompt" @click="generatePropImage(prop)" />
          <ActionButton :icon="Trash2" :tooltip="$t('common.delete')" variant="danger" @click="deleteProp(prop)" />
        </div>
      </div>
    </div>

    <EmptyState v-else-if="propsList.length === 0" :title="$t('drama.management.noProps')" :description="$t('prop.emptyTip')" :icon="Package">
      <Button @click="openAddPropDialog"><Plus :size="16" class="mr-1" />{{ $t('common.add') }}</Button>
    </EmptyState>
    <EmptyState v-else :title="$t('common.noData')" :description="$t('common.noData')" :icon="Search" />

    <!-- 添加/编辑道具对话框 -->
    <Dialog v-model:open="addPropDialogVisible">
      <DialogContent class="sm:max-w-[600px]">
        <DialogHeader><DialogTitle>{{ editingProp ? $t('common.edit') : $t('common.add') }}</DialogTitle></DialogHeader>
        <div class="dialog-form">
          <div class="form-field">
            <label class="form-label">{{ $t('common.image') }}</label>
            <div class="avatar-upload" @click="propFileInput?.click()">
              <img v-if="hasImage(newProp)" :src="getImageUrl(newProp)" class="avatar-preview" />
              <div v-else class="avatar-placeholder"><Plus :size="28" /></div>
            </div>
            <input ref="propFileInput" type="file" accept="image/*" class="hidden" @change="handlePropFileChange" />
          </div>
          <div class="form-field"><label class="form-label">{{ $t('prop.name') }}</label><Input v-model="newProp.name" :placeholder="$t('prop.name')" /></div>
          <div class="form-field"><label class="form-label">{{ $t('prop.type') }}</label><Input v-model="newProp.type" :placeholder="$t('prop.typePlaceholder')" /></div>
          <div class="form-field"><label class="form-label">{{ $t('prop.description') }}</label><textarea v-model="newProp.description" class="glass-input-base form-textarea" :rows="3" :placeholder="$t('prop.description')" /></div>
          <div class="form-field"><label class="form-label">{{ $t('prop.prompt') }}</label><textarea v-model="newProp.prompt" class="glass-input-base form-textarea" :rows="3" :placeholder="$t('prop.promptPlaceholder')" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="addPropDialogVisible = false">{{ $t('common.cancel') }}</Button>
          <Button @click="saveProp">{{ $t('common.confirm') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 从剧本提取道具对话框 -->
    <Dialog v-model:open="extractPropsDialogVisible">
      <DialogContent class="sm:max-w-[500px]">
        <DialogHeader><DialogTitle>{{ $t('prop.batchExtract') }}</DialogTitle></DialogHeader>
        <div class="dialog-form">
          <div class="form-field">
            <label class="form-label">{{ $t('prop.selectEpisodes') }}</label>
            <div class="episode-select">
              <div class="select-all-row">
                <Checkbox :checked="selectAllPropsEpisodes" :indeterminate="isPropsIndeterminate" @update:checked="handleSelectAllPropsEpisodes" />
                <span>{{ $t('common.selectAll') }}</span>
              </div>
              <div class="episode-checkboxes">
                <label v-for="ep in sortedEpisodes" :key="ep.id" class="episode-checkbox-item">
                  <Checkbox :checked="selectedPropsEpisodeIds.includes(ep.id)" @update:checked="(val: boolean) => togglePropEpisodeSelection(ep.id, val)" />
                  <span>{{ ep.title }}</span>
                </label>
              </div>
            </div>
          </div>
          <div class="info-alert"><Info :size="16" /><span>{{ $t('prop.batchExtractTip') }}</span></div>
          <div v-if="propsExtractProgress.active" class="progress-section">
            <div class="progress-bar"><div class="progress-fill" :style="{ width: propsExtractProgress.percent + '%' }" :class="{ 'progress-error': propsExtractProgress.status === 'exception' }" /></div>
            <p class="progress-message">{{ propsExtractProgress.message }}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="extractPropsDialogVisible = false" :disabled="propsExtractProgress.active">{{ $t('common.cancel') }}</Button>
          <Button @click="handleExtractProps" :disabled="selectedPropsEpisodeIds.length === 0 || propsExtractProgress.active">
            <Loader2 v-if="propsExtractProgress.active" :size="16" class="animate-spin mr-1" />
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
import { FileText, Plus, Search, Package, Pencil, Trash2, Image as ImageIcon, Info, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
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
const propFileInput = ref<HTMLInputElement>()
let pollingTimer: ReturnType<typeof setInterval> | null = null

onUnmounted(() => { if (pollingTimer) clearInterval(pollingTimer) })

const propsList = computed(() => dramaStore.props)
const sortedEpisodes = computed(() => [...dramaStore.episodes].sort((a, b) => a.episode_number - b.episode_number))
const hasImage = (prop: { image_url?: string }) => !!prop.image_url
const propTypes = computed(() => { const types = new Set(dramaStore.props.map(p => p.type).filter(Boolean)); return Array.from(types) })

const { searchQuery, filterValue, filteredItems } = useFilteredList({ items: propsList, searchFields: ['name', 'description'] as (keyof Prop)[], filterField: 'type' as keyof Prop })
const { selectedIds, isBatchMode, isAllSelected, isIndeterminate, selectedItems, selectedCount, toggleItem, toggleAll, clearSelection } = useBatchSelection(filteredItems)

const addPropDialogVisible = ref(false)
const editingProp = ref<Prop | null>(null)
const newProp = ref({ name: '', description: '', prompt: '', type: '', image_url: '', local_path: '' })
const extractPropsDialogVisible = ref(false)
const selectedPropsEpisodeIds = ref<(string | number)[]>([])
const selectAllPropsEpisodes = ref(false)
const isPropsIndeterminate = ref(false)
const propsExtractProgress = ref({ active: false, percent: 0, message: '', status: '' as '' | 'success' | 'exception' })

const reloadDrama = async () => { await dramaStore.loadDrama(dramaStore.dramaId) }
const startPolling = (callback: () => Promise<void>, maxAttempts = 20, interval = 3000) => {
  if (pollingTimer) clearInterval(pollingTimer)
  let attempts = 0
  pollingTimer = setInterval(async () => { attempts++; await callback(); if (attempts >= maxAttempts) { if (pollingTimer) clearInterval(pollingTimer); pollingTimer = null } }, interval)
}

const openAddPropDialog = () => { editingProp.value = null; newProp.value = { name: '', description: '', prompt: '', type: '', image_url: '', local_path: '' }; addPropDialogVisible.value = true }
const editProp = (prop: Prop) => {
  editingProp.value = prop
  newProp.value = { name: prop.name, description: prop.description || '', prompt: prop.prompt || '', type: prop.type || '', image_url: prop.image_url || '', local_path: prop.local_path || '' }
  addPropDialogVisible.value = true
}

const handlePropFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) { toast.error(t('message.imageOnlyUpload')); return }
  if (file.size / 1024 / 1024 >= 10) { toast.error(t('message.imageSizeLimit')); return }
  const formData = new FormData(); formData.append('file', file)
  try {
    const response = await fetch('/api/v1/upload/image', { method: 'POST', body: formData })
    const result = await response.json()
    if (result.data?.url) { newProp.value.image_url = result.data.url; newProp.value.local_path = result.data.local_path || '' }
  } catch { toast.error('Upload failed') }
  input.value = ''
}

const saveProp = async () => {
  if (!newProp.value.name.trim()) { toast.warning(t('message.enterPropName')); return }
  try {
    const propData = { drama_id: dramaStore.dramaId, name: newProp.value.name, description: newProp.value.description, prompt: newProp.value.prompt, type: newProp.value.type, image_url: newProp.value.image_url, local_path: newProp.value.local_path }
    if (editingProp.value) { await propAPI.update(editingProp.value.id, propData); toast.success(t('message.propUpdateSuccess')) }
    else { await propAPI.create(propData as any); toast.success(t('message.propAddSuccess')) }
    addPropDialogVisible.value = false; await reloadDrama()
  } catch (error: any) { toast.error(error.message || t('message.operationFailed')) }
}

const deleteProp = async (prop: Prop) => {
  if (!window.confirm(t('message.propDeleteConfirm', { name: prop.name }))) return
  try { await propAPI.delete(prop.id); toast.success(t('message.propDeleted')); await reloadDrama() }
  catch (error: any) { toast.error(error.message || t('message.deleteFailed')) }
}

const generatePropImage = async (prop: Prop) => {
  if (!prop.prompt) { toast.warning(t('message.setPropPromptFirst')); editProp(prop); return }
  try { await propAPI.generateImage(prop.id); toast.success(t('message.imageTaskSubmitted')); startPolling(reloadDrama) }
  catch (error: any) { toast.error(error.message || t('message.generateFailed')) }
}

const batchDeleteProps = async () => {
  if (!window.confirm(t('common.batchDeleteConfirm', { count: selectedCount.value }))) return
  try { for (const prop of selectedItems.value) { await propAPI.delete(prop.id) }; toast.success(t('message.batchDeleteSuccess')); clearSelection(); await reloadDrama() }
  catch (error: any) { toast.error(error.message || t('message.deleteFailed')) }
}

const batchGeneratePropImages = async () => {
  try { for (const prop of selectedItems.value) { if (prop.prompt) await propAPI.generateImage(prop.id) }; toast.success(t('message.imageTaskSubmitted')); clearSelection(); startPolling(reloadDrama) }
  catch (error: any) { toast.error(error.message || t('message.generateFailed')) }
}

const openExtractDialog = () => { extractPropsDialogVisible.value = true; selectedPropsEpisodeIds.value = []; selectAllPropsEpisodes.value = false; isPropsIndeterminate.value = false; propsExtractProgress.value = { active: false, percent: 0, message: '', status: '' } }
const handleSelectAllPropsEpisodes = (val: boolean) => { selectedPropsEpisodeIds.value = val ? sortedEpisodes.value.map(ep => ep.id) : []; selectAllPropsEpisodes.value = val; isPropsIndeterminate.value = false }
const togglePropEpisodeSelection = (id: string | number, checked: boolean) => {
  if (checked) selectedPropsEpisodeIds.value = [...selectedPropsEpisodeIds.value, id]
  else selectedPropsEpisodeIds.value = selectedPropsEpisodeIds.value.filter(v => v !== id)
  const total = sortedEpisodes.value.length
  selectAllPropsEpisodes.value = selectedPropsEpisodeIds.value.length === total
  isPropsIndeterminate.value = selectedPropsEpisodeIds.value.length > 0 && selectedPropsEpisodeIds.value.length < total
}

const handleExtractProps = async () => {
  if (selectedPropsEpisodeIds.value.length === 0) return
  try {
    propsExtractProgress.value = { active: true, percent: 0, message: t('prop.extracting') || t('character.extracting'), status: '' }
    const res = await propAPI.batchExtractFromEpisodes(dramaStore.dramaId, selectedPropsEpisodeIds.value.map(Number))
    const taskId = res.task_id
    const pollInterval = setInterval(async () => {
      try {
        const task = await taskAPI.getStatus(taskId)
        if (task.progress !== undefined) propsExtractProgress.value.percent = task.progress
        if (task.message) propsExtractProgress.value.message = task.message
        if (task.status === 'completed') {
          clearInterval(pollInterval); const result = typeof task.result === 'string' ? JSON.parse(task.result) : task.result
          propsExtractProgress.value = { active: false, percent: 100, message: t('prop.extractComplete', { props: result?.props || 0, dedup: result?.dedup_props || 0 }), status: 'success' }
          await reloadDrama()
        } else if (task.status === 'failed') { clearInterval(pollInterval); propsExtractProgress.value = { active: false, percent: 0, message: task.error || t('common.failed'), status: 'exception' } }
      } catch { clearInterval(pollInterval); propsExtractProgress.value = { active: false, percent: 0, message: t('common.failed'), status: 'exception' } }
    }, 3000)
  } catch (error: any) { propsExtractProgress.value = { active: false, percent: 0, message: '', status: '' }; toast.error(error.message || t('common.failed')) }
}
</script>

<style scoped>
.batch-bar { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4); margin-bottom: var(--space-4); background: var(--bg-card-hover); border-radius: var(--radius-lg); flex-wrap: wrap; }
.batch-bar__label { font-size: 0.875rem; color: var(--text-primary); }
.batch-bar__count { font-size: 0.875rem; color: var(--text-secondary); }
.hidden { display: none; }
.avatar-upload { width: 100px; height: 100px; border: 1px dashed var(--border-primary); border-radius: 6px; cursor: pointer; overflow: hidden; display: flex; align-items: center; justify-content: center; color: var(--text-muted); transition: border-color 0.2s; }
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
