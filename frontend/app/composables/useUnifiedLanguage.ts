/**
 * 统一语言切换：UI 语言 = AI 内容语言，同一个开关。
 *
 * 两处入口（顶栏 LocaleSwitcher / 设置页通用 tab）都走 confirmUnifiedLanguage：
 * 1. 弹独立确认弹窗（挂 body，说明影响：界面 + AI 内容 + 刷新）
 * 2. 确认后：写后端 content_language → 切 vue-i18n locale → 短暂提示 → location.reload()
 *    （整页重载让所有组件干净重建，避免深嵌组件依赖 watch 的时序问题）
 */
import { createApp, h, ref } from 'vue'
import { i18n, setUiLocale, type UiLocale } from '~/composables/i18n'
import { settingsAPI } from '~/composables/useApi'
import LanguageSwitchDialog from '~/components/LanguageSwitchDialog.vue'

let pending: { resolve: (ok: boolean) => void } | null = null

/** 弹确认框；resolve(true) = 用户确认切换 */
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

/** 入口：先弹确认框，确认后执行统一切换并刷新 */
export async function confirmUnifiedLanguage(lang: UiLocale) {
  if (switching || pending) return
  const ok = await confirmDialog(lang)
  if (!ok) return
  switching = true
  try {
    await settingsAPI.setContentLanguage(lang)
  } catch { /* 后端失败不阻断界面切换 */ }
  setUiLocale(lang)
  try {
    const { toast } = await import('vue-sonner')
    toast.info(i18n.global.t('components.langSwitch.refreshing'), { duration: 1200 })
  } catch { /* 提示失败不阻断 */ }
  setTimeout(() => location.reload(), 1000)
}
