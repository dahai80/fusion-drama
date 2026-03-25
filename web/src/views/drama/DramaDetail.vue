<template>
  <div class="drama-detail">
    <!-- Project Header -->
    <header class="dd-header">
      <div class="dd-header-left">
        <Button variant="ghost" size="sm" @click="router.push('/')">
          <ArrowLeft :size="16" />
          返回
        </Button>
        <h1 class="dd-title" v-if="dramaStore.currentDrama">{{ dramaStore.currentDrama.title }}</h1>
        <div class="dd-title-skeleton" v-else-if="dramaStore.loading" />
        <Badge v-if="dramaStore.currentDrama?.genre" variant="secondary">{{ dramaStore.currentDrama.genre }}</Badge>
      </div>
      <div class="dd-header-right">
        <Button variant="ghost" size="icon" @click="showSettings = !showSettings">
          <Settings :size="16" />
        </Button>
      </div>
    </header>

    <!-- Settings Panel (toggled) -->
    <div v-if="showSettings" class="dd-settings-panel">
      <SettingsTab />
    </div>

    <!-- Resource Summary Bar -->
    <div class="dd-resources">
      <button
        class="dd-resource-item"
        :class="{ active: expandedResource === 'characters' }"
        @click="toggleResource('characters')"
      >
        <User :size="14" />
        <span>角色</span>
        <Badge variant="secondary" class="dd-resource-badge">{{ dramaStore.characters.length }}</Badge>
        <ChevronDown :size="12" class="dd-chevron" :class="{ rotated: expandedResource === 'characters' }" />
      </button>
      <button
        class="dd-resource-item"
        :class="{ active: expandedResource === 'scenes' }"
        @click="toggleResource('scenes')"
      >
        <ImageIcon :size="14" />
        <span>场景</span>
        <Badge variant="secondary" class="dd-resource-badge">{{ dramaStore.scenes.length }}</Badge>
        <ChevronDown :size="12" class="dd-chevron" :class="{ rotated: expandedResource === 'scenes' }" />
      </button>
      <button
        class="dd-resource-item"
        :class="{ active: expandedResource === 'props' }"
        @click="toggleResource('props')"
      >
        <Package :size="14" />
        <span>道具</span>
        <Badge variant="secondary" class="dd-resource-badge">{{ dramaStore.props.length }}</Badge>
        <ChevronDown :size="12" class="dd-chevron" :class="{ rotated: expandedResource === 'props' }" />
      </button>
    </div>

    <!-- Expanded Resource Panel -->
    <div v-if="expandedResource && dramaStore.isLoaded" class="dd-resource-panel">
      <CharactersTab v-if="expandedResource === 'characters'" />
      <ScenesTab v-if="expandedResource === 'scenes'" />
      <PropsTab v-if="expandedResource === 'props'" />
    </div>

    <!-- Episodes Grid (main content) -->
    <div class="dd-episodes">
      <div v-if="dramaStore.loading" class="dd-loading">加载中...</div>
      <EpisodesTab v-else-if="dramaStore.isLoaded" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDramaStore } from '@/stores/drama'
import {
  ArrowLeft,
  Settings,
  User,
  Image as ImageIcon,
  Package,
  ChevronDown,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import CharactersTab from './management/CharactersTab.vue'
import ScenesTab from './management/ScenesTab.vue'
import PropsTab from './management/PropsTab.vue'
import EpisodesTab from './management/EpisodesTab.vue'
import SettingsTab from './management/SettingsTab.vue'

const route = useRoute()
const router = useRouter()
const dramaStore = useDramaStore()

const dramaId = computed(() => route.params.id as string)
const expandedResource = ref<'characters' | 'scenes' | 'props' | null>(null)
const showSettings = ref(false)

function toggleResource(resource: 'characters' | 'scenes' | 'props') {
  expandedResource.value = expandedResource.value === resource ? null : resource
}

async function ensureLoaded(id: string) {
  if (!id) return
  if (dramaStore.isLoaded && dramaStore.dramaId === id) return
  await dramaStore.loadDrama(id)
}

onMounted(() => {
  ensureLoaded(dramaId.value)
})

watch(dramaId, (newId) => {
  if (newId) {
    ensureLoaded(newId)
  }
})
</script>

<style scoped>
.drama-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Header */
.dd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-card);
  flex-shrink: 0;
}

.dd-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.dd-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.dd-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dd-title-skeleton {
  height: 20px;
  width: 120px;
  border-radius: 4px;
  background: var(--border-primary);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* Resource Summary Bar */
.dd-resources {
  display: flex;
  gap: 2px;
  padding: 8px 20px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-card);
  flex-shrink: 0;
}

.dd-resource-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.dd-resource-item:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.dd-resource-item.active {
  background: var(--accent-light);
  color: var(--accent);
}

.dd-resource-badge {
  font-size: 11px;
}

.dd-chevron {
  transition: transform 0.2s;
}

.dd-chevron.rotated {
  transform: rotate(180deg);
}

/* Resource Panel */
.dd-resource-panel {
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-primary);
  max-height: 400px;
  overflow-y: auto;
  padding: 16px 20px;
  flex-shrink: 0;
}

/* Settings Panel */
.dd-settings-panel {
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-primary);
  max-height: 500px;
  overflow-y: auto;
  padding: 16px 20px;
  flex-shrink: 0;
}

/* Episodes */
.dd-episodes {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
</style>
