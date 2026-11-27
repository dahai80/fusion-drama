/**
 * Unified language switching: UI language = AI content language, one switch.
 *
 * Both entry points (top-bar LocaleSwitcher / settings general tab) go through
 * confirmUnifiedLanguage:
 * 1. show a standalone confirm dialog (mounted on body, explaining the impact: UI + AI
 *    content + refresh)
 * 2. after confirmation: write backend content_language → switch the vue-i18n locale →
 *    brief toast → location.reload() (a full page reload rebuilds every component cleanly,
 *    avoiding ordering issues in deeply nested components that rely on watch)
 */
import { createApp, h, ref } from 'vue'
import { i18n, setUiLocale, type UiLocale } from '~/composables/i18n'
import { settingsAPI } from '~/composables/useApi'
import LanguageSwitchDialog from '~/components/LanguageSwitchDialog.vue'

let pending: { resolve: (ok: boolean) => void } | null = null

/** Show the confirm dialog; resolve(true) = the user confirmed the switch */
function confirmDialog(lang: UiLocale): Promise<boolean> {
  return new Promise((resolve) => {
    const langNameKeys = { zh: 'langNameZh', en: 'langNameEn', ja: 'langNameJa', ko: 'langNameKo' }
    const nameKey = `settings.general.${langNameKeys[lang] || 'langNameZh'}`
    const title = i18n.global.t('components.langSwitch.title', { lang: i18n.global.t(nameKey) })
    const message = i18n.global.t('components.langSwitch.message')

    const open = ref(true)
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({
      setup: () => () => h(LanguageSwitchDialog, {
        open: open.value,
        title,
        message,
        onConfirm: () => { open.value = false; pending?.resolve(true); pending = null },
        onCancel: () => { open.value = false; pending?.resolve(false); pending = null },
      }),
    })
    app.use(i18n as unknown as Parameters<typeof app.use>[0])
    app.mount(host)

    pending = {
      resolve: (ok) => {
        app.unmount()
        host.remove()
        resolve(ok)
      },
    }
  })
}

let switching = false

/** Entry point: confirm dialog first, then perform the unified switch and refresh */
export async function confirmUnifiedLanguage(lang: UiLocale) {
  if (switching || pending) return
  const ok = await confirmDialog(lang)
  if (!ok) return
  switching = true
  try {
    await settingsAPI.setContentLanguage(lang)
  } catch { /* a backend failure does not block the UI switch */ }
  setUiLocale(lang)
  try {
    const { toast } = await import('vue-sonner')
    toast.info(i18n.global.t('components.langSwitch.refreshing'), { duration: 1200 })
  } catch { /* toast failure does not block */ }
  setTimeout(() => location.reload(), 1000)
}
