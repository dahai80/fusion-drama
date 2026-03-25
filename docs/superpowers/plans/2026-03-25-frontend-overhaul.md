# Frontend Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Element Plus with Shadcn Vue, restructure routes to nested layout, and build a progressive panel-based EpisodeWorkbench with Agent integration.

**Architecture:** Panel-based workbench (left 20% resource panel + right 80% storyboard area) replacing the current linear EpisodeWorkflow + ProfessionalEditor. Nested routes under `/drama/:id` with shared DramaLayout. Shadcn Vue components styled via Glass Design System CSS variables.

**Tech Stack:** Vue 3, Shadcn Vue (Radix Vue), Tailwind CSS 4, Lucide Icons, Pinia, TypeScript, vee-validate

**Spec:** `docs/superpowers/specs/2026-03-25-frontend-overhaul-design.md`

---

## Phase 1: Foundation (Shadcn Vue + Theme)

### Task 1: Initialize Shadcn Vue

**Files:**
- Modify: `web/package.json`
- Create: `web/components.json` (Shadcn Vue config)
- Create: `web/src/lib/utils.ts` (cn utility)
- Create: `web/src/components/ui/button/Button.vue`
- Create: `web/src/components/ui/button/index.ts`
- Create: `web/src/components/ui/input/Input.vue`
- Create: `web/src/components/ui/input/index.ts`

- [ ] **Step 1: Install Shadcn Vue dependencies**

```bash
cd web
pnpm add radix-vue class-variance-authority clsx tailwind-merge lucide-vue-next
pnpm add -D @types/node
```

- [ ] **Step 2: Create cn utility**

