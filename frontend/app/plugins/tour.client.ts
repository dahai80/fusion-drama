/**
 * Prefetch the "tours already seen" marker at startup (stored server-side in app_settings).
 * Not awaited: autoTour fires a few hundred ms after each page's onMounted, by which time
 * hydration is long done; on failure useTour automatically falls back to localStorage.
 */
import { hydrateTours } from '~/composables/useTour'

export default defineNuxtPlugin(() => {
  void hydrateTours()
})
