/**
 * Unified error-toast entry — maps raw technical errors (Failed to fetch / API error 500: {...} /
 * upstream error codes / ffmpeg output / raw SDK English) into user-readable friendly copy.
 *
 * - mapError(err, { fallback? }): returns friendly copy (inline display reuses the same function)
 * - toastError(err, { fallback?, duration? }): toast.error(mapError(...)), errors fixed at 5s
 * - Short Chinese friendly messages returned by the backend (e.g. "shot not found") pass through verbatim
 * - Raw errors are never shown; debugging goes through DevTools (useApi already console.error)
 */
import { toast } from 'vue-sonner'
import { i18n } from '~/composables/i18n'

const t = (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params)

/** Content-moderation traits (moved up from episode.vue's videoModerationHint, reused site-wide) */
// i18n: user-facing (matches Chinese moderation/error text from backend/upstream)
export const MODERATION_RE = /sensitive|moderation|真人|人脸|real[\s_-]?person|审核|内容.*(违规|不合规|未通过)|content[\s_-]?policy|risk[\s_-]?control|violation|blocked/i

const NETWORK_RE = /failed to fetch|network ?error|load failed|network request failed|fetch failed/i
const NONJSON_RE = /unexpected token|not valid json|failed to parse/i
// F20: status-code matching requires word boundaries (whitespace/punctuation wrapped) so "500ms" is no longer misread as 5xx
// i18n: user-facing (matches Chinese error text from backend/upstream)
const STATUS5XX_RE = /(?:^|[\s(（"'])5\d{2}(?=$|[\s:：,，.。;)）"'])|internal server error|服务器内部错误/i
// i18n: user-facing (matches Chinese error text from backend/upstream)
const STATUSAUTH_RE = /(?:^|[\s(（"'])40[13](?=$|[\s:：,，.。;)）"'])|unauthorized|forbidden|invalid[\s_-]?api[\s_-]?key|authentication|鉴权/i
// i18n: user-facing (matches Chinese error text from backend/upstream)
const STATUS429_RE = /(?:^|[\s(（"'])429(?=$|[\s:：,，.。;)）"'])|rate[\s_-]?limit|too many requests|quota|额度不足|insufficient/i
// i18n: user-facing (matches Chinese error text from backend/upstream)
const TIMEOUT_RE = /timeout|timed out|polling exceeded|超时/i
/** Technical traits: presence means the message must not pass through to the user directly */
const TECHY_RE = /[{}\[\]<>]|https?:\/\/|\b(error|errno|exception|code|stack|undefined|null)\b|[a-z]+_[a-z]+/i
// i18n: user-facing (detects Chinese text in backend messages)
const CJK_RE = /[一-鿿]/

function messageOf(err: unknown): string {
  if (err == null) return ''
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message || String(err)
  const anyErr = err as { message?: unknown; error_msg?: unknown; errorMsg?: unknown }
  return String(anyErr.message ?? anyErr.error_msg ?? anyErr.errorMsg ?? err)
}

/**
 * Error → friendly copy. Categories short-circuit by priority:
 * network → non-JSON → moderation → auth → rate limit → 5xx → timeout → short-Chinese passthrough → status code → fallback
 */
export function mapError(err: unknown, opts?: { fallback?: string }): string {
  const msg = messageOf(err).trim()
  if (!msg) return opts?.fallback ? t(opts.fallback) : t('errors.unknown')

  if (err instanceof TypeError && NETWORK_RE.test(msg)) return t('errors.network')
  if (err instanceof SyntaxError || NONJSON_RE.test(msg)) return t('errors.server')
  if (MODERATION_RE.test(msg)) return t('errors.moderation')
  if (STATUSAUTH_RE.test(msg)) return t('errors.auth')
  if (STATUS429_RE.test(msg)) return t('errors.rateLimit')
  if (STATUS5XX_RE.test(msg)) return t('errors.unavailable')
  if (TIMEOUT_RE.test(msg)) return t('errors.timeout')

  // Backend-friendly Chinese (short, contains Chinese, no technical traits) passes through verbatim
  if (msg.length <= 40 && CJK_RE.test(msg) && !TECHY_RE.test(msg)) return msg

  if (/^\d{3}$/.test(msg)) return t('errors.requestFailed', { status: msg })

  return opts?.fallback ? t(opts.fallback) : t('errors.unknown')
}

/** Unified error toast (default 5s, longer than success toasts) */
export function toastError(err: unknown, opts?: { fallback?: string; duration?: number }): void {
  toast.error(mapError(err, opts), { duration: opts?.duration ?? 5000 })
}
