<template>
  <NuxtLayout>
    <!-- F14: :key 强制同路由实例间导航重建组件——episode 页 setup 冻结路由参数，
         不重建会带着旧 dramaId/旧轮询进新集 -->
    <NuxtPage :key="route.fullPath" />
  </NuxtLayout>
  <Toaster position="top-right" :duration="3000" :theme="resolvedTheme" />
  <MigrateOverlay />
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { Toaster, toast } from 'vue-sonner'
import { useI18n } from 'vue-i18n'
import MigrateOverlay from '~/components/MigrateOverlay.vue'
import { useDesktopBridge } from '~/composables/useDesktopBridge'
import { useMigrateState } from '~/composables/useMigrateState'
import { useTheme } from '~/composables/useTheme'

const { t } = useI18n()
const route = useRoute()
const { resolvedTheme } = useTheme()

// Union Web 内嵌模式（PRD R-8③）：?embedded=1 进入即隐藏自有导航，宿主 Shell 提供外壳。
// 置入 useState 后跨路由保持——内部导航丢 query 不会把头部导航带回来
const embedded = useState('fusion-embedded', () => false)
watch(() => route.query.embedded, (v) => {
  if (v === '1' || v === 1) embedded.value = true
}, { immediate: true })

// 响应式文档标题（nuxt.config.ts 的静态 title 仅作 SSR/兜底）
useHead(() => ({ title: t('app.title') }))

const bridge = useDesktopBridge()
const { state, begin, update, end } = useMigrateState()

onMounted(() => {
  if (!bridge) return
  bridge.onMigrateProgress((p) => {
    if (p.phase === 'done') {
      update(p)
      // 稍等遮罩展示「完成」，再刷新页面让所有数据源指向新目录
      setTimeout(() => { end(); location.reload() }, 800)
      return
    }
    if (p.phase === 'error') {
      end()
      return // 错误 toast 由触发方（设置页）提示
    }
    if (!state.active) begin()
    update(p)
  })

  // 启动静默检查更新（主进程 20s 后自检一次，这里稍后取结果提示一次）
  setTimeout(async () => {
    try {
      const s = await bridge.getUpdateState()
      if (s?.status === 'available') {
        toast.info(t('app.updateAvailable', { version: s.latestVersion }), { duration: 8000 })
      }
    } catch { /* 静默 */ }
  }, 25_000)
})
</script>

<style>
@import url('./assets/studio.css');

/* === 应用内引导（driver.js）主题覆写 — 跟随设计 token === */
.fusion-tour-popover {
  background: var(--surface-raised) !important;
  color: var(--text-1) !important;
  border: 1px solid var(--border) !important;
  border-radius: var(--radius-lg) !important;
  box-shadow: var(--shadow-elevated) !important;
  max-width: 340px;
}
.fusion-tour-popover .driver-popover-title {
  color: var(--text-0) !important;
  font: 700 14px/1.3 var(--font-body) !important;
  letter-spacing: -0.01em;
}
.fusion-tour-popover .driver-popover-description {
  color: var(--text-2) !important;
  font: 400 12.5px/1.65 var(--font-body) !important;
}
.fusion-tour-popover .driver-popover-progress-text {
  color: var(--text-3) !important;
  font-size: 10.5px !important;
}
.fusion-tour-popover .driver-popover-close-btn {
  color: var(--text-3) !important;
}
.fusion-tour-popover .driver-popover-navigation-btns {
  gap: 6px;
}
.fusion-tour-popover .driver-popover-navigation-btns button {
  background: var(--button-bg) !important;
  color: var(--button-text) !important;
  border: none !important;
  border-radius: var(--radius-pill) !important;
  padding: 5px 14px !important;
  font: 600 12px var(--font-body) !important;
  text-shadow: none !important;
  cursor: pointer;
}
.fusion-tour-popover .driver-popover-navigation-btns button.driver-popover-next-btn,
.fusion-tour-popover .driver-popover-navigation-btns button.driver-popover-done-btn {
  background: var(--accent-gradient) !important;
  color: var(--on-accent) !important;
}
.driver-overlay {
  background: var(--scrim) !important;
  backdrop-filter: blur(2px);
}
/* 高亮框描边用品牌橙 */
.driver-active-element .driver-popover-arrow svg path,
.driver-active-element .driver-popover-arrow svg polygon {
  fill: var(--accent) !important;
}
</style>
