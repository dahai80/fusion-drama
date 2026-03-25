<template>
  <ErrorBoundary>
    <component :is="layout">
      <router-view />
    </component>
  </ErrorBoundary>
  <Toaster position="top-right" :theme="isDark ? 'dark' : 'light'" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { Toaster } from 'vue-sonner'
import ErrorBoundary from '@/components/common/ErrorBoundary.vue'
import AppLayout from '@/components/layout/AppLayout.vue'
import { useUIStore } from '@/stores/ui'

const route = useRoute()
const uiStore = useUIStore()
const isDark = computed(() => uiStore.isDark)

// Fullscreen pages (EpisodeWorkflow, ProfessionalEditor) use their own layout
const layout = computed(() => {
  return route.meta.fullscreen ? 'div' : AppLayout
})
</script>
