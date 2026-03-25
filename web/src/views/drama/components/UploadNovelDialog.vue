<template>
  <Dialog v-model:open="visible">
    <DialogContent class="sm:max-w-[900px]">
      <DialogHeader>
        <DialogTitle>{{ $t('drama.novel.title') }}</DialogTitle>
      </DialogHeader>

      <!-- Step 1: Upload & Config -->
      <div v-if="step === 1">
        <div class="upload-area" @click="fileInputRef?.click()" @dragover.prevent @drop.prevent="handleDrop">
          <Upload :size="40" class="upload-icon" />
          <div class="upload-text">{{ $t('drama.novel.dragTip') }}</div>
          <div class="upload-tip">{{ $t('drama.novel.txtOnly') }}</div>
          <input ref="fileInputRef" type="file" accept=".txt" class="hidden" @change="handleNativeFileChange" />
        </div>

        <div v-if="fileText" class="file-info mt-4">
          <div class="info-row">
            <span class="info-label">{{ $t('drama.novel.fileName') }}</span>
            <span class="info-value">{{ fileName }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">{{ $t('drama.novel.totalChars') }}</span>
            <span class="info-value">{{ fileText.length }}</span>
          </div>
        </div>

        <div v-if="fileText" class="config-form mt-4">
          <div class="form-field">
            <label class="form-label">{{ $t('drama.novel.splitMode') }}</label>
            <div class="radio-group">
              <label class="radio-item">
                <input type="radio" v-model="splitMode" value="chapter" />
                <span>{{ $t('drama.novel.byChapter') }}</span>
              </label>
              <label class="radio-item">
                <input type="radio" v-model="splitMode" value="charCount" />
                <span>{{ $t('drama.novel.byCharCount') }}</span>
              </label>
            </div>
          </div>
          <div class="form-field">
            <label class="form-label">{{ $t('drama.novel.targetChars') }}</label>
            <Input v-model.number="targetChars" type="number" :min="1000" :max="10000" :step="500" class="w-40" />
          </div>
          <div class="form-field">
            <label class="form-label">{{ $t('drama.novel.saveMode') }}</label>
            <div class="radio-group">
              <label class="radio-item">
                <input type="radio" v-model="saveMode" value="append" />
                <span>{{ $t('drama.novel.append') }}</span>
              </label>
              <label class="radio-item">
                <input type="radio" v-model="saveMode" value="replace" />
                <span>{{ $t('drama.novel.replace') }}</span>
              </label>
            </div>
          </div>
          <div v-if="saveMode === 'replace' && existingEpisodeCount > 0" class="warning-alert mb-2">
            <AlertTriangle :size="16" />
            <span>{{ $t('drama.novel.replaceWarning') }}</span>
          </div>
        </div>
      </div>

      <!-- Step 2: Preview -->
      <div v-else class="preview-container">
        <div class="preview-stats">
          <Badge>{{ $t('drama.novel.totalChapters', { count: chapters.length }) }}</Badge>
          <Badge variant="secondary">{{ $t('drama.novel.totalCharsCount', { count: totalCharsCount }) }}</Badge>
        </div>
        <div class="preview-body">
          <div class="chapter-list">
            <div
              v-for="(ch, idx) in chapters"
              :key="idx"
              class="chapter-item"
              :class="{ active: selectedIndex === idx }"
              @click="selectedIndex = idx"
            >
              <div class="chapter-item-header">
                <div class="chapter-item-title">
                  <span v-if="editingIndex !== idx" @dblclick="startEdit(idx)">{{ ch.title }}</span>
                  <Input
                    v-else
                    v-model="ch.title"
                    class="chapter-edit-input"
                    @blur="editingIndex = -1"
                    @keyup.enter="editingIndex = -1"
                  />
                </div>
                <button class="chapter-item-delete" @click.stop="handleDeleteChapter(idx)">
                  <X :size="14" />
                </button>
              </div>
              <span class="chapter-item-count">{{ $t('drama.novel.charCount', { count: ch.charCount }) }}</span>
            </div>
          </div>
          <div class="chapter-preview">
            <textarea
              v-if="chapters[selectedIndex]"
              class="glass-input-base preview-textarea"
              :value="chapters[selectedIndex].content"
              @input="handleContentEdit(($event.target as HTMLTextAreaElement).value)"
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <template v-if="step === 1">
          <Button variant="outline" @click="handleClose">{{ $t('common.cancel') }}</Button>
          <Button :disabled="!fileText" @click="handleSplit">
            {{ $t('drama.novel.startSplit') }}
          </Button>
        </template>
        <template v-else>
          <Button variant="outline" @click="step = 1">{{ $t('drama.novel.back') }}</Button>
          <Button @click="handleSave" :disabled="saving">
            <Loader2 v-if="saving" :size="16" class="animate-spin mr-1" />
            {{ $t('drama.novel.save') }}
          </Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Upload, X, AlertTriangle, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { splitNovel, type ChapterResult, type SplitOptions } from '@/utils/novelSplitter'
import { dramaAPI } from '@/api/drama'

const props = defineProps<{
  modelValue: boolean
  dramaId: string
  existingEpisodeCount: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: []
}>()

const { t } = useI18n()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})

const step = ref(1)
const fileText = ref('')
const fileName = ref('')
const splitMode = ref<SplitOptions['mode']>('chapter')
const targetChars = ref(3000)
const saveMode = ref<'append' | 'replace'>('append')
const chapters = ref<ChapterResult[]>([])
const selectedIndex = ref(0)
const editingIndex = ref(-1)
const saving = ref(false)
const fileInputRef = ref<HTMLInputElement>()

