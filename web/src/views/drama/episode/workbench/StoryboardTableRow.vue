<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ImageIcon, Video, Loader2 } from 'lucide-vue-next'
import type { Storyboard, Character, Scene } from '@/types/drama'
import { getImageUrl } from '@/utils/image'

const props = defineProps<{
  storyboard: Storyboard
  index: number
  selected: boolean
  characters: Character[]
  scenes: Scene[]
}>()

const emit = defineEmits<{
  toggleSelect: [id: string]
  saveField: [id: string, field: string, value: any]
  generateImage: [id: string]
  generateVideo: [id: string]
}>()

const shotTypeOptions = ['远景', '全景', '中景', '近景', '特写']

const editingField = ref<string | null>(null)
const editValue = ref('')

const thumbnailUrl = computed(() => getImageUrl(props.storyboard))

const hasImage = computed(() => !!props.storyboard.image_url || !!props.storyboard.local_path)
const hasVideo = computed(() => !!props.storyboard.video_url)
const isGenerating = computed(() =>
  props.storyboard.image_generation_status === 'processing' ||
  props.storyboard.image_generation_status === 'generating' ||
  props.storyboard.status === 'processing' ||
  props.storyboard.status === 'generating'
)

const statusText = computed(() => {
  if (isGenerating.value) return '生成中'
  if (hasVideo.value) return '有视频'
  if (hasImage.value) return '有图'
  return '待处理'
})

const statusClass = computed(() => {
  if (isGenerating.value) return 'status--generating'
  if (hasVideo.value) return 'status--complete'
  if (hasImage.value) return 'status--image'
  return 'status--pending'
})

const sceneDisplay = computed(() => {
  const s = props.storyboard.scene
  if (!s) return ''
  return `${s.location || ''}${s.time ? ' · ' + s.time : ''}`
})

const storyboardCharacters = computed(() => {
  if (!props.storyboard.character_ids?.length) return []
  return props.characters.filter(c =>
    props.storyboard.character_ids!.includes(c.id)
  )
})

const sequenceNumber = computed(() => {
  const num = props.storyboard.storyboard_number || props.index + 1
  return String(num).padStart(2, '0')
})

function startEdit(field: string, currentValue: string) {
  editingField.value = field
  editValue.value = currentValue || ''
  nextTick(() => {
    const el = document.querySelector('.inline-textarea:focus') as HTMLTextAreaElement
    el?.focus()
  })
}

function commitEdit(field: string) {
  if (editingField.value === field) {
    emit('saveField', props.storyboard.id, field, editValue.value)
    editingField.value = null
  }
}

function onSelectChange(field: string, value: string) {
  emit('saveField', props.storyboard.id, field, value)
}
</script>

<template>
  <tr class="table-row" :class="{ 'table-row--selected': selected }">
    <!-- Checkbox -->
    <td class="cell cell--checkbox">
      <Checkbox
        :checked="selected"
        @update:checked="emit('toggleSelect', storyboard.id)"
      />
    </td>

    <!-- Sequence number -->
    <td class="cell cell--seq">
      <span class="seq-num">#{{ sequenceNumber }}</span>
    </td>

    <!-- Thumbnail -->
    <td class="cell cell--thumb">
      <div class="thumb-wrapper">
        <img v-if="thumbnailUrl" :src="thumbnailUrl" class="thumb-img" />
        <div v-else-if="isGenerating" class="thumb-placeholder">
          <Loader2 :size="16" class="animate-spin" />
        </div>
        <div v-else class="thumb-placeholder">
          <ImageIcon :size="16" />
        </div>
      </div>
    </td>

    <!-- Scene -->
    <td class="cell cell--scene">
      <Select
        :model-value="storyboard.scene_id || ''"
        @update:model-value="(v: string) => onSelectChange('scene_id', v)"
      >
        <SelectTrigger class="inline-select">
          <SelectValue :placeholder="sceneDisplay || '选择场景'" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="s in scenes" :key="s.id" :value="s.id">
            {{ s.location }}{{ s.time ? ' · ' + s.time : '' }}
          </SelectItem>
        </SelectContent>
      </Select>
    </td>

    <!-- Shot type -->
    <td class="cell cell--shot">
      <Select
        :model-value="storyboard.shot_type || ''"
        @update:model-value="(v: string) => onSelectChange('shot_type', v)"
      >
        <SelectTrigger class="inline-select">
          <SelectValue placeholder="景别" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="opt in shotTypeOptions" :key="opt" :value="opt">
            {{ opt }}
          </SelectItem>
        </SelectContent>
      </Select>
    </td>

    <!-- Description -->
    <td class="cell cell--text" @dblclick="startEdit('description', storyboard.description || '')">
      <textarea
        v-if="editingField === 'description'"
        v-model="editValue"
        class="inline-textarea"
        rows="2"
        @blur="commitEdit('description')"
        @keydown.ctrl.enter="commitEdit('description')"
      />
      <span v-else class="cell-text" :class="{ 'cell-text--empty': !storyboard.description }">
        {{ storyboard.description || '双击编辑...' }}
      </span>
    </td>

    <!-- Video prompt -->
    <td class="cell cell--text cell--prompt" @dblclick="startEdit('video_prompt', storyboard.video_prompt || '')">
      <textarea
        v-if="editingField === 'video_prompt'"
        v-model="editValue"
        class="inline-textarea"
        rows="3"
        @blur="commitEdit('video_prompt')"
        @keydown.ctrl.enter="commitEdit('video_prompt')"
      />
      <span v-else class="cell-text" :class="{ 'cell-text--empty': !storyboard.video_prompt }">
        {{ storyboard.video_prompt || '双击编辑...' }}
      </span>
    </td>

    <!-- Characters -->
    <td class="cell cell--chars">
      <div class="char-tags">
        <Badge v-for="char in storyboardCharacters" :key="char.id" class="char-tag">
          {{ char.name }}
        </Badge>
        <span v-if="!storyboardCharacters.length" class="cell-text--empty">-</span>
      </div>
    </td>

    <!-- Dialogue -->
    <td class="cell cell--text" @dblclick="startEdit('dialogue', storyboard.dialogue || '')">
      <textarea
        v-if="editingField === 'dialogue'"
        v-model="editValue"
        class="inline-textarea"
        rows="2"
        @blur="commitEdit('dialogue')"
        @keydown.ctrl.enter="commitEdit('dialogue')"
      />
      <span v-else class="cell-text" :class="{ 'cell-text--empty': !storyboard.dialogue }">
        {{ storyboard.dialogue || '双击编辑...' }}
      </span>
    </td>

    <!-- Status -->
    <td class="cell cell--status">
      <Badge class="status-badge" :class="statusClass">
        <Loader2 v-if="isGenerating" :size="10" class="animate-spin" />
        {{ statusText }}
      </Badge>
    </td>

    <!-- Actions (visible on hover) -->
    <td class="cell cell--actions">
      <div class="row-actions">
        <Button
          variant="ghost"
          size="icon"
          class="action-btn"
          title="生成图片"
          @click="emit('generateImage', storyboard.id)"
        >
          <ImageIcon :size="14" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="action-btn"
          title="生成视频"
          @click="emit('generateVideo', storyboard.id)"
        >
          <Video :size="14" />
        </Button>
      </div>
    </td>
  </tr>
