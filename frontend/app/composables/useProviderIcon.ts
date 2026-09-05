/**
 * 厂商图标 — 双主题本地托管（app/public/icons/{light,dark}/，源自 chatfire-gateway）
 * resolvedTheme 是模块级 computed，模板中调用本函数会随主题切换响应式更新
 */
import { resolvedTheme } from '~/composables/useTheme'

const FILENAMES: Record<string, string> = {
  openai: 'openai.png',
  gemini: 'gemini-color.png',
  volcengine: 'volcengine-color.png',
  minimax: 'minimax-color.png',
  claude: 'claude-color.png',
  deepseek: 'deepseek-color.png',
  doubao: 'doubao-color.png',
  moonshot: 'kimi-color.png',
  qwen: 'qwen-color.png',
  zhipu: 'zhipu-color.png',
  xai: 'grok.png',
  xiaomi: 'xiaomi-color.png',
  vidu: 'vidu-color.png',
  ollama: 'ollama.png',
  midjourney: 'midjourney.png',
}

/** provider → 当前主题下的图标 URL；未知厂商返回 undefined（调用方回退字母徽标） */
export function providerIconUrl(provider?: string | null): string | undefined {
  const file = FILENAMES[(provider || '').toLowerCase()]
  return file ? `/icons/${resolvedTheme.value}/${file}` : undefined
}
