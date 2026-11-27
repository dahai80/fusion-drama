/**
 * i18n instance (module-level singleton)
 * - The instance lives in its own module rather than inside a plugin: code running outside
 *   setup (useAgent/useMigrateState etc.) needs `import { i18n }` and i18n.global.t directly
 * - ssr:false, so reading localStorage at module top level is safe; the UI language preference
 *   persists under the fusion:locale key
 * - legacy:false must be explicit, otherwise global.locale is not a ref and cannot switch at runtime
 */
import { createI18n } from 'vue-i18n'
import zh from '../locales/zh.json'
import en from '../locales/en.json'
import ja from '../locales/ja.json'
import ko from '../locales/ko.json'

export const LOCALE_STORAGE_KEY = 'fusion:locale'

export type UiLocale = 'zh' | 'en' | 'ja' | 'ko'

export const UI_LOCALES: Array<{ value: UiLocale; label: string }> = [
  // i18n: user-facing (native language labels shown in the locale switcher)
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
  // i18n: user-facing (native language labels shown in the locale switcher)
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
]

export function readStoredLocale(): UiLocale {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (v && UI_LOCALES.some(l => l.value === v)) return v as UiLocale
  } catch { /* fall back to the default when localStorage is unavailable */ }
  return 'zh'
}

export function persistLocale(locale: UiLocale) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch { /* ignore persistence failure */ }
}

export const i18n = createI18n({
  legacy: false,
  locale: readStoredLocale(),
  fallbackLocale: 'zh',
  messages: { zh, en, ja, ko },
  missingWarn: false,
  fallbackWarn: false,
})

/** Switches the UI language and persists it (shared by LocaleSwitcher and initialization) */
export function setUiLocale(locale: UiLocale) {
  i18n.global.locale.value = locale
  persistLocale(locale)
}
