<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Upload,
  Wand2,
  FileText,
  Save,
  Users,
  MapPin,
  Loader2,
} from 'lucide-vue-next'

const props = defineProps<{
  scriptContent: string
  hasScript: boolean
  hasCharacters: boolean
  hasScenes: boolean
  characterCount: number
  sceneCount: number
  running: boolean
  runningType: string | null
}>()

const emit = defineEmits<{
  save: [content: string]
  upload: []
  rewrite: []
  extract: []
}>()

const localContent = ref(props.scriptContent)
const isDirty = ref(false)

watch(
  () => props.scriptContent,
  (val) => {
    localContent.value = val
    isDirty.value = false
  },
)

function onInput(e: Event) {
  localContent.value = (e.target as HTMLTextAreaElement).value
  isDirty.value = localContent.value !== props.scriptContent
}

function handleSave() {
  emit('save', localContent.value)
  isDirty.value = false
}

const hasContent = computed(() => localContent.value.trim().length > 0)

const wordCount = computed(() => {
  return localContent.value.replace(/\s/g, '').length
})

const pipelineHint = computed(() => {
  if (!hasContent.value) return '上传或粘贴剧本内容开始制作'
  if (!props.hasCharacters && !props.hasScenes) return '剧本就绪，可以改写为格式化剧本或提取角色场景'
  return '角色场景已提取，可以切换到分镜 Tab 拆解分镜'
})

// Auto-save before triggering agent actions
async function saveAndEmit(event: 'rewrite' | 'extract') {
  if (isDirty.value) {
    emit('save', localContent.value)
    isDirty.value = false
  }
  emit(event)
}
</script>

<template>
  <div class="script-tab">
    <!-- Toolbar -->
    <div class="script-toolbar">
      <div class="script-toolbar-left">
        <span class="script-toolbar-title">剧本</span>
        <Badge v-if="hasContent" variant="secondary" class="word-badge">{{ wordCount.toLocaleString() }}字</Badge>
        <Badge v-if="hasCharacters" class="resource-badge resource-badge--char">
          <Users :size="10" />
          {{ characterCount }}
        </Badge>
        <Badge v-if="hasScenes" class="resource-badge resource-badge--scene">
          <MapPin :size="10" />
          {{ sceneCount }}
        </Badge>
      </div>
      <div class="script-toolbar-right">
        <Button variant="ghost" size="sm" class="tb-btn" @click="emit('upload')">
          <Upload :size="13" />
          上传
        </Button>
        <Button variant="ghost" size="sm" class="tb-btn"
          :disabled="!hasContent || running"
          @click="saveAndEmit('rewrite')"
        >
          <Loader2 v-if="runningType === 'script_rewriter'" :size="13" class="animate-spin" />
          <Wand2 v-else :size="13" />
          {{ runningType === 'script_rewriter' ? '改写中...' : 'AI 改写' }}
        </Button>
        <Button variant="ghost" size="sm" class="tb-btn"
          :disabled="!hasContent || running"
          @click="saveAndEmit('extract')"
        >
          <Loader2 v-if="runningType === 'extractor'" :size="13" class="animate-spin" />
          <FileText v-else :size="13" />
          {{ runningType === 'extractor' ? '提取中...' : '提取角色&场景' }}
        </Button>
        <Button v-if="isDirty" size="sm" class="tb-btn tb-btn--save" @click="handleSave">
          <Save :size="13" />
          保存
        </Button>
      </div>
    </div>

    <!-- Editor -->
    <div class="script-editor">
      <textarea
        class="script-textarea"
        :value="localContent"
        :placeholder="pipelineHint"
        @input="onInput"
      />
    </div>

    <!-- Pipeline hint -->
    <div class="script-hint">
      {{ pipelineHint }}
    </div>
  </div>
</template>

<style scoped>
.script-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.script-toolbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-primary);
  gap: 8px;
  flex-wrap: wrap;
}

.script-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.script-toolbar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.word-badge {
  font-size: 10px !important;
  padding: 1px 7px !important;
  height: auto !important;
}

.resource-badge {
  font-size: 10px !important;
  padding: 1px 7px !important;
  height: auto !important;
  border-radius: 9999px !important;
  border: none !important;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.resource-badge--char {
  background: rgba(232, 162, 67, 0.15) !important;
  color: rgba(232, 162, 67, 0.9) !important;
}

.resource-badge--scene {
  background: rgba(96, 165, 250, 0.15) !important;
  color: rgba(96, 165, 250, 0.9) !important;
}

.script-toolbar-right {
  display: flex;
  align-items: center;
  gap: 2px;
}

.tb-btn {
  font-size: 11px !important;
  height: 28px !important;
  padding: 0 8px !important;
  color: var(--text-secondary) !important;
}

.tb-btn:hover {
  color: var(--text-primary) !important;
}

.tb-btn--save {
  color: var(--text-inverse) !important;
  background: var(--accent) !important;
}

.script-editor {
  flex: 1;
  min-height: 0;
  padding: 12px;
}

.script-textarea {
  width: 100%;
  height: 100%;
  padding: 16px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  resize: none;
  outline: none;
  font-family: inherit;
  transition: border-color 0.15s;
}

.script-textarea:focus {
  border-color: var(--accent);
}

.script-textarea::placeholder {
  color: var(--text-muted);
}

.script-hint {
  flex-shrink: 0;
  padding: 6px 12px;
  border-top: 1px solid var(--border-primary);
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-card);
}
</style>
