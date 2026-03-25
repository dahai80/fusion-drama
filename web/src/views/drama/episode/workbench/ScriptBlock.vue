<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { Button } from '@/components/ui/button'
import {
  FileText,
  Upload,
  Wand2,
  ChevronDown,
  ChevronRight,
  Check,
  Save,
} from 'lucide-vue-next'

const props = defineProps<{
  scriptContent: string
  expanded: boolean
  hasContent: boolean
}>()

const emit = defineEmits<{
  toggle: []
  save: [content: string]
  extract: []
  upload: []
  rewrite: []
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

const wordCount = computed(() => {
  return props.scriptContent.replace(/\s/g, '').length
})
</script>

<template>
  <div
    class="script-block"
    :class="{ 'is-disabled': !hasContent && !expanded }"
  >
    <!-- Header / Collapsed -->
    <button class="block-header" @click="emit('toggle')">
      <div class="block-header__left">
        <component
          :is="expanded ? ChevronDown : ChevronRight"
          :size="14"
          class="block-header__chevron"
        />
        <FileText :size="14" class="block-header__icon" />
        <span class="block-header__title">剧本</span>
      </div>
      <div v-if="hasContent && !expanded" class="block-header__meta">
        <Check :size="12" class="block-header__check" />
        <span>{{ wordCount.toLocaleString() }}字</span>
      </div>
    </button>

    <!-- Expanded Content -->
    <div v-if="expanded" class="block-body">
      <textarea
        class="script-textarea"
        :value="localContent"
        placeholder="粘贴或输入剧本内容..."
        @input="onInput"
      />
      <div class="block-actions">
        <Button
          variant="ghost"
          size="sm"
          class="block-action-btn"
          @click="emit('upload')"
        >
          <Upload :size="13" />
          上传剧本
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="block-action-btn"
          @click="emit('rewrite')"
        >
          <Wand2 :size="13" />
          Agent 改写
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="block-action-btn"
          :disabled="!hasContent"
          @click="emit('extract')"
        >
          <FileText :size="13" />
          提取角色&场景
        </Button>
        <Button
          v-if="isDirty"
          size="sm"
          class="block-action-btn block-action-btn--save"
          @click="handleSave"
        >
          <Save :size="13" />
          保存
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.script-block {
  border-bottom: 1px solid var(--border-primary);
}

.is-disabled {
  opacity: 0.45;
  pointer-events: none;
}

.block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-primary);
  transition: background var(--transition-fast);
}

.block-header:hover {
  background: var(--bg-card-hover);
}

.block-header__left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.block-header__chevron {
  color: var(--text-muted);
  flex-shrink: 0;
}

.block-header__icon {
  color: var(--accent);
  flex-shrink: 0;
}

.block-header__title {
  white-space: nowrap;
}

.block-header__meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-secondary);
}

.block-header__check {
  color: var(--success);
}

.block-body {
  padding: 0 12px 10px;
}

.script-textarea {
  width: 100%;
  min-height: 160px;
  max-height: 320px;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  resize: vertical;
  outline: none;
  transition: border-color var(--transition-fast);
  font-family: inherit;
}

.script-textarea:focus {
  border-color: var(--accent);
  box-shadow: var(--shadow-glow);
}

.script-textarea::placeholder {
  color: var(--text-muted);
}

.block-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.block-action-btn {
  font-size: 11px !important;
  height: 28px !important;
  padding: 0 8px !important;
  color: var(--text-secondary) !important;
}

.block-action-btn:hover {
  color: var(--text-primary) !important;
}

.block-action-btn--save {
  color: var(--text-inverse) !important;
  background: var(--accent) !important;
}

.block-action-btn--save:hover {
  background: var(--accent-hover) !important;
}
</style>
