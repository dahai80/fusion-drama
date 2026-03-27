import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('@/views/DramaList.vue'),
    },
    {
      path: '/drama/:id',
      component: () => import('@/views/DramaDetail.vue'),
    },
    {
      path: '/drama/:id/episode/:episodeNumber/workbench',
      component: () => import('@/views/Workbench.vue'),
    },
    {
      path: '/settings',
      component: () => import('@/views/Settings.vue'),
    },
  ],
})
