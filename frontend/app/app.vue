<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <Toaster position="top-right" :duration="3000" />
  <MigrateOverlay />
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { Toaster, toast } from 'vue-sonner'
import MigrateOverlay from '~/components/MigrateOverlay.vue'
import { useDesktopBridge } from '~/composables/useDesktopBridge'
import { useMigrateState } from '~/composables/useMigrateState'

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
        toast.info(`发现新版本 v${s.latestVersion}，可在「设置 → 关于更新」中升级`, { duration: 8000 })
      }
    } catch { /* 静默 */ }
  }, 25_000)
})
</script>

<style>
@import url('./assets/studio.css');
</style>
