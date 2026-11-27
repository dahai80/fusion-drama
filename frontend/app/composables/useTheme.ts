/**
 * Theme mode (module-level singleton)
 * - isomorphic with i18n.ts: ssr:false, safe to read localStorage at module top level
 * - synchronously writes <html data-theme> at module top level, before the first frame,
 *   avoiding dark/light flicker (app.vue onMounted won't work — it runs after the first
 *   frame, which always flickers)
 * - follow system: matchMedia('(prefers-color-scheme: dark)'), works on both web and desktop
 *   (Electron defaults nativeTheme.themeSource='system'), no desktop bridge needed
 */
import { computed, readonly, ref, watch, type ComputedRef } from 'vue'

export const THEME_STORAGE_KEY = 'fusion:theme'

export type ThemeMode = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system']

export function readStoredThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v && (THEME_MODES as string[]).includes(v)) return v as ThemeMode
  } catch { /* fall back to the default when localStorage is unavailable */ }
  return 'system'
}

export function persistThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch { /* ignore persistence failure */ }
}

const themeMode = ref<ThemeMode>(readStoredThemeMode())
const systemDark = ref(false)

export const resolvedTheme: ComputedRef<ResolvedTheme> = computed(() =>
  themeMode.value === 'system' ? (systemDark.value ? 'dark' : 'light') : themeMode.value,
)

function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme.value
}

if (typeof window !== 'undefined') {
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = mql.matches
  applyTheme()
  mql.addEventListener('change', (e) => {
    systemDark.value = e.matches
    applyTheme()
  })
  watch(themeMode, applyTheme)
}

/** Set the theme mode and persist it (shared by the settings appearance card and ThemeToggle) */
export function setThemeMode(mode: ThemeMode) {
  themeMode.value = mode
  persistThemeMode(mode)
}

/** light → dark → system cycle (used by the header quick-toggle button) */
export function cycleThemeMode() {
  const i = THEME_MODES.indexOf(themeMode.value)
  setThemeMode(THEME_MODES[(i + 1) % THEME_MODES.length])
}

export function useTheme() {
  return {
    themeMode: readonly(themeMode),
    resolvedTheme,
    setThemeMode,
    cycleThemeMode,
  }
}
