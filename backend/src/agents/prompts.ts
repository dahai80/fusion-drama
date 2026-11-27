/**
 * Agent prompt file loader — workspace/prompts/<agent_type>.md
 * File format (following the SKILL.md convention):
 *   ---
 *   name: Storyboard Breakdown
 *   model: ""        # optional, overrides the text model; empty = use the AI service default
 *   ---
 *   <system prompt body>
 * The file is the single source of truth; when missing, callers fall back to the code defaults.
 */
import { skillsManagerWorkspace } from './skills.js'

export interface AgentPromptFile {
  name: string
  model: string
  instructions: string
}

const fsm = () => skillsManagerWorkspace.filesystem!
/** Prompt file path; when lang is en/ja/ko returns the language variant (<type>.<lang>.md), zh/empty returns the base version */
export const promptFilePath = (agentType: string, lang?: string | null) =>
  `prompts/${agentType}${lang && lang !== 'zh' ? `.${lang}` : ''}.md`

/** Parses a prompt file (frontmatter supports only the two scalar fields name/model, no yaml dependency) */
export function parsePromptFile(raw: string): AgentPromptFile {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  let name = ''
  let model = ''
  let body = raw
  if (fmMatch) {
    const fm = fmMatch[1]
    const get = (key: string) => {
      const m = fm.match(new RegExp(`^${key}:\\s*"?([^"\\n]*)"?\\s*$`, 'm'))
      return (m?.[1] || '').trim()
    }
    name = get('name')
    model = get('model')
    body = raw.slice(fmMatch[0].length)
  }
  return { name, model, instructions: body.trim() }
}

/** Serializes to prompt file content (used by the save endpoint) */
export function serializePromptFile(file: AgentPromptFile): string {
  return `---\nname: ${file.name}\nmodel: "${file.model}"\n---\n\n${file.instructions.trim()}\n`
}

/** Reads the prompt file at the given path; returns null when missing or unparseable */
async function readPromptFile(path: string): Promise<AgentPromptFile | null> {
  try {
    if (!await fsm().exists(path)) return null
    const raw = String(await fsm().readFile(path, { encoding: 'utf-8' }))
    const parsed = parsePromptFile(raw)
    return parsed.instructions ? parsed : null
  } catch {
    return null
  }
}

/** Reads the base (Chinese) prompt file — the model field is always parsed from the base version only, avoiding multi-language file drift */
export function loadBasePromptFile(agentType: string): Promise<AgentPromptFile | null> {
  return readPromptFile(promptFilePath(agentType))
}

/**
 * Reads an Agent's prompt file; when lang is not zh, prefers the language variant (<type>.<lang>.md),
 * falling back to the base version when missing.
 * A variant's model field is ignored: the returned model always comes from the base version.
 */
export async function loadAgentPromptFile(agentType: string, lang?: string | null): Promise<AgentPromptFile | null> {
  const base = await loadBasePromptFile(agentType)
  if (!lang || lang === 'zh') return base
  const localized = await readPromptFile(promptFilePath(agentType, lang))
  if (!localized) return base
  return { ...localized, model: base?.model || '' }
}