Create `web/src/lib/utils.ts`:
```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 3: Create components.json for Shadcn Vue**

Create `web/components.json`:
```json
{
  "style": "default",
  "typescript": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/assets/styles/main.css",
    "baseColor": "neutral"
  },
  "framework": "vite",
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui"
  }
}
```

- [ ] **Step 4: Generate initial Shadcn Vue components**

```bash
cd web
npx shadcn-vue@latest add button input dialog sheet tabs badge alert skeleton tooltip popover dropdown-menu select switch checkbox separator scroll-area
```

This generates component files into `web/src/components/ui/`.

- [ ] **Step 5: Verify generated components exist**

```bash
ls web/src/components/ui/
```

Expected: directories for each component (button/, input/, dialog/, sheet/, tabs/, etc.)

- [ ] **Step 6: Commit**

```bash
git add -A web/src/components/ui/ web/src/lib/ web/components.json web/package.json web/pnpm-lock.yaml
git commit -m "feat: initialize Shadcn Vue with base components and utilities"
```

---

### Task 2: Map Glass Tokens to Shadcn CSS Variables

**Files:**
- Modify: `web/src/assets/styles/main.css`

- [ ] **Step 1: Add Shadcn CSS variable mappings after Glass token imports**

In `web/src/assets/styles/main.css`, add a new section after the existing `:root` block that maps Glass tokens to Shadcn's expected variable names:

```css
/* Shadcn Vue / Glass token bridge */
:root {
  --background: var(--bg-primary);
  --foreground: var(--text-primary);
  --card: var(--bg-card);
  --card-foreground: var(--text-primary);
  --popover: var(--bg-elevated);
  --popover-foreground: var(--text-primary);
  --primary: var(--accent, #3b82f6);
  --primary-foreground: var(--glass-text-on-accent, #ffffff);
  --secondary: var(--bg-secondary);
  --secondary-foreground: var(--text-secondary);
  --muted: var(--bg-secondary);
  --muted-foreground: var(--text-muted);
  --accent: var(--bg-card-hover);
  --accent-foreground: var(--text-primary);
  --destructive: var(--error, #ef4444);
  --destructive-foreground: #ffffff;
  --border: var(--border-primary);
  --input: var(--border-primary);
  --ring: var(--border-focus);
  --radius: var(--radius-md, 0.5rem);
}

.dark {
  --background: var(--bg-primary);
  --foreground: var(--text-primary);
  --card: var(--bg-card);
  --card-foreground: var(--text-primary);
  --popover: var(--bg-elevated);
  --popover-foreground: var(--text-primary);
  --primary: var(--accent, #e8a243);
  --primary-foreground: var(--glass-text-on-accent, #1a1614);
  --secondary: var(--bg-secondary);
  --secondary-foreground: var(--text-secondary);
  --muted: var(--bg-secondary);
  --muted-foreground: var(--text-muted);
  --accent: var(--bg-card-hover);
  --accent-foreground: var(--text-primary);
  --destructive: var(--error, #fb8a8a);
  --destructive-foreground: #1a1614;
  --border: var(--border-primary);
  --input: var(--border-primary);
  --ring: var(--border-focus);
}
```

- [ ] **Step 2: Verify the app still renders with both theme modes**

```bash
cd web && pnpm dev
```

Open browser, toggle dark mode. Verify Glass styling is unchanged, no visual regression.

- [ ] **Step 3: Commit**

```bash
git add web/src/assets/styles/main.css
git commit -m "feat: bridge Glass design tokens to Shadcn Vue CSS variables"
```

---

### Task 3: Install Toast Library and vee-validate

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Install sonner (toast) and vee-validate**

```bash
cd web
pnpm add vue-sonner vee-validate @vee-validate/zod zod
```

Sonner replaces all `ElMessage` / `ElMessageBox` usage (33 files currently import these). vee-validate is required by Shadcn Vue's Form component.

- [ ] **Step 2: Add Toaster to App.vue**

In `web/src/App.vue`, add `<Toaster />` component from `vue-sonner` inside the template (after `<router-view />`).

- [ ] **Step 3: Commit**

```bash
git add web/package.json web/pnpm-lock.yaml web/src/App.vue
git commit -m "feat: add vue-sonner toast and vee-validate for Shadcn Vue forms"
```

---

## Phase 2: Route Restructuring

### Task 4: Create DramaLayout with Left Sidebar Navigation

**Files:**
- Create: `web/src/views/drama/DramaLayout.vue`
- Modify: `web/src/stores/drama.ts`

- [ ] **Step 1: Extend drama store with `isLoaded` guard**

In `web/src/stores/drama.ts`, add an `isLoaded` computed to avoid redundant loads when navigating between child routes:

```typescript
const isLoaded = computed(() => currentDrama.value !== null && !loading.value)
```

Add to the return object: `isLoaded`.

- [ ] **Step 2: Create DramaLayout.vue**

Create `web/src/views/drama/DramaLayout.vue`:

```vue
<template>
  <div class="drama-layout">
    <aside class="drama-sidebar">
      <div class="drama-sidebar-header">
        <router-link to="/" class="back-link">
          <el-icon><ArrowLeft /></el-icon>
        </router-link>
        <div class="drama-info">
          <h2 class="drama-title">{{ drama?.title }}</h2>
          <span class="drama-meta">{{ drama?.genre }}</span>
        </div>
      </div>
      <nav class="drama-nav">
        <router-link
          v-for="item in navItems"
          :key="item.name"
          :to="item.to"
          class="drama-nav-item"
          active-class="active"
        >
          <el-icon :size="16"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
          <span v-if="item.count !== undefined" class="nav-count">{{ item.count }}</span>
        </router-link>
      </nav>
    </aside>
    <main class="drama-content">
      <router-view v-if="!dramaStore.loading" />
      <div v-else class="loading-state">Loading...</div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, Document, User, Picture, Box, Setting, Grid } from '@element-plus/icons-vue'
import { useDramaStore } from '@/stores/drama'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const dramaStore = useDramaStore()
const { t } = useI18n()

const dramaId = computed(() => String(route.params.id))
const drama = computed(() => dramaStore.currentDrama)

const navItems = computed(() => [
  { name: 'overview', to: `/drama/${dramaId.value}`, icon: Grid, label: t('drama.management.overview') },
  { name: 'episodes', to: `/drama/${dramaId.value}/episodes`, icon: Document, label: t('drama.management.episodes'), count: dramaStore.episodes.length },
  { name: 'characters', to: `/drama/${dramaId.value}/characters`, icon: User, label: t('drama.management.characters'), count: dramaStore.characters.length },
  { name: 'scenes', to: `/drama/${dramaId.value}/scenes`, icon: Picture, label: t('drama.management.sceneList'), count: dramaStore.scenes.length },
  { name: 'props', to: `/drama/${dramaId.value}/props`, icon: Box, label: t('drama.management.propList'), count: dramaStore.props.length },
  { name: 'settings', to: `/drama/${dramaId.value}/settings`, icon: Setting, label: t('drama.management.settings') },
])

onMounted(() => {
  if (!dramaStore.isLoaded || String(dramaStore.dramaId) !== dramaId.value) {
    dramaStore.loadDrama(dramaId.value)
  }
})

watch(dramaId, (newId, oldId) => {
  if (newId !== oldId) {
    dramaStore.loadDrama(newId)
  }
})
</script>

<style scoped>
.drama-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.drama-sidebar {
  width: 200px;
  flex-shrink: 0;
  background: var(--bg-card);
  border-right: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.drama-sidebar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  border-bottom: 1px solid var(--border-primary);
}

.back-link {
  color: var(--text-muted);
  text-decoration: none;
}

.drama-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drama-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.drama-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
}

.drama-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 13px;
  transition: all 150ms;
}

.drama-nav-item:hover {
  background: var(--bg-card-hover);
}

.drama-nav-item.active {
  background: var(--bg-card-hover);
  color: var(--text-primary);
  font-weight: 500;
}

.nav-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-muted);
}

.drama-content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-6);
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
}
</style>
```

Note: This initially uses Element Plus icons — they will be migrated to Lucide in Phase 5.

- [ ] **Step 3: Verify DramaLayout renders**

```bash
cd web && pnpm dev
```

Visit `/drama/1` manually. Verify left sidebar renders with nav items.

- [ ] **Step 4: Commit**

```bash
git add web/src/views/drama/DramaLayout.vue web/src/stores/drama.ts
git commit -m "feat: create DramaLayout with left sidebar navigation"
```

---

### Task 5: Refactor Routes to Nested Structure

**Files:**
- Modify: `web/src/router/index.ts`
- Create: `web/src/views/drama/management/SettingsTab.vue` (placeholder from existing DramaSettings)

- [ ] **Step 1: Create SettingsTab.vue placeholder**

Copy content from `web/src/views/workflow/DramaSettings.vue` into `web/src/views/drama/management/SettingsTab.vue`. If the original is simple, just create a minimal wrapper that imports and re-exports it.

- [ ] **Step 2: Rewrite router/index.ts with nested routes**

Replace `web/src/router/index.ts` with the new nested structure:

```typescript
import type { RouteRecordRaw } from 'vue-router'
import { createRouter, createWebHistory } from 'vue-router'