</template>

<style scoped>
.table-row {
  border-bottom: 1px solid var(--border-primary, rgba(255, 255, 255, 0.06));
  transition: background 0.1s;
}

.table-row:hover {
  background: rgba(255, 255, 255, 0.02);
}

.table-row--selected {
  background: rgba(232, 162, 67, 0.06);
}

.cell {
  padding: 6px 8px;
  vertical-align: middle;
  font-size: 12px;
  color: var(--text-primary);
}

.cell--checkbox {
  width: 32px;
  text-align: center;
}

.cell--seq {
  width: 52px;
}

.seq-num {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  font-family: monospace;
}

.cell--thumb {
  width: 168px;
  padding: 4px 8px;
}

.thumb-wrapper {
  width: 160px;
  height: 90px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-primary, rgba(255, 255, 255, 0.06));
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}

.cell--scene {
  width: 140px;
}

.cell--shot {
  width: 80px;
}

.cell--text {
  min-width: 120px;
  max-width: 200px;
}

.cell--prompt {
  min-width: 200px;
  max-width: 300px;
}

.cell-text {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
  cursor: default;
}

.cell-text--empty {
  color: var(--text-muted, rgba(255, 255, 255, 0.3));
  font-style: italic;
}

.inline-select {
  height: 28px !important;
  font-size: 11px !important;
  background: transparent !important;
  border-color: var(--border-primary) !important;
}

.inline-textarea {
  width: 100%;
  font-size: 12px;
  line-height: 1.5;
  padding: 4px 6px;
  border-radius: 4px;
  border: 1px solid var(--accent, #e8a243);
  background: var(--bg-primary);
  color: var(--text-primary);
  resize: vertical;
  font-family: inherit;
  outline: none;
}

.cell--chars {
  min-width: 100px;
}

.char-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.char-tag {
  font-size: 10px !important;
  padding: 1px 6px !important;
  height: auto !important;
  border-radius: 9999px !important;
  background: rgba(232, 162, 67, 0.15) !important;
  color: rgba(232, 162, 67, 0.9) !important;
  border: none !important;
}

.cell--status {
  width: 72px;
}

.status-badge {
  font-size: 10px !important;
  padding: 1px 7px !important;
  height: auto !important;
  border-radius: 9999px !important;
  border: none !important;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.status--pending {
  background: rgba(255, 255, 255, 0.06) !important;
  color: rgba(255, 255, 255, 0.45) !important;
}

.status--generating {
  background: rgba(96, 165, 250, 0.15) !important;
  color: rgba(96, 165, 250, 0.9) !important;
}

.status--image {
  background: rgba(232, 162, 67, 0.15) !important;
  color: rgba(232, 162, 67, 0.9) !important;
}

.status--complete {
  background: rgba(94, 230, 176, 0.15) !important;
  color: rgba(94, 230, 176, 0.9) !important;
}

.cell--actions {
  width: 72px;
}

.row-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.table-row:hover .row-actions {
  opacity: 1;
}

.action-btn {
  width: 28px !important;
  height: 28px !important;
  padding: 0 !important;
  color: var(--text-muted) !important;
}

.action-btn:hover {
  color: var(--accent) !important;
}
</style>