const totalCharsCount = computed(() =>
  chapters.value.reduce((sum, ch) => sum + ch.charCount, 0),
)

const startEdit = (idx: number) => { editingIndex.value = idx }

const handleDeleteChapter = (idx: number) => {
  chapters.value.splice(idx, 1)
  if (selectedIndex.value >= chapters.value.length) {
    selectedIndex.value = Math.max(0, chapters.value.length - 1)
  }
}

const handleContentEdit = (val: string) => {
  const ch = chapters.value[selectedIndex.value]
  if (ch) { ch.content = val; ch.charCount = val.length }
}

const processFile = (file: File) => {
  if (!file.name.endsWith('.txt')) { toast.warning(t('drama.novel.txtOnly')); return }
  fileName.value = file.name
  const reader = new FileReader()
  reader.onload = (e) => { fileText.value = (e.target?.result as string) || '' }
  reader.readAsText(file, 'UTF-8')
}

const handleNativeFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) processFile(file)
  input.value = ''
}

const handleDrop = (event: DragEvent) => {
  const file = event.dataTransfer?.files?.[0]
  if (file) processFile(file)
}

const handleSplit = () => {
  if (!fileText.value) { toast.warning(t('drama.novel.noFile')); return }
  chapters.value = splitNovel(fileText.value, { mode: splitMode.value, targetChars: targetChars.value })
  selectedIndex.value = 0
  step.value = 2
}

const handleSave = async () => {
  saving.value = true
  try {
    const startNum = saveMode.value === 'append' ? props.existingEpisodeCount : 0
    const episodes = chapters.value.map((ch, idx) => ({
      episode_number: startNum + idx + 1,
      title: ch.title,
      script_content: ch.content,
    }))
    if (saveMode.value === 'append' && props.existingEpisodeCount > 0) {
      const dramaData = await dramaAPI.get(props.dramaId)
      const existing = (dramaData.episodes || []).map((ep: any) => ({
        id: ep.id, episode_number: ep.episode_number, title: ep.title, script_content: ep.script_content,
      }))
      await dramaAPI.saveEpisodes(props.dramaId, [...existing, ...episodes])
    } else {
      await dramaAPI.saveEpisodes(props.dramaId, episodes)
    }
    toast.success(t('drama.novel.saveSuccess'))
    emit('success')
    handleClose()
  } catch (error: any) { toast.error(error.message || t('common.failed')) }
  finally { saving.value = false }
}

const handleClose = () => {
  visible.value = false; step.value = 1; fileText.value = ''; fileName.value = ''
  chapters.value = []; selectedIndex.value = 0; editingIndex.value = -1
}
</script>

<style scoped>
.hidden { display: none; }
.mt-4 { margin-top: 16px; }
.mb-2 { margin-bottom: 8px; }
.mr-1 { margin-right: 0.25rem; }

.upload-area {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 40px; border: 2px dashed var(--border-primary); border-radius: var(--radius-lg);
  cursor: pointer; transition: border-color 0.2s; text-align: center;
}
.upload-area:hover { border-color: var(--accent); }
.upload-icon { color: var(--accent); margin-bottom: 12px; }
.upload-text { font-size: 14px; color: var(--text-primary); margin-bottom: 4px; }
.upload-tip { font-size: 12px; color: var(--text-muted); }

.file-info { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px; background: var(--bg-secondary); border-radius: var(--radius-md); }
.info-row { display: flex; flex-direction: column; gap: 2px; }
.info-label { font-size: 12px; color: var(--text-muted); }
.info-value { font-size: 14px; font-weight: 500; color: var(--text-primary); }

.config-form { display: flex; flex-direction: column; gap: 16px; }
.form-field { display: flex; flex-direction: column; gap: 6px; }
.form-label { font-size: 0.875rem; font-weight: 500; color: var(--text-primary); }
.radio-group { display: flex; gap: 16px; }
.radio-item { display: flex; align-items: center; gap: 6px; font-size: 14px; cursor: pointer; }
.w-40 { width: 160px; }

.warning-alert { display: flex; align-items: flex-start; gap: 8px; padding: 12px; background: rgba(245, 158, 11, 0.1); border-radius: var(--radius-md); font-size: 0.8125rem; color: #d97706; }

.preview-stats { display: flex; gap: 8px; margin-bottom: 12px; }
.preview-body { display: flex; gap: 12px; height: 450px; }
.chapter-list { width: 220px; flex-shrink: 0; overflow-y: auto; border: 1px solid var(--border-primary); border-radius: 4px; }
.chapter-item { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--glass-stroke-soft); transition: background 0.2s; }
.chapter-item:hover { background: var(--bg-card-hover); }
.chapter-item.active { background: var(--glass-tone-info-bg); }
.chapter-item-header { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
.chapter-item-title { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; margin-bottom: 2px; color: var(--text-primary); }
.chapter-item-delete { flex-shrink: 0; color: var(--text-muted); cursor: pointer; opacity: 0; transition: opacity 0.2s, color 0.2s; background: none; border: none; padding: 2px; }
.chapter-item:hover .chapter-item-delete { opacity: 1; }
.chapter-item-delete:hover { color: #ef4444; }
.chapter-item-count { font-size: 12px; color: var(--text-secondary); }
.chapter-preview { flex: 1; min-width: 0; }
.preview-textarea { width: 100%; height: 100%; font-size: 13px; line-height: 1.8; resize: none; padding: 12px; border-radius: var(--radius-md); }
.chapter-edit-input { font-size: 13px; }
</style>
