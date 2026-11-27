/**
 * Provider icons — locally hosted for both themes (app/public/icons/{light,dark}/)
 * resolvedTheme is a module-level computed, so calling these helpers in templates
 * reactively updates when the theme switches
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
  aliyun: 'qwen-color.png',  // Alibaba Cloud's Wan series and Qwen are both Alibaba; they share an icon
  zhipu: 'zhipu-color.png',
  xai: 'grok.png',
  xiaomi: 'xiaomi-color.png',
  vidu: 'vidu-color.png',
  ollama: 'ollama.png',
  midjourney: 'midjourney.png',
}

/** provider -> icon URL under the current theme; unknown providers return undefined (callers fall back to a letter badge) */
export function providerIconUrl(provider?: string | null): string | undefined {
  const file = FILENAMES[(provider || '').toLowerCase()]
  return file ? `/icons/${resolvedTheme.value}/${file}` : undefined
}

/**
 * Model name -> provider inference (top-to-bottom by priority; first hit wins).
 * Scenario: the config goes through an openai-compatible gateway (provider=openai) but the
 * model is actually deepseek/gemini etc.; the icon should then follow the model name, not the
 * provider.
 * doubao/seedance are deliberately absent: they are served by volcengine, whose provider icon
 * is more accurate.
 */
const MODEL_PROVIDER_HINTS: [RegExp, string][] = [
  [/deepseek/i, 'deepseek'],
  [/claude/i, 'claude'],
  [/gemini/i, 'gemini'],
  [/kimi|moonshot/i, 'moonshot'],
  [/qwen|^wan[\d.-]/i, 'qwen'],
  [/glm|zhipu|chatglm/i, 'zhipu'],
  [/grok/i, 'xai'],
  [/^(gpt|chatgpt|o[1-9])/i, 'openai'],
]

/** Model-aware icon: prefer the provider inferred from the model name, fall back to the provider */
export function modelIconUrl(provider?: string | null, model?: string | null): string | undefined {
  const m = model || ''
  for (const [re, p] of MODEL_PROVIDER_HINTS) {
    if (re.test(m)) return providerIconUrl(p)
  }
  return providerIconUrl(provider)
}
