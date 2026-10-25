<template>
  <div v-if="open" class="overlay" @click.self="!busy && emit('close')">
    <div class="dialog novel-dialog">
      <div class="dialog-head">
        <div class="dialog-title">{{ t('novel.title') }}</div>
        <button class="btn btn-icon btn-sm btn-ghost ml-auto dialog-close" :disabled="busy" @click="emit('close')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <div class="dialog-body">
        <!-- 步骤指示 -->
        <div class="novel-steps">
          <div v-for="(s, i) in steps" :key="s.key" :class="['novel-step', { on: stepKey === s.key, done: stepIndex > i }]">
            <span class="novel-step-num">{{ stepIndex > i ? '✓' : i + 1 }}</span>
            <span class="novel-step-label">{{ s.label }}</span>
          </div>
        </div>

        <!-- Step 1: 粘贴/导入小说 -->
        <div v-if="stepKey === 'input'" class="novel-input">
          <textarea
            v-model="content"
            class="novel-textarea"
            :placeholder="t('novel.inputPlaceholder')"
          />
          <div class="novel-input-foot">
            <button class="btn btn-sm" @click="fileInput?.click()">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              {{ t('novel.importFile') }}
            </button>
            <input ref="fileInput" type="file" accept=".txt,.md,text/plain,text/markdown" class="visually-hidden" @change="onFile" />
            <span class="novel-char-count">{{ t('novel.charCount', { n: content.length }) }}</span>
          </div>
          <div v-if="status.segmentCount" class="novel-hint">
            {{ t('novel.existingHint', { segments: status.segmentCount, outlined: status.outlinedCount, episodes: status.episodeCount }) }}
          </div>
        </div>

        <!-- Step 2-4: 进度 -->
        <div v-else class="novel-progress">
          <template v-if="stepKey === 'outline'">
            <div class="novel-progress-line">{{ t('novel.outlining') }}</div>
            <div class="novel-progress-num">{{ outlineProgress.done }} / {{ outlineProgress.total }}</div>
          </template>
          <template v-else-if="stepKey === 'plan'">
            <div class="novel-progress-line">{{ t('novel.planning') }}</div>
          </template>
          <template v-else-if="stepKey === 'rewrite'">
            <div class="novel-progress-line">{{ t('novel.rewriting') }}</div>
            <div class="novel-progress-num">{{ rewriteProgress.done }} / {{ rewriteProgress.total }}</div>
          </template>
          <template v-else-if="stepKey === 'done'">
            <div class="novel-progress-line">{{ t('novel.done', { episodes: status.episodeCount }) }}</div>
          </template>
          <div v-if="errorMsg" class="novel-error">{{ errorMsg }}</div>
        </div>
      </div>

      <div class="dialog-foot">
        <span class="dialog-foot-copy">{{ footCopy }}</span>
        <button v-if="stepKey === 'input'" class="btn" :disabled="busy" @click="emit('close')">{{ t('common.cancel') }}</button>
        <button v-if="stepKey === 'input'" class="btn btn-primary" :disabled="!content.trim() || busy || content.length < 500" @click="startImport">
          {{ busy ? t('novel.working') : t('novel.start') }}
        </button>
        <button v-else-if="stepKey === 'done'" class="btn btn-primary" @click="emit('done')">{{ t('novel.gotoEpisodes') }}</button>
        <button v-else-if="errorMsg" class="btn btn-primary" :disabled="busy" @click="retry">{{ t('common.retry') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import { toastError } from '~/composables/useToast'
import { novelAPI } from '~/composables/useApi'

const props = defineProps({
  open: { type: Boolean, default: false },
  dramaId: { type: Number, required: true },
})
const emit = defineEmits(['close', 'done'])
const { t } = useI18n()

const content = ref('')
const fileInput = ref(null)
const stepKey = ref('input')
const busy = ref(false)
const errorMsg = ref('')
const status = ref({})
let pollTimer = null

const stepOrder = ['input', 'outline', 'plan', 'rewrite', 'done']
const steps = computed(() => [
  { key: 'input', label: t('novel.step.import') },
  { key: 'outline', label: t('novel.step.outline') },
  { key: 'plan', label: t('novel.step.plan') },
  { key: 'rewrite', label: t('novel.step.rewrite') },
])
const stepIndex = computed(() => Math.max(0, stepOrder.indexOf(stepKey.value)))
const outlineProgress = computed(() => status.value.outlineTask?.progress || { done: 0, total: status.value.segmentCount || 0 })
const rewriteProgress = computed(() => status.value.rewriteTask?.progress || { done: 0, total: status.value.episodeCount || 0 })
const footCopy = computed(() => stepKey.value === 'input' ? t('novel.footCopy') : '')

// 打开时拉已有管线状态（支持断点续跑提示）
watch(() => props.open, async (v) => {
  if (!v) return
  errorMsg.value = ''
  stepKey.value = 'input'
  try {
    status.value = await novelAPI.status(props.dramaId) || {}
  } catch { status.value = {} }
})

onBeforeUnmount(() => { if (pollTimer) clearInterval(pollTimer) })

// 导入文件填充（UTF-8 → GBK 回退，与 ScriptPanel 同逻辑）
function onFile(e) {
  const input = e.target
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  const readFile = (encoding) => {
    const fr = new FileReader()
    fr.onerror = () => toastError(t('novel.importFailed'))
    fr.onload = () => {
      const text = String(fr.result || '')
      if (encoding !== 'gbk' && text.includes('�')) { readFile('gbk'); return }
      if (encoding === 'gbk' && text.includes('�')) { toastError(t('novel.importFailed')); return }
      content.value = text
      toast.success(t('novel.imported', { name: file.name }))
    }
    fr.readAsText(file, encoding)
  }
  readFile('utf-8')
}

async function startImport() {
  busy.value = true
  errorMsg.value = ''
  try {
    const res = await novelAPI.import(props.dramaId, content.value)
    status.value = { ...status.value, segmentCount: res.segmentCount, outlinedCount: 0, episodeCount: 0 }
    toast.success(t('novel.importedSegments', { n: res.segmentCount }))
    await runOutline()
  } catch (e) {
    toastError(e)
  } finally {
    busy.value = false
  }
}

async function runOutline() {
  stepKey.value = 'outline'
  busy.value = true
  try {
    await novelAPI.outline(props.dramaId)
    await pollUntil(async (s) => {
      const task = s.outlineTask
      if (!task) return false
      if (task.status === 'error') throw new Error(task.error || 'outline failed')
      return task.status === 'done'
    })
    await runPlan()
  } catch (e) {
    errorMsg.value = e.message || String(e)
  } finally {
    busy.value = false
  }
}

async function runPlan() {
  stepKey.value = 'plan'
  busy.value = true
  try {
    const res = await novelAPI.plan(props.dramaId)
    status.value = { ...status.value, episodeCount: res.episodeCount }
    await runRewrite()
  } catch (e) {
    errorMsg.value = e.message || String(e)
  } finally {
    busy.value = false
  }
}

async function runRewrite() {
  stepKey.value = 'rewrite'
  busy.value = true
  try {
    await novelAPI.rewriteAll(props.dramaId)
    await pollUntil(async (s) => {
      const task = s.rewriteTask
      if (!task) return false
      if (task.status === 'error') throw new Error(task.error || 'rewrite failed')
      return task.status === 'done'
    })
    stepKey.value = 'done'
  } catch (e) {
    errorMsg.value = e.message || String(e)
  } finally {
    busy.value = false
  }
}

/** 轮询 /novel/status，3s 间隔；check(s) 抛错则终止 */
function pollUntil(check) {
  return new Promise((resolve, reject) => {
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(async () => {
      try {
        const s = await novelAPI.status(props.dramaId)
        status.value = s || {}
        check(s)
        clearInterval(pollTimer)
        pollTimer = null
        resolve()
      } catch (err) {
        clearInterval(pollTimer)
        pollTimer = null
        reject(err)
      }
    }, 3000)
  })
}

/** 出错后从当前步骤重试（幂等：outline/rewrite 都跳过已完成块） */
async function retry() {
  errorMsg.value = ''
  if (stepKey.value === 'outline') await runOutline()
  else if (stepKey.value === 'plan') await runPlan()
  else if (stepKey.value === 'rewrite') await runRewrite()
}
</script>

<style scoped>
.novel-dialog { width: min(680px, 92vw); }
.novel-steps { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.novel-step { display: flex; align-items: center; gap: 6px; color: var(--text-3); font-size: 12px; }
.novel-step-num {
  width: 20px; height: 20px; border-radius: 7px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--bg-1); border: 1px solid var(--border);
  font-family: var(--font-mono); font-size: 10px; font-weight: 800;
}
.novel-step.on { color: var(--text-1); font-weight: 600; }
.novel-step.on .novel-step-num { background: var(--accent-bg); border-color: transparent; color: var(--accent-text); }
.novel-step.done .novel-step-num { background: var(--success-bg, var(--accent-bg)); border-color: transparent; color: var(--success, var(--accent-text)); }
.novel-textarea {
  width: 100%; height: 220px; resize: vertical;
  padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius);
  background: var(--bg-input); color: var(--text-0);
  font-size: 12.5px; line-height: 1.7; font-family: var(--font-body);
}
.novel-textarea:focus { outline: none; border-color: var(--accent); }
.novel-input-foot { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.novel-char-count { font-size: 11px; color: var(--text-3); font-family: var(--font-mono); margin-left: auto; }
.novel-hint { margin-top: 10px; font-size: 11.5px; color: var(--text-2); padding: 8px 10px; border: 1px dashed var(--border); border-radius: var(--radius); }
.novel-progress { min-height: 160px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
.novel-progress-line { font-size: 13px; color: var(--text-1); }
.novel-progress-num { font-family: var(--font-mono); font-size: 22px; font-weight: 800; color: var(--accent); }
.novel-error { font-size: 12px; color: var(--error); max-width: 480px; text-align: center; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
</style>
