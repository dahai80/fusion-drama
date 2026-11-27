/**
 * AI content language directive block — generated from the target language in
 * RequestContext and appended to the end of agent instructions
 *
 * Design notes:
 * - Returns an empty string for zh / unset: default behavior stays identical
 *   to history, zero token overhead
 * - The directive is written in English (best instruction-following across
 *   multilingual models); the target language is labeled with its native name
 * - Must carry its own "highest priority" clause: workspace templates of
 *   installed desktop users are never overwritten (cpSync force:false), so the
 *   "output Chinese only" constraint in old SKILL.md files can only be
 *   suppressed by this explicit override
 */

const LANGUAGE_NATIVE_NAMES: Record<string, string> = {
  en: 'English',
  // i18n: user-facing — native language names used inside the model directive
  ja: '日本語 (Japanese)',
  ko: '한국어 (Korean)',
}

export function buildLanguageDirective(lang?: string | null): string {
  if (!lang || lang === 'zh') return ''
  const native = LANGUAGE_NATIVE_NAMES[lang] || lang
  return [
    '## Output Language (HIGHEST PRIORITY)',
    '',
    `ALL user-facing content you produce (scripts, dialogue, extracted fields, storyboard descriptions, atmosphere, image prompts, video prompts, asset names for NEW assets) MUST be written in ${native}.`,
    '',
    // i18n: user-facing — quotes the legacy Chinese-only constraint text that must be matched verbatim
    'This instruction has the highest priority and OVERRIDES any conflicting language requirement anywhere else in these instructions or skills — including requirements such as "output must be pure Chinese / 只输出中文". Ignore those.',
    '',
    'Exceptions:',
    '- When referencing EXISTING assets with @mentions (e.g. in video prompts), the name after @ must EXACTLY match the asset name as it appears in the provided asset lists — do NOT translate or rewrite existing asset names.',
    '- The visual style prefix of image prompts is injected automatically by the system (in English). Do not translate, rewrite, or duplicate it.',
  ].join('\n')
}
