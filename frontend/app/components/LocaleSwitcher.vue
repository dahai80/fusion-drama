<template>
  <div class="locale-switcher" ref="rootEl">
    <button
      type="button"
      class="locale-trigger"
      :aria-label="t('components.localeSwitcher.label')"
      @click="open = !open"
    >
      <Languages :size="15" :stroke-width="1.8" />
      <span class="locale-current">{{ currentLabel }}</span>
    </button>
    <Teleport to="body">
      <div v-if="open" class="locale-menu" :style="menuStyle">
        <button
          v-for="l in UI_LOCALES"
          :key="l.value"
          type="button"
          :class="['locale-item', { active: l.value === locale }]"
          @click="select(l.value)"
        >
          <span>{{ l.label }}</span>
          <Check v-if="l.value === locale" :size="13" :stroke-width="2.2" />
        </button>
      </div>
      <div v-if="open" class="locale-backdrop" @click="open = false" />
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { Languages, Check } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { UI_LOCALES, setUiLocale } from '~/composables/i18n'

const { t, locale } = useI18n()

const open = ref(false)
const rootEl = ref(null)
const menuStyle = ref({})

const currentLabel = computed(() => UI_LOCALES.find(l => l.value === locale.value)?.label || locale.value)

function positionMenu() {
  const rect = rootEl.value?.getBoundingClientRect()
  if (!rect) return
  menuStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 6}px`,
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - 160))}px`,
  }
}

function select(l) {
  setUiLocale(l)
  open.value = false
}

// 与 ModelSelect 相同的策略：菜单 Teleport 到 body 用 fixed 定位，滚动/缩放即关闭
function closeOnScroll() { open.value = false }
function onKeydown(e) { if (e.key === 'Escape') open.value = false }

function onWatchOpen(v) {
  if (v) {
    positionMenu()
    document.addEventListener('scroll', closeOnScroll, true)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('scroll', closeOnScroll, true)
    document.removeEventListener('keydown', onKeydown)
  }
}

watch(open, onWatchOpen)
onBeforeUnmount(() => {
  document.removeEventListener('scroll', closeOnScroll, true)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.locale-switcher { position: relative; display: flex; }
.locale-trigger {
  display: flex; align-items: center; gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: none; border-radius: var(--radius-pill);
  background: transparent;
  font-size: 13px; font-weight: 600;
  color: var(--text-2); cursor: pointer;
  transition: all 0.18s var(--ease-out);
  line-height: 1;
}
.locale-trigger:hover { color: var(--text-0); background: var(--bg-hover); }
.locale-trigger:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3.5px var(--button-focus);
}
.locale-current { max-width: 88px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
</style>

<!-- 菜单 Teleport 到 body，不能用 scoped -->
<style>
.locale-backdrop {
  position: fixed;
  inset: 0;
  z-index: 990;
}
.locale-menu {
  z-index: 991;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px;
  border-radius: 12px;
  background: var(--bg-1, #fff);
  border: 1px solid var(--border);
  box-shadow: 0 12px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06);
  animation: localeMenuIn 0.16s var(--ease-out, ease-out);
}
@keyframes localeMenuIn {
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.locale-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 7px 9px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-1);
  font: 12.5px var(--font-body);
  text-align: left;
  cursor: pointer;
  transition: background 0.12s;
}
.locale-item:hover { background: var(--accent-bg, rgba(0,113,227,0.08)); }
.locale-item.active { font-weight: 600; color: var(--text-0); }
.locale-item svg { color: var(--accent, #0071e3); }
</style>