const routes: RouteRecordRaw[] = [
  // Top-level pages
  {
    path: '/',
    name: 'DramaList',
    component: () => import('../views/drama/DramaList.vue')
  },
  {
    path: '/library',
    name: 'CharacterLibrary',
    component: () => import('../views/library/CharacterLibrary.vue')
  },
  {
    path: '/assets',
    name: 'Assets',
    component: () => import('../views/assets/Assets.vue')
  },

  // Settings
  {
    path: '/settings',
    redirect: '/settings/ai-config'
  },
  {
    path: '/settings/ai-config',
    name: 'AIConfig',
    component: () => import('../views/settings/AIConfig.vue')
  },
  {
    path: '/settings/agent-config',
    name: 'AgentConfig',
    component: () => import('../views/settings/AgentConfig.vue')
  },
  {
    path: '/settings/agent-debug',
    name: 'AgentDebug',
    component: () => import('../views/settings/AgentDebug.vue')
  },

  // Drama CRUD
  {
    path: '/drama/new',
    name: 'DramaCreate',
    component: () => import('../views/drama/DramaCreate.vue')
  },

  // Drama management (nested under DramaLayout)
  {
    path: '/drama/:id',
    component: () => import('../views/drama/DramaLayout.vue'),
    children: [
      {
        path: '',
        name: 'DramaOverview',
        component: () => import('../views/drama/management/OverviewTab.vue')
      },
      {
        path: 'episodes',
        name: 'DramaEpisodes',
        component: () => import('../views/drama/management/EpisodesTab.vue')
      },
      {
        path: 'characters',
        name: 'DramaCharacters',
        component: () => import('../views/drama/management/CharactersTab.vue')
      },
      {
        path: 'scenes',
        name: 'DramaScenes',
        component: () => import('../views/drama/management/ScenesTab.vue')
      },
      {
        path: 'props',
        name: 'DramaProps',
        component: () => import('../views/drama/management/PropsTab.vue')
      },
      {
        path: 'settings',
        name: 'DramaSettings',
        component: () => import('../views/drama/management/SettingsTab.vue')
      }
    ]
  },

  // Episode workbench (fullscreen)
  {
    path: '/drama/:id/episode/:episodeNumber/workbench',
    name: 'EpisodeWorkbench',
    component: () => import('../views/drama/episode/EpisodeWorkbench.vue'),
    meta: { fullscreen: true }
  },

  // Composition workbench (fullscreen)
  {
    path: '/drama/:id/episode/:episodeNumber/compose',
    name: 'CompositionWorkbench',
    component: () => import('@/views/drama/composition/CompositionWorkbench.vue'),
    meta: { fullscreen: true }
  },

  // Backward compatibility redirects
  { path: '/dramas/create', redirect: '/drama/new' },
  { path: '/character-library', redirect: '/library' },
  { path: '/dramas/:id', redirect: to => `/drama/${to.params.id}` },
  { path: '/dramas/:id/episode/:episodeNumber', redirect: to => `/drama/${to.params.id}/episode/${to.params.episodeNumber}/workbench` },
  { path: '/dramas/:dramaId/episode/:episodeNumber/professional', redirect: to => `/drama/${to.params.dramaId}/episode/${to.params.episodeNumber}/workbench` },
  { path: '/dramas/:dramaId/episode/:episodeNumber/composition', redirect: to => `/drama/${to.params.dramaId}/episode/${to.params.episodeNumber}/compose` },

  // 404
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('../views/NotFound.vue'),
    meta: { fullscreen: true }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

router.beforeEach((to) => {
  document.title = to.name ? `${String(to.name)} - Huobao Drama` : 'Huobao Drama'
})

export default router
```

- [ ] **Step 3: Create placeholder EpisodeWorkbench.vue**

Create `web/src/views/drama/episode/EpisodeWorkbench.vue`:

```vue
<template>
  <div class="episode-workbench">
    <h1>Episode Workbench (placeholder)</h1>
    <p>Drama: {{ $route.params.id }}, Episode: {{ $route.params.episodeNumber }}</p>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.episode-workbench {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
}
</style>
```

- [ ] **Step 4: Move CharacterLibrary.vue to library/ directory**

```bash
mkdir -p web/src/views/library
cp web/src/views/character-library/CharacterLibrary.vue web/src/views/library/CharacterLibrary.vue
```

- [ ] **Step 5: Move CompositionWorkbench.vue to composition/ directory**

```bash
mkdir -p web/src/views/drama/composition
cp web/src/views/drama/professional/CompositionWorkbench.vue web/src/views/drama/composition/CompositionWorkbench.vue
```

- [ ] **Step 6: Verify routes work**

```bash
cd web && pnpm dev
```

Test these URLs:
- `/` — DramaList
- `/drama/1` — DramaLayout with Overview
- `/drama/1/episodes` — EpisodesTab
- `/drama/1/characters` — CharactersTab
- `/drama/1/episode/1/workbench` — Placeholder workbench
- `/library` — CharacterLibrary
- `/dramas/1` — should redirect to `/drama/1`

- [ ] **Step 7: Commit**

```bash
git add web/src/router/index.ts web/src/views/drama/episode/ web/src/views/drama/management/SettingsTab.vue web/src/views/library/ web/src/views/drama/composition/
git commit -m "feat: restructure routes to nested layout with DramaLayout"
```

---

### Task 6: Adapt Management Tab Components

**Files:**
- Modify: `web/src/views/drama/management/OverviewTab.vue`
- Modify: `web/src/views/drama/management/EpisodesTab.vue`
- Modify: `web/src/views/drama/management/CharactersTab.vue`
- Modify: `web/src/views/drama/management/ScenesTab.vue`
- Modify: `web/src/views/drama/management/PropsTab.vue`

- [ ] **Step 1: Refactor management tabs to use drama store instead of props**

Each management tab currently receives data via props from DramaManagement.vue. Refactor each to use `useDramaStore()` directly. For example, in `EpisodesTab.vue`:

Replace all prop-based data access with:
```typescript
import { useDramaStore } from '@/stores/drama'
const dramaStore = useDramaStore()
const episodes = computed(() => dramaStore.episodes)
```

Remove the props that were passed from DramaManagement. Replace `$emit` calls with direct store actions or router navigation.

Repeat for each management tab.

- [ ] **Step 2: Verify each tab renders correctly under DramaLayout**

Navigate to each tab under `/drama/:id/` and verify data loads from the store.

- [ ] **Step 3: Commit**

```bash
git add web/src/views/drama/management/
git commit -m "refactor: management tabs use drama store directly instead of props"
```

---

## Phase 3: EpisodeWorkbench

> **Important:** All new components in this phase should use Shadcn Vue components (from `@/components/ui/`) directly — NOT Element Plus. Shadcn is already installed from Phase 1. Use Lucide icons. This avoids double-migration.

### Task 7: Create Workbench Composables

**Files:**
- Create: `web/src/composables/useResourcePanel.ts`
- Create: `web/src/composables/useStoryboardGrid.ts`
- Create: `web/src/composables/useEpisodeWorkbench.ts`

- [ ] **Step 1: Create useResourcePanel composable**

Create `web/src/composables/useResourcePanel.ts`.

**Important:** The drama API (`web/src/api/drama.ts`) does NOT have `getEpisode()` or `saveScript()` methods. Use the actual API surface:
- `dramaAPI.get(id)` returns Drama with nested episodes, characters, scenes
- `dramaAPI.getStoryboards(episodeId)` returns storyboards for an episode
- `dramaAPI.getCharacters(dramaId)` returns characters
- `dramaAPI.getBackgrounds(episodeId)` returns scenes/backgrounds
- `dramaAPI.saveEpisodes(dramaId, episodes)` saves episode data
- Episode script content is on `episode.script_content` field

```typescript
import { ref, computed } from 'vue'
import { dramaAPI } from '@/api/drama'
import type { Drama, Episode, Character, Scene, Storyboard } from '@/types/drama'

export type PipelineStage = 'script' | 'extracted' | 'storyboards'

export function useResourcePanel(dramaId: number, episodeNumber: number) {
  const drama = ref<Drama | null>(null)
  const episode = ref<Episode | null>(null)
  const characters = ref<Character[]>([])
  const scenes = ref<Scene[]>([])
  const storyboards = ref<Storyboard[]>([])
  const loading = ref(false)

  const expandedBlock = ref<'script' | 'characters' | 'scenes' | null>('script')

  const scriptContent = computed(() => episode.value?.script_content || '')
  const hasScript = computed(() => !!scriptContent.value)
  const hasCharacters = computed(() => characters.value.length > 0)
  const hasScenes = computed(() => scenes.value.length > 0)

  const pipelineStage = computed<PipelineStage>(() => {
    if (storyboards.value.length > 0) return 'storyboards'
    if (hasCharacters.value || hasScenes.value) return 'extracted'
    return 'script'
  })

  function toggleBlock(block: 'script' | 'characters' | 'scenes') {
    expandedBlock.value = expandedBlock.value === block ? null : block
  }

  async function loadData() {
    loading.value = true
    try {
      drama.value = await dramaAPI.get(String(dramaId))
      const ep = drama.value.episodes?.find(e => e.episode_number === episodeNumber)
      if (ep) {
        episode.value = ep
        characters.value = drama.value.characters || []
        scenes.value = drama.value.scenes || []
        // Load storyboards for this episode
        storyboards.value = await dramaAPI.getStoryboards(String(ep.id))
      }
    } finally {
      loading.value = false
    }
  }

  async function saveScript(content: string) {
    if (!episode.value) return
    // Update episode script via saveEpisodes
    episode.value.script_content = content
    await dramaAPI.saveEpisodes(String(dramaId), [
      { id: episode.value.id, script_content: content }
    ])
  }

  return {
    drama, episode, characters, scenes, storyboards, loading,
    expandedBlock, scriptContent, hasScript, hasCharacters, hasScenes,
    pipelineStage, toggleBlock, loadData, saveScript,
  }
}
```

- [ ] **Step 2: Create useStoryboardGrid composable**

Create `web/src/composables/useStoryboardGrid.ts`:

```typescript
import { ref, computed } from 'vue'
import type { Storyboard } from '@/types/drama'

export type ViewMode = 'grid' | 'edit'

export interface StoryboardStatus {
  hasImage: boolean
  hasVideo: boolean
  isGenerating: boolean
}

export function useStoryboardGrid(storyboards: () => Storyboard[]) {
  const viewMode = ref<ViewMode>('grid')
  const selectedStoryboardId = ref<string | null>(null)
  const selectedIds = ref<Set<number>>(new Set())

  const currentStoryboard = computed(() => {
    if (!selectedStoryboardId.value) return null
    return storyboards().find(s => String(s.id) === selectedStoryboardId.value) || null
  })

  const progress = computed(() => {
    const all = storyboards()
    const withImage = all.filter(s => s.image_url).length
    const withVideo = all.filter(s => (s as any).videos?.length > 0).length
    return { total: all.length, withImage, withVideo }
  })

  function selectStoryboard(id: string) {
    selectedStoryboardId.value = id
    viewMode.value = 'edit'
  }

  function backToGrid() {
    viewMode.value = 'grid'
  }

  function selectPrev() {
    const all = storyboards()
    const idx = all.findIndex(s => String(s.id) === selectedStoryboardId.value)
    if (idx > 0) selectedStoryboardId.value = String(all[idx - 1].id)
  }

  function selectNext() {
    const all = storyboards()
    const idx = all.findIndex(s => String(s.id) === selectedStoryboardId.value)
    if (idx >= 0 && idx < all.length - 1) selectedStoryboardId.value = String(all[idx + 1].id)
  }

  function toggleSelection(id: number) {
    if (selectedIds.value.has(id)) {
      selectedIds.value.delete(id)
    } else {
      selectedIds.value.add(id)
    }
  }

  return {
    viewMode,
    selectedStoryboardId,
    selectedIds,
    currentStoryboard,
    progress,
    selectStoryboard,
    backToGrid,
    selectPrev,
    selectNext,
    toggleSelection,
  }
}
```

- [ ] **Step 3: Create useEpisodeWorkbench orchestrator**

Create `web/src/composables/useEpisodeWorkbench.ts`.

**Important notes:**
- `useProfessionalEditor()` reads `route.params.dramaId` internally (old route pattern). It MUST be refactored to accept `dramaId` and `episodeNumber` as parameters, since the new route uses `route.params.id` (not `dramaId`).
- `useVideoGenerationPro()` expects `Ref<Storyboard | null>` for currentStoryboard, `Ref<number>` for episodeId, and `Ref<Storyboard[]>` for storyboards — not plain values or getter functions. Wrap accordingly.
- `useFrameImageGeneration()` expects `Ref<Storyboard | null>` for currentStoryboard and a number for dramaId.

```typescript
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useResourcePanel } from './useResourcePanel'
import { useStoryboardGrid } from './useStoryboardGrid'
import { useFrameImageGeneration } from './useFrameImageGeneration'
import { useVideoGenerationPro } from './useVideoGenerationPro'

