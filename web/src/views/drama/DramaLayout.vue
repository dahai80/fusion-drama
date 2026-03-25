<template>
  <div class="drama-layout">
    <!-- Left Sidebar -->
    <aside class="drama-sidebar">
      <!-- Back + Title -->
      <div class="sidebar-header">
        <router-link to="/dramas" class="back-link">
          <ArrowLeft :size="18" />
          <span>{{ t('nav.dramas', 'Projects') }}</span>
        </router-link>
        <h2 class="drama-title" v-if="dramaStore.currentDrama">
          {{ dramaStore.currentDrama.title }}
        </h2>
        <div class="drama-title-skeleton" v-else-if="dramaStore.loading" />
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        <router-link
          :to="`/drama/${dramaId}/overview`"
          class="nav-item"
          active-class="nav-item--active"
        >
          <LayoutGrid :size="18" />
          <span>{{ t('drama.management.overview', 'Overview') }}</span>
        </router-link>

        <router-link
          :to="`/drama/${dramaId}/episodes`"
          class="nav-item"
          active-class="nav-item--active"
        >
          <FileText :size="18" />
          <span>{{ t('drama.management.episodes', 'Episodes') }}</span>
          <span class="nav-badge" v-if="episodeCount > 0">{{ episodeCount }}</span>
        </router-link>

        <router-link
          :to="`/drama/${dramaId}/characters`"
          class="nav-item"
          active-class="nav-item--active"
        >
          <User :size="18" />
          <span>{{ t('drama.management.characters', 'Characters') }}</span>
          <span class="nav-badge" v-if="characterCount > 0">{{ characterCount }}</span>
        </router-link>

        <router-link
          :to="`/drama/${dramaId}/scenes`"
          class="nav-item"
          active-class="nav-item--active"
        >
          <Image :size="18" />
          <span>{{ t('drama.management.scenes', 'Scenes') }}</span>
          <span class="nav-badge" v-if="sceneCount > 0">{{ sceneCount }}</span>
        </router-link>

        <router-link
          :to="`/drama/${dramaId}/props`"
          class="nav-item"
          active-class="nav-item--active"
        >
          <Package :size="18" />
          <span>{{ t('drama.management.propList', 'Props') }}</span>
          <span class="nav-badge" v-if="propCount > 0">{{ propCount }}</span>
        </router-link>

        <router-link
          :to="`/drama/${dramaId}/settings`"
          class="nav-item"
          active-class="nav-item--active"
        >
          <Settings :size="18" />
          <span>{{ t('settings.title', 'Settings') }}</span>
        </router-link>
      </nav>
    </aside>

    <!-- Main Content -->
    <main class="drama-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useDramaStore } from '@/stores/drama'
import {
  ArrowLeft,
  LayoutGrid,
  FileText,
  User,
  Image,
  Package,
  Settings
} from 'lucide-vue-next'

const route = useRoute()
const { t } = useI18n()
const dramaStore = useDramaStore()

const dramaId = computed(() => route.params.id as string)

const episodeCount = computed(() => dramaStore.episodes.length)
const characterCount = computed(() => dramaStore.characters.length)
const sceneCount = computed(() => dramaStore.scenes.length)
const propCount = computed(() => dramaStore.props.length)

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
.drama-layout {
  display: flex;
  height: 100vh;
  background: var(--bg-primary);
}

.drama-sidebar {
  width: 220px;
  min-width: 220px;
  background: var(--bg-card);
  border-right: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-primary);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 13px;
  transition: color 0.2s;
}

.back-link:hover {
  color: var(--text-primary);
}

.drama-title {
  margin: 10px 0 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drama-title-skeleton {
  margin-top: 10px;
  height: 20px;
  width: 70%;
  border-radius: 4px;
  background: var(--border-primary);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 6px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 14px;
  transition: all 0.15s;
  cursor: pointer;
}

.nav-item:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.nav-item--active {
  background: var(--accent-light);
  color: var(--accent);
  font-weight: 500;
}

.nav-badge {
  margin-left: auto;
  font-size: 12px;
  min-width: 20px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  border-radius: 10px;
  background: var(--border-primary);
  color: var(--text-secondary);
  font-weight: 500;
}

.nav-item--active .nav-badge {
  background: var(--accent);
  color: var(--text-inverse);
}

.drama-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}
</style>
