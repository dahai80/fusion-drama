import { fileURLToPath } from 'node:url'

// fusion-drama#16 gap 3: under the union-web shell the app is mounted at
// /shell/fusion-drama/, so the build must emit assets and routes under that
// base path (Nuxt app.baseURL). Standalone serving keeps "/" — the base is
// opt-in via FUSION_SHELL_BASE (e.g. FUSION_SHELL_BASE=/shell/fusion-drama/),
// same pattern as fusion-site's NEXT_PUBLIC_BASE_PATH shell build.
const shellBase = process.env.FUSION_SHELL_BASE || '/'
const withBase = (p: string) => (shellBase === '/' ? p : `${shellBase.replace(/\/$/, '')}${p}`)

export default defineNuxtConfig({
  srcDir: 'app/',
  ssr: false,
  devtools: { enabled: false },
  experimental: {
    appManifest: false,
  },
  hooks: {
    // Dynamic route pages are registered manually under app/views/ to avoid [id] brackets
    // in file paths (bracketed paths need escaping in git/shell and break some deploy
    // environments). URLs stay unchanged.
    'pages:extend'(pages) {
      pages.push(
        {
          name: 'drama-detail',
          path: '/drama/:id',
          file: fileURLToPath(new URL('./app/views/drama/detail.vue', import.meta.url)),
        },
        {
          name: 'drama-episode',
          path: '/drama/:id/episode/:episodeNumber',
          file: fileURLToPath(new URL('./app/views/drama/episode.vue', import.meta.url)),
        },
      )
    },
  },
  app: {
    baseURL: shellBase,
    head: {
      // i18n: user-facing
      title: 'Fuse 短剧',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: withBase('/favicon.png') },
        { rel: 'shortcut icon', type: 'image/png', href: withBase('/favicon.png') },
        { rel: 'apple-touch-icon', sizes: '180x180', href: withBase('/apple-touch-icon.png') },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: withBase('/icon-192.png') },
        { rel: 'icon', type: 'image/png', sizes: '512x512', href: withBase('/icon-512.png') },
      ],
    },
  },
  vite: {
    server: {
      proxy: {
        '/api': { target: 'http://localhost:5679', changeOrigin: true },
        '/static': { target: 'http://localhost:5679', changeOrigin: true },
      },
    },
  },
  compatibilityDate: '2025-05-15',
})
