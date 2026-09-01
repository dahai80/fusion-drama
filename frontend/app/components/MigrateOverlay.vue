<template>
  <Teleport to="body">
    <div v-if="state.active" class="migrate-overlay">
      <div class="migrate-box">
        <Loader2 :size="26" class="animate-spin" />
        <div class="migrate-title">{{ t('migrate.title') }}</div>
        <div class="migrate-msg">{{ state.message }}</div>
        <div class="migrate-bar">
          <div class="migrate-bar-fill" :style="{ width: `${state.percent}%` }"></div>
        </div>
        <div class="migrate-hint">{{ t('migrate.hint') }}</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useMigrateState } from '~/composables/useMigrateState'

const { t } = useI18n()
const { state } = useMigrateState()
</script>

<style scoped>
.migrate-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(8, 10, 14, 0.72);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.migrate-box {
  width: 380px;
  padding: 28px 32px;
  border-radius: 12px;
  background: var(--bg-card, #151a22);
  border: 1px solid var(--border, #2a3140);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text, #e7ecf3);
}
.migrate-title {
  font-size: 15px;
  font-weight: 600;
}
.migrate-msg {
  font-size: 12px;
  color: var(--text-dim, #93a0b5);
  min-height: 16px;
}
.migrate-bar {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border, #2a3140);
  overflow: hidden;
}
.migrate-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--accent, #4f7cff);
  transition: width 0.2s ease;
}
.migrate-hint {
  font-size: 11px;
  color: var(--text-dim, #93a0b5);
}
</style>
