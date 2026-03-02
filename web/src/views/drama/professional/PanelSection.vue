<template>
  <div class="panel-section">
    <button class="section-header" @click="isOpen = !isOpen" type="button">
      <span class="section-icon">{{ icon }}</span>
      <span class="section-title">{{ title }}</span>
      <el-icon class="section-chevron" :class="{ open: isOpen }"><ArrowDown /></el-icon>
    </button>
    <Transition name="section-slide">
      <div class="section-body" v-show="isOpen">
        <slot />
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'

const props = defineProps<{
  title: string
  icon: string
  defaultOpen?: boolean
}>()

const isOpen = ref(props.defaultOpen !== false)
</script>

<style scoped lang="scss">
.panel-section {
  border-bottom: 1px solid var(--border-primary, #e4e7ed);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary, #303133);

  &:hover { background: var(--bg-card-hover, #f5f7fa); }
}

.section-icon { font-size: 13px; }

.section-title {
  flex: 1;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--text-secondary, #606266);
}

.section-chevron {
  color: var(--text-muted, #909399);
  transition: transform 200ms;
  &.open { transform: rotate(180deg); }
}

.section-body {
  padding: 8px 12px 10px;
}

.section-slide-enter-active,
.section-slide-leave-active {
  transition: opacity 150ms;
}
.section-slide-enter-from,
.section-slide-leave-to {
  opacity: 0;
}
</style>
