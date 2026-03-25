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
        name: 'DramaSettingsPage',
        component: () => import('../views/drama/management/SettingsTab.vue')
      }
    ]
  },

  // Episode workbench (fullscreen, outside DramaLayout)
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
    component: () => import('../views/drama/composition/CompositionWorkbench.vue'),
    meta: { fullscreen: true }
  },

  // Backward compatibility redirects
  { path: '/dramas/create', redirect: '/drama/new' },
  { path: '/character-library', redirect: '/library' },
  { path: '/dramas/:id', redirect: to => `/drama/${to.params.id}` },
  { path: '/dramas/:id/episode/:episodeNumber', redirect: to => `/drama/${to.params.id}/episode/${to.params.episodeNumber}/workbench` },
  { path: '/dramas/:dramaId/episode/:episodeNumber/professional', redirect: to => `/drama/${to.params.dramaId}/episode/${to.params.episodeNumber}/workbench` },
  { path: '/dramas/:dramaId/episode/:episodeNumber/composition', redirect: to => `/drama/${to.params.dramaId}/episode/${to.params.episodeNumber}/compose` },

  // Keep old routes temporarily (will be removed in Phase 6)
  {
    path: '/dramas/:id/characters',
    name: 'CharacterExtraction',
    component: () => import('../views/workflow/CharacterExtraction.vue')
  },
  {
    path: '/dramas/:id/images/characters',
    name: 'CharacterImages',
    component: () => import('../views/workflow/CharacterImages.vue')
  },
  {
    path: '/episodes/:id/edit',
    name: 'ScriptEdit',
    component: () => import('../views/script/ScriptEdit.vue')
  },
  {
    path: '/episodes/:id/storyboard',
    name: 'StoryboardEdit',
    component: () => import('../views/storyboard/StoryboardEdit.vue')
  },
  {
    path: '/episodes/:id/generate',
    name: 'Generation',
    component: () => import('../views/generation/ImageGeneration.vue')
  },
  {
    path: '/timeline/:id',
    name: 'TimelineEditor',
    component: () => import('../views/editor/TimelineEditor.vue')
  },

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

// 开源版本 - 无需认证

router.beforeEach((to) => {
  document.title = to.name ? `${String(to.name)} - Huobao Drama` : 'Huobao Drama'
})

export default router