export function useEpisodeWorkbench() {
  const route = useRoute()
  const dramaId = Number(route.params.id)
  const episodeNumber = Number(route.params.episodeNumber)

  const resource = useResourcePanel(dramaId, episodeNumber)
  const grid = useStoryboardGrid(() => resource.storyboards.value)

  // imageGen expects Ref<Storyboard | null> — grid.currentStoryboard is already a computed ref
  const imageGen = useFrameImageGeneration(grid.currentStoryboard, dramaId)

  // videoGen expects Ref types — create ref wrappers
  const episodeIdRef = computed(() => resource.episode.value?.id || 0)
  const timelineEditorRef = ref(null)

  const videoGen = useVideoGenerationPro(
    grid.currentStoryboard,            // Ref<Storyboard | null>
    dramaId,                            // number
    episodeIdRef,                       // Ref<number>
    resource.storyboards,               // Ref<Storyboard[]>
    imageGen.videoReferenceImages,
    timelineEditorRef,
  )

  onMounted(async () => {
    await resource.loadData()
    await videoGen.loadVideoModels()
  })

  onBeforeUnmount(() => {
    imageGen.stopPolling()
    videoGen.stopVideoPolling()
  })

  return {
    dramaId,
    episodeNumber,
    resource,
    grid,
    imageGen,
    videoGen,
  }
}
```

**Pre-requisite:** Before using this composable, refactor `useProfessionalEditor.ts` to accept `(dramaId: number, episodeNumber: number)` as parameters instead of reading from `route.params.dramaId`. This is part of Task 7 Step 3.

- [ ] **Step 4: Commit**

```bash
git add web/src/composables/useResourcePanel.ts web/src/composables/useStoryboardGrid.ts web/src/composables/useEpisodeWorkbench.ts
git commit -m "feat: create workbench composables (resource panel, storyboard grid, orchestrator)"
```

---

### Task 8: Build ResourcePanel Components

**Files:**
- Create: `web/src/views/drama/episode/workbench/ResourcePanel.vue`
- Create: `web/src/views/drama/episode/workbench/ScriptBlock.vue`
- Create: `web/src/views/drama/episode/workbench/CharacterBlock.vue`
- Create: `web/src/views/drama/episode/workbench/SceneBlock.vue`

- [ ] **Step 1: Create ScriptBlock.vue**

Left panel script section with collapsed/expanded states. When collapsed: icon + "剧本" + word count. When expanded: editable textarea + action buttons.

Reference `views/drama/workflow/ScriptStep.vue` for existing script logic (save, upload, agent rewrite).

- [ ] **Step 2: Create CharacterBlock.vue**

Character list with avatar, name, role. Collapsed: icon + count. Expanded: scrollable list with generation status per character. "Batch generate" button.

Reference `views/drama/management/CharactersTab.vue` for existing character rendering.

- [ ] **Step 3: Create SceneBlock.vue**

Scene list with thumbnail, location, time. Same collapsed/expanded pattern as CharacterBlock.

Reference `views/drama/management/ScenesTab.vue` for existing scene rendering.

- [ ] **Step 4: Create ResourcePanel.vue**

Container that stacks the three blocks vertically. Uses `useResourcePanel` composable. Manages block expand/collapse. Disabled/grayed-out blocks when no content yet.

```vue
<template>
  <aside class="resource-panel">
    <ScriptBlock
      :script-content="resource.scriptContent.value"
      :expanded="resource.expandedBlock.value === 'script'"
      :has-content="resource.hasScript.value"
      @toggle="resource.toggleBlock('script')"
      @save="resource.saveScript"
    />
    <CharacterBlock
      :characters="resource.characters.value"
      :expanded="resource.expandedBlock.value === 'characters'"
      :has-content="resource.hasCharacters.value"
      @toggle="resource.toggleBlock('characters')"
    />
    <SceneBlock
      :scenes="resource.scenes.value"
      :expanded="resource.expandedBlock.value === 'scenes'"
      :has-content="resource.hasScenes.value"
      @toggle="resource.toggleBlock('scenes')"
    />
  </aside>
