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
  ArrowRight,
  Check,
  Loader2,
} from 'lucide-vue-next'

const props = defineProps<{
  rawContent: string
  scriptContent: string
  hasRawContent: boolean
  hasScript: boolean
  hasCharacters: boolean
  hasScenes: boolean
  characterCount: number
  sceneCount: number
  running: boolean
  runningType: string | null
}>()

const emit = defineEmits<{
  saveRaw: [content: string]
  saveScript: [content: string]
  upload: []
  rewrite: []
  extract: []
}>()

// --- 原始内容 ---
const localRaw = ref(props.rawContent)
const rawDirty = ref(false)

watch(() => props.rawContent, (val) => {
  localRaw.value = val
  rawDirty.value = false
})

function onRawInput(e: Event) {
  localRaw.value = (e.target as HTMLTextAreaElement).value
  rawDirty.value = localRaw.value !== props.rawContent
}

function saveRaw() {
  emit('saveRaw', localRaw.value)
  rawDirty.value = false
}

// --- 格式化剧本 ---
const localScript = ref(props.scriptContent)
const scriptDirty = ref(false)

watch(() => props.scriptContent, (val) => {
  localScript.value = val
  scriptDirty.value = false
})

function onScriptInput(e: Event) {
  localScript.value = (e.target as HTMLTextAreaElement).value
  scriptDirty.value = localScript.value !== props.scriptContent
}

function saveScript() {
  emit('saveScript', localScript.value)
  scriptDirty.value = false
}

// --- Computed ---
const hasRaw = computed(() => localRaw.value.trim().length > 0)
const hasLocalScript = computed(() => localScript.value.trim().length > 0)

const rawWordCount = computed(() => localRaw.value.replace(/\s/g, '').length)
const scriptWordCount = computed(() => localScript.value.replace(/\s/g, '').length)

// 流水线当前步骤
const currentStep = computed(() => {
  if (props.hasCharacters || props.hasScenes) return 3
  if (props.hasScript) return 2
  if (props.hasRawContent) return 1
  return 0
})

// 自动保存再触发操作
function handleRewrite() {
  if (rawDirty.value) {
    emit('saveRaw', localRaw.value)
    rawDirty.value = false
  }
  emit('rewrite')
}

function handleExtract() {
  if (scriptDirty.value) {
    emit('saveScript', localScript.value)
    scriptDirty.value = false
  }
  emit('extract')
}
</script>

<template>
  <div class="script-tab">
    <!-- Pipeline Steps -->
    <div class="pipeline">
      <div class="pipeline-step" :class="{ active: currentStep >= 1, current: currentStep === 0 }">
        <span class="step-dot">
          <Check v-if="currentStep >= 1" :size="10" />
          <span v-else>1</span>
        </span>
        <span class="step-label">原始内容</span>
      </div>
      <ArrowRight :size="14" class="pipeline-arrow" />
      <div class="pipeline-step" :class="{ active: currentStep >= 2, current: currentStep === 1 }">
        <span class="step-dot">
          <Loader2 v-if="runningType === 'script_rewriter'" :size="10" class="animate-spin" />
          <Check v-else-if="currentStep >= 2" :size="10" />
          <span v-else>2</span>
        </span>
        <span class="step-label">AI 改写</span>
      </div>
      <ArrowRight :size="14" class="pipeline-arrow" />
      <div class="pipeline-step" :class="{ active: currentStep >= 3, current: currentStep === 2 }">
        <span class="step-dot">
          <Loader2 v-if="runningType === 'extractor'" :size="10" class="animate-spin" />
          <Check v-else-if="currentStep >= 3" :size="10" />
          <span v-else>3</span>
        </span>
        <span class="step-label">提取角色&场景</span>
        <Badge v-if="hasCharacters" class="step-badge step-badge--char">
          <Users :size="9" /> {{ characterCount }}
        </Badge>
        <Badge v-if="hasScenes" class="step-badge step-badge--scene">
          <MapPin :size="9" /> {{ sceneCount }}
        </Badge>
      </div>
    </div>

    <!-- Two-panel content -->
    <div class="panels">
      <!-- Left: 原始内容 -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">原始内容</span>
          <Badge v-if="hasRaw" variant="secondary" class="panel-badge">{{ rawWordCount.toLocaleString() }}字</Badge>
          <div class="panel-actions">
            <Button variant="ghost" size="sm" class="panel-btn" @click="emit('upload')">
              <Upload :size="12" />
              上传
            </Button>
            <Button v-if="rawDirty" size="sm" class="panel-btn panel-btn--save" @click="saveRaw">
              <Save :size="12" />
              保存
            </Button>
          </div>
        </div>
        <textarea
          class="panel-textarea"
          :value="localRaw"
          placeholder="粘贴或上传小说/故事内容..."
          @input="onRawInput"
        />
      </div>

      <!-- Center: 操作按钮 -->
      <div class="panel-divider">
        <Button
          variant="outline"
          size="sm"
          class="action-btn"
          :disabled="!hasRaw || running"
          @click="handleRewrite"
        >
          <Loader2 v-if="runningType === 'script_rewriter'" :size="14" class="animate-spin" />
          <Wand2 v-else :size="14" />
          {{ runningType === 'script_rewriter' ? '改写中' : '改写' }}
          <ArrowRight :size="12" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="action-btn"
          :disabled="!hasLocalScript || running"
          @click="handleExtract"
        >
          <Loader2 v-if="runningType === 'extractor'" :size="14" class="animate-spin" />
          <FileText v-else :size="14" />
          {{ runningType === 'extractor' ? '提取中' : '提取' }}
          <ArrowRight :size="12" />
        </Button>
      </div>

      <!-- Right: 格式化剧本 -->
      <div class="panel">
        <div class="panel-header">
          <span class="panel-title">格式化剧本</span>
          <Badge v-if="hasLocalScript" variant="secondary" class="panel-badge">{{ scriptWordCount.toLocaleString() }}字</Badge>
          <div class="panel-actions">
            <Button v-if="scriptDirty" size="sm" class="panel-btn panel-btn--save" @click="saveScript">
              <Save :size="12" />
              保存
            </Button>
          </div>
        </div>
        <textarea
          class="panel-textarea"
          :value="localScript"
          placeholder="AI 改写后的格式化剧本将显示在这里..."
          @input="onScriptInput"
        />
      </div>
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

