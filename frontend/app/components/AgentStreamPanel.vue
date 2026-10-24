<template>
  <Teleport to="body">
    <div v-if="visible" class="stream-panel">
      <div class="stream-header">
        <Loader2 v-if="running" :size="14" class="animate-spin stream-spin" />
        <Check v-else :size="14" class="stream-done" />
        <span class="stream-title">{{ agentLabel }}</span>
        <span v-if="streamTools.length" class="stream-tools-count">{{ streamTools.length }}</span>
        <button type="button" class="stream-close" :aria-label="t('common.close')" @click="dismissed = true">×</button>
      </div>
      <div v-if="streamTools.length" class="stream-tools">
        <span v-for="(tool, i) in streamTools" :key="i" class="stream-tool-chip">{{ tool }}</span>
      </div>
      <div v-if="streamText" ref="bodyEl" class="stream-body">{{ streamText }}</div>
    </div>
  </Teleport>
</template>

<script setup>
import { Check, Loader2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useAgent } from '~/composables/useAgent'

const { t } = useI18n()
const { running, runningType, streamText, streamTools } = useAgent()

// 用户手动收起后本次运行不再弹出；新一轮 run（running 转 true）重置
const dismissed = ref(false)
watch(running, v => { if (v) dismissed.value = false })

const visible = computed(() => !dismissed.value && (running.value || streamText.value.length > 0))

const agentLabel = computed(() => {
    const names = {
        script_rewriter: t('agent.type.script_rewriter'),
        storyboard_breaker: t('agent.type.storyboard_breaker'),
        prompt_generator: t('agent.type.prompt_generator'),
        extractor: t('agent.type.extractor'),
    }
    const base = names[runningType.value] || runningType.value || t('agent.stream.title')
    return running.value ? `${base} · ${t('agent.stream.running')}` : `${base} · ${t('agent.stream.finished')}`
})

// 新增量自动滚到底（长剧本输出时保持可视尾部）
const bodyEl = ref(null)
watch(() => streamText.value.length, async () => {
    await nextTick()
    if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight
})
</script>

<style scoped>
.stream-panel {
    position: fixed;
    right: 20px;
    bottom: 20px;
    z-index: 90;
    width: 380px;
    max-width: calc(100vw - 40px);
    display: flex;
    flex-direction: column;
    border-radius: 14px;
    border: 1px solid var(--border-1);
    background: var(--bg-1);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
    overflow: hidden;
}
.stream-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-1);
    font-size: 12px;
    font-weight: 600;
    color: var(--text-1);
}
.stream-spin { color: var(--accent); flex-shrink: 0; }
.stream-done { color: var(--success, #10b981); flex-shrink: 0; }
.stream-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stream-tools-count {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--bg-2);
    color: var(--text-2);
}
.stream-close {
    border: none;
    background: none;
    color: var(--text-2);
    font-size: 15px;
    line-height: 1;
    padding: 0 2px;
    cursor: pointer;
}
.stream-close:hover { color: var(--text-0); }
.stream-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-1);
}
.stream-tool-chip {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 6px;
    background: var(--bg-2);
    color: var(--text-2);
    font-family: var(--font-mono, monospace);
}
.stream-body {
    max-height: 200px;
    overflow-y: auto;
    padding: 10px 12px;
    font-size: 11px;
    line-height: 1.6;
    color: var(--text-2);
    white-space: pre-wrap;
    word-break: break-word;
}
</style>