</template>
```

- [ ] **Step 5: Commit**

```bash
git add web/src/views/drama/episode/workbench/
git commit -m "feat: build ResourcePanel with script, character, and scene blocks"
```

---

### Task 9: Build StoryboardGrid and StoryboardCard

**Files:**
- Create: `web/src/views/drama/episode/workbench/StoryboardGrid.vue`
- Create: `web/src/views/drama/episode/workbench/StoryboardCard.vue`

- [ ] **Step 1: Create StoryboardCard.vue**

Individual card showing: thumbnail area (image or placeholder), storyboard number, title, shot type + movement, border color by status (gray/blue/amber/green). Click emits `select`.

Reference existing card rendering in `views/drama/professional/StoryboardList.vue`.

- [ ] **Step 2: Create StoryboardGrid.vue**

5-column CSS grid of StoryboardCards. Toolbar with status summary badges + batch action buttons (add, batch generate images, batch generate videos). Empty state when no storyboards.

- [ ] **Step 3: Commit**

```bash
git add web/src/views/drama/episode/workbench/StoryboardGrid.vue web/src/views/drama/episode/workbench/StoryboardCard.vue
git commit -m "feat: build StoryboardGrid and StoryboardCard components"
```

---

### Task 10: Build StoryboardEditor (Edit Mode)

**Files:**
- Create: `web/src/views/drama/episode/workbench/StoryboardEditor.vue`
- Create: `web/src/views/drama/episode/workbench/StoryboardStrip.vue`
- Create: `web/src/views/drama/episode/workbench/PreviewPane.vue`
- Create: `web/src/views/drama/episode/workbench/PropertiesPanel.vue`

- [ ] **Step 1: Create StoryboardStrip.vue**

Vertical thumbnail strip (left side of edit mode). Shows small preview cards for all storyboards, highlights current one. Click switches selection.

Reference `views/drama/professional/StoryboardList.vue` for existing strip layout.

- [ ] **Step 2: Create PreviewPane.vue**

Center preview area. Shows current storyboard's image (or video if available). Image gallery row below for multiple generated images. "Generate" button overlay when no image.

Reference `views/drama/professional/PreviewPane.vue` for existing preview logic.

- [ ] **Step 3: Create PropertiesPanel.vue**

Right properties panel. Tabs: Properties | Generation. Properties tab: scene selector, character tags, prop tags, shot type/angle/movement dropdowns, description, dialogue, image prompt, video prompt. Generation tab: generate image button, generate video button with model selector.

Reference `views/drama/professional/SceneEditorPanel.vue` and `GenerationTab.vue` for existing form fields and generation logic.

- [ ] **Step 4: Create StoryboardEditor.vue**

Combines strip + preview + properties in a flex layout. "Back to grid" button. Navigation (prev/next storyboard).

```vue
<template>
  <div class="storyboard-editor">
    <StoryboardStrip ... />
    <PreviewPane ... />
    <PropertiesPanel ... />
  </div>