/* Pipeline Steps */
.pipeline {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-card);
}

.pipeline-step {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
  transition: color 0.2s;
}

.pipeline-step.active {
  color: var(--text-primary);
}

.pipeline-step.current {
  color: var(--accent, #e8a243);
}

.step-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.06);
  border: 1.5px solid var(--border-primary);
  transition: all 0.2s;
}

.pipeline-step.active .step-dot {
  background: rgba(94, 230, 176, 0.15);
  border-color: rgba(94, 230, 176, 0.5);
  color: rgba(94, 230, 176, 0.9);
}

.pipeline-step.current .step-dot {
  background: rgba(232, 162, 67, 0.15);
  border-color: var(--accent, #e8a243);
  color: var(--accent, #e8a243);
}

.step-label {
  font-weight: 500;
  white-space: nowrap;
}

.step-badge {
  font-size: 9px !important;
  padding: 0 5px !important;
  height: 16px !important;
  border-radius: 9999px !important;
  border: none !important;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.step-badge--char {
  background: rgba(232, 162, 67, 0.15) !important;
  color: rgba(232, 162, 67, 0.9) !important;
}

.step-badge--scene {
  background: rgba(96, 165, 250, 0.15) !important;
  color: rgba(96, 165, 250, 0.9) !important;
}

.pipeline-arrow {
  color: var(--text-muted);
  flex-shrink: 0;
}

/* Panels */
.panels {
  flex: 1;
  display: flex;
  min-height: 0;
  gap: 0;
}

.panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.panel-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-primary);
}

.panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.panel-badge {
  font-size: 10px !important;
  padding: 1px 6px !important;
  height: auto !important;
}

.panel-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
}

.panel-btn {
  font-size: 10px !important;
  height: 24px !important;
  padding: 0 6px !important;
  color: var(--text-secondary) !important;
}

.panel-btn:hover {
  color: var(--text-primary) !important;
}

.panel-btn--save {
  color: var(--text-inverse) !important;
  background: var(--accent) !important;
}

.panel-textarea {
  flex: 1;
  width: 100%;
  padding: 12px;
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-primary);
  background: transparent;
  border: none;
  resize: none;
  outline: none;
  font-family: inherit;
}

.panel-textarea::placeholder {
  color: var(--text-muted);
}

/* Center divider with action buttons */
.panel-divider {
  width: 52px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-left: 1px solid var(--border-primary);
  border-right: 1px solid var(--border-primary);
  background: var(--bg-card);
}

.action-btn {
  width: 40px !important;
  height: 40px !important;
  padding: 0 !important;
  border-radius: 10px !important;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 9px !important;
  line-height: 1;
}
</style>