</template>
```

- [ ] **Step 5: Commit**

```bash
git add web/src/views/drama/episode/workbench/
git commit -m "feat: build StoryboardEditor with strip, preview, and properties panel"
```

---

### Task 11: Assemble EpisodeWorkbench

**Files:**
- Modify: `web/src/views/drama/episode/EpisodeWorkbench.vue`

- [ ] **Step 1: Replace placeholder with full workbench**

Wire together ResourcePanel + StoryboardGrid/StoryboardEditor using useEpisodeWorkbench composable. Top bar with back button, title, progress bar, Agent button (disabled for now), compose button.

Progressive stages:
- `pipelineStage === 'script'`: ResourcePanel expanded + right side empty state
- `pipelineStage === 'extracted'`: ResourcePanel with data + right side "拆解分镜" prompt
- `pipelineStage === 'storyboards'` + `viewMode === 'grid'`: ResourcePanel compact + StoryboardGrid
- `pipelineStage === 'storyboards'` + `viewMode === 'edit'`: ResourcePanel compact + StoryboardEditor

- [ ] **Step 2: Test the full workbench flow**

```bash
cd web && pnpm dev
```

Navigate to `/drama/:id/episode/:num/workbench`. Verify:
- Resource panel shows on the left
- Script block expands/collapses
- If episode has storyboards, grid renders
- Clicking a card switches to edit mode
- Back to grid works

- [ ] **Step 3: Commit**

```bash
git add web/src/views/drama/episode/EpisodeWorkbench.vue
git commit -m "feat: assemble EpisodeWorkbench with progressive panel layout"
```

---

## Phase 4: Agent Integration

### Task 12: Create Agent Types and API

**Files:**
- Create: `web/src/types/agent.ts`
- Create: `web/src/api/agent.ts`

- [ ] **Step 1: Create types/agent.ts**

```typescript
export interface AgentChatRequest {
  message: string
  drama_id?: number
  episode_id?: number
}

export interface AgentSSEEvent {
  type: 'tool_call' | 'tool_result' | 'content' | 'done' | 'error'
  data: string
  tool_name?: string
}

export type AgentType =
  | 'script_rewriter'
  | 'style_analyzer'
  | 'extractor'
  | 'voice_assigner'
  | 'storyboard_breaker'
  | 'prompt_generator'
```

- [ ] **Step 2: Create api/agent.ts with fetch + ReadableStream SSE**

```typescript
import type { AgentChatRequest, AgentSSEEvent } from '@/types/agent'

const BASE = import.meta.env.VITE_API_PREFIX || '/api/v1'

export const agentAPI = {
  async *streamChat(agentType: string, data: AgentChatRequest): AsyncGenerator<AgentSSEEvent> {
    const response = await fetch(`${BASE}/agent/${agentType}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!response.ok) throw new Error(`Agent request failed: ${response.status}`)
    if (!response.body) throw new Error('No response body')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event: AgentSSEEvent = JSON.parse(line.slice(6))
            yield event
          } catch {
            // skip malformed lines
          }
        }
      }
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/types/agent.ts web/src/api/agent.ts
git commit -m "feat: create agent types and SSE streaming API client"
```

---

### Task 13: Create Agent Chat Composable and Components

**Files:**
- Create: `web/src/composables/useAgentChat.ts`
- Create: `web/src/components/agent/AgentDrawer.vue`
- Create: `web/src/components/agent/AgentChat.vue`
- Create: `web/src/components/agent/AgentTypeSwitcher.vue`
- Create: `web/src/components/agent/AgentResultAction.vue`

- [ ] **Step 1: Create useAgentChat composable**

Manages: current agent type, message history, streaming state, context injection. Uses `agentAPI.streamChat()` async generator.

- [ ] **Step 2: Create AgentTypeSwitcher.vue**

Dropdown/segmented control to switch between agent types. Labels from i18n.

- [ ] **Step 3: Create AgentChat.vue**

Chat message list + input area. Shows streaming content with typing indicator. Tool call/result events shown as collapsible sections. "Apply" button on content messages.

- [ ] **Step 4: Create AgentResultAction.vue**

"Apply" button component. Emits result data to parent for applying to workbench fields.

- [ ] **Step 5: Create AgentDrawer.vue**

Uses Shadcn Sheet component. Slides from right, ~400px wide. Contains AgentTypeSwitcher + AgentChat.

```vue
<template>
  <Sheet v-model:open="modelValue">
    <SheetContent side="right" class="agent-drawer">
      <SheetHeader>
        <SheetTitle>AI Agent</SheetTitle>
        <AgentTypeSwitcher v-model="agentType" />
      </SheetHeader>
      <AgentChat
        :agent-type="agentType"
        :drama-id="dramaId"
        :episode-id="episodeId"
        @apply="$emit('apply', $event)"
      />
    </SheetContent>
  </Sheet>
</template>
```

- [ ] **Step 6: Wire AgentDrawer into EpisodeWorkbench**

Add Agent button to top bar. Toggle drawer open/close. Handle `@apply` events to write agent results into workbench state.

- [ ] **Step 7: Commit**

```bash
git add web/src/composables/useAgentChat.ts web/src/components/agent/
git commit -m "feat: build Agent drawer with SSE chat and result application"
```

---

## Phase 5: Component Migration (Element Plus → Shadcn Vue)

### Task 14: Migrate Common Components

**Files:**
- Modify: All files in `web/src/components/common/`
- Modify: `web/src/components/layout/AppSidebar.vue`
- Modify: `web/src/components/layout/SidebarItem.vue`

- [ ] **Step 1: Replace Element Plus icons with Lucide in layout components**

In `AppSidebar.vue` and `SidebarItem.vue`:
- Replace `import { Film, FolderOpened, ... } from '@element-plus/icons-vue'` with `import { Film, FolderOpen, ... } from 'lucide-vue-next'`
- Replace `<el-icon :size="24"><Film /></el-icon>` with `<Film :size="24" />`

**Element Plus → Lucide icon name mapping:**
| Element Plus | Lucide |
|---|---|
| `ArrowLeft` | `ArrowLeft` |
| `ArrowRight` | `ArrowRight` |
| `Document` | `FileText` |
| `FolderOpened` | `FolderOpen` |
| `User` | `User` |
| `Picture` | `Image` |
| `Box` | `Package` |
| `Setting` | `Settings` |
| `Film` | `Film` |
| `Grid` | `LayoutGrid` |
| `MagicStick` | `Wand2` |
| `VideoCamera` | `Video` |
| `DArrowLeft` | `ChevronsLeft` |
| `DArrowRight` | `ChevronsRight` |
| `Plus` | `Plus` |
| `Delete` | `Trash2` |
| `Edit` | `Pencil` |
| `Search` | `Search` |
| `Upload` | `Upload` |
| `Download` | `Download` |
| `Close` | `X` |
| `Check` | `Check` |
| `Warning` | `AlertTriangle` |
| `InfoFilled` | `Info` |

- [ ] **Step 2: Replace all ElMessage/ElMessageBox with vue-sonner toast**

33 files import `ElMessage` or `ElMessageBox` from Element Plus. These MUST be replaced before Element Plus removal. Key files:
- `web/src/utils/request.ts` (Axios interceptor uses `ElMessage.error`)
- All composables: `useProfessionalEditor.ts`, `useFrameImageGeneration.ts`, `useVideoGenerationPro.ts`, `useVideoMerge.ts`
- All dialog/view components

Replace pattern:
```typescript
// Before
import { ElMessage } from 'element-plus'
ElMessage.success('Done')
ElMessage.error('Failed')

// After
import { toast } from 'vue-sonner'
toast.success('Done')
toast.error('Failed')
```

For `ElMessageBox.confirm()`, replace with a custom confirm dialog using Shadcn `AlertDialog`, or use `window.confirm()` for simple cases.

- [ ] **Step 3: Migrate common components one by one**

For each file in `components/common/`, replace `el-*` components with Shadcn equivalents:
- `el-button` → `<Button>` from `@/components/ui/button`
- `el-dialog` → `<Dialog>` from `@/components/ui/dialog`
- `el-input` → `<Input>` from `@/components/ui/input`
- etc.

- [ ] **Step 3: Verify app still renders after each batch of migrations**

```bash
cd web && pnpm build:check
```

- [ ] **Step 4: Commit after each logical batch**

```bash
git commit -m "refactor: migrate common components from Element Plus to Shadcn Vue"
```

---

### Task 15: Migrate Remaining Views

**Files:**
- Modify: `web/src/views/drama/DramaList.vue`
- Modify: `web/src/views/drama/DramaCreate.vue`
- Modify: `web/src/views/drama/DramaLayout.vue`
- Modify: All management tabs
- Modify: `web/src/views/library/CharacterLibrary.vue`
- Modify: `web/src/views/assets/Assets.vue`
- Modify: `web/src/views/settings/AIConfig.vue`

- [ ] **Step 1: Migrate each view file, replacing all el-* with Shadcn + Lucide**

Work through each view. Common patterns:
- `<el-button type="primary">` → `<Button variant="default">`
- `<el-button type="danger">` → `<Button variant="destructive">`
- `<el-button text>` → `<Button variant="ghost">`
- `<el-tabs v-model="tab">` → `<Tabs v-model="tab">`
- `<el-dialog v-model="show">` → `<Dialog v-model:open="show">`
- `<el-tag>` → `<Badge>`
- `<el-icon><IconName /></el-icon>` → `<IconName :size="16" />`

- [ ] **Step 2: Build check after all migrations**

```bash
cd web && pnpm build:check
```

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor: migrate all views from Element Plus to Shadcn Vue"
```

---

### Task 16: Remove Element Plus

**Files:**
- Modify: `web/src/main.ts`
- Modify: `web/package.json`
- Delete: `web/src/assets/styles/element/index.scss`
- Modify: `web/vite.config.ts`

- [ ] **Step 1: Remove Element Plus from main.ts**

Remove these lines from `web/src/main.ts`:
```typescript
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import './assets/styles/element/index.scss'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
// ...
app.use(ElementPlus)
// ...
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
```

- [ ] **Step 2: Remove Element Plus chunk from vite.config.ts**

Remove from `manualChunks`:
```typescript
'element-plus': ['element-plus', '@element-plus/icons-vue'],
```

- [ ] **Step 3: Uninstall packages**

```bash
cd web
pnpm remove element-plus @element-plus/icons-vue
```

- [ ] **Step 4: Delete Element Plus SCSS overrides**

```bash
rm -rf web/src/assets/styles/element/
```

- [ ] **Step 5: Verify build**

```bash
cd web && pnpm build:check
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: remove Element Plus — fully replaced by Shadcn Vue"
```

---

## Phase 6: Cleanup

### Task 17: Remove Old Files and Directories

**Files:**
- Delete: `web/src/views/drama/EpisodeWorkflow.vue`
- Delete: `web/src/views/drama/ProfessionalEditor.vue`
- Delete: `web/src/views/drama/professional/` (entire directory)
- Delete: `web/src/views/drama/DramaManagement.vue`
- Delete: `web/src/views/drama/workflow/`
- Delete: `web/src/views/workflow/`
- Delete: `web/src/views/script/`
- Delete: `web/src/views/storyboard/`
- Delete: `web/src/views/generation/`
- Delete: `web/src/views/editor/`
- Delete: `web/src/views/character-library/` (moved to library/)
- Delete: `web/src/views/dashboard/` (if exists)

- [ ] **Step 1: Remove old view files**

```bash
rm web/src/views/drama/EpisodeWorkflow.vue
rm web/src/views/drama/ProfessionalEditor.vue
rm -rf web/src/views/drama/professional/
rm web/src/views/drama/DramaManagement.vue
rm -rf web/src/views/drama/workflow/
rm -rf web/src/views/workflow/
rm -rf web/src/views/script/
rm -rf web/src/views/storyboard/
rm -rf web/src/views/generation/
rm -rf web/src/views/editor/
rm -rf web/src/views/character-library/
rm -rf web/src/views/dashboard/
```

- [ ] **Step 2: Verify no broken imports**

```bash
cd web && pnpm build:check
```

Fix any broken imports that reference deleted files.

- [ ] **Step 3: Update i18n keys**

Review `web/src/locales/zh-CN.ts` and `en-US.ts`. Remove keys that are only used by deleted components. Add any new keys needed by workbench components.

- [ ] **Step 4: Final lint**

```bash
cd web && pnpm lint:fix
```

- [ ] **Step 5: Final build verification**

```bash
cd web && pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove old views, clean up i18n keys, final build verified"
```
