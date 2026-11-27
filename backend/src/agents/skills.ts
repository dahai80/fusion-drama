/**
 * Agent workspace — Mastra native capability.
 * One Workspace per Agent:
 * - filesystem: jailed to backend/workspace/, giving the Agent file read/write tools
 * - skills: registers each Agent's own SKILL.md files from workspace/skills/
 * Instructions injection still concatenates full skill text (native injection carries metadata only;
 * full-text injection guarantees consistent behavior)
 *
 * Note: the filesystem instructions are deliberately overwritten with a Chinese description free of
 * the word "workspace" — the default text contains absolute paths (the path includes the workspace
 * directory name), and Gemini-family models at low thinking budgets occasionally hallucinate
 * "Google Workspace" from it and refuse tool calls citing "organizational policy".
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Workspace, LocalFilesystem } from '@mastra/core/workspace'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
// Packaged desktop builds get WORKSPACE_PATH injected by the Electron main process (a writable copy under userData); dev anchors backend/workspace
const WORKSPACE_DIR = process.env.WORKSPACE_PATH
  ? path.resolve(process.env.WORKSPACE_PATH)
  : path.resolve(__dirname, '../../workspace')
const SKILLS_DIR = path.join(WORKSPACE_DIR, 'skills')

// Overrides the default filesystem instructions (the default text carries absolute paths, exposing the word "workspace")
// i18n: user-facing — injected into agent instructions (LLM prompt, product behavior)
const FILESYSTEM_INSTRUCTIONS =
  '本地文件目录：用于读写技能定义、提示词等项目文件。相对路径均以此目录为根解析；文件访问仅限此目录之内。' // i18n: user-facing
const localFilesystem = () => new LocalFilesystem({ basePath: WORKSPACE_DIR, instructions: FILESYSTEM_INSTRUCTIONS })

// Ensure the workspace directory exists at startup (jail root for Agent file I/O)
// In packaged desktop builds modules may still load from a read-only location; failure does not block startup (the route layer reports a clear error)
try {
  fs.mkdirSync(SKILLS_DIR, { recursive: true })
} catch (err) {
  console.warn(`[skills] failed to create workspace directory (read-only environment?): ${(err as Error).message}`)
}

/** Skill directories registered per Agent (relative to workspace/skills/, including sub-spec directories; directory names must follow the Agent Skills spec: lowercase + hyphens) */
const AGENT_SKILL_MAP: Record<string, string[]> = {
  script_rewriter: ['script-rewriter'],
  extractor: ['extractor'],
  storyboard_breaker: ['storyboard-breaker'],
  prompt_generator: [
    'prompt-generator/character-prompt',
    'prompt-generator/scene-prompt',
    'prompt-generator/prop-prompt',
    'prompt-generator/video-prompt',
  ],
}

/** Each Agent's Workspace (filesystem working directory + native skill registration)
 *  skills uses a dynamic resolver matching by directory prefix: sub-skills created on the settings page are discovered without a restart */
export const skillWorkspaces: Record<string, Workspace> = Object.fromEntries(
  Object.entries(AGENT_SKILL_MAP).map(([agentType, prefixes]) => [
    agentType,
    new Workspace({
      id: `workspace-${agentType}`,
      name: `${agentType} workspace`,
      filesystem: localFilesystem(),
      skills: () => scanSkillPaths().filter(p =>
        prefixes.some(prefix => p === `skills/${prefix}` || p.startsWith(`skills/${prefix}/`))),
    }),
  ]),
)

/** Recursively scans workspace/skills/ for all directories containing a SKILL.md (paths relative to the workspace root) */
function scanSkillPaths(): string[] {
  const found: string[] = []
  const walk = (dir: string, prefix: string) => {
    if (!fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const full = path.join(dir, entry.name)
      if (fs.existsSync(path.join(full, 'SKILL.md'))) found.push(`skills/${rel}`)
      walk(full, rel)
    }
  }
  walk(SKILLS_DIR, '')
  return found
}

/**
 * Skills-management Workspace (used by the settings page CRUD)
 * skills uses a dynamic resolver: newly created/deleted skill directories are discovered without a restart
 */
export const skillsManagerWorkspace = new Workspace({
  id: 'workspace-skills-manager',
  name: 'skills manager',
  filesystem: localFilesystem(),
  skills: () => scanSkillPaths(),
})

function formatSkillSection(skillId: string, content: string): string {
  return [`## Skill: ${skillId}`, content].join('\n')
}

/** Strips frontmatter from SKILL.md-style files and returns the body (for direct language-variant reads) */
function stripFrontmatter(raw: string): string {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return (m ? raw.slice(m[0].length) : raw).trim()
}

/** Reads a skill's language-variant body (SKILL.<lang>.md, read directly bypassing the cache so always fresh); returns null when absent */
async function readLocalizedSkill(relPath: string, lang: string): Promise<string | null> {
  const fsm = skillsManagerWorkspace.filesystem!
  const p = `skills/${relPath}/SKILL.${lang}.md`
  try {
    if (!await fsm.exists(p)) return null
    const body = stripFrontmatter(String(await fsm.readFile(p, { encoding: 'utf-8' })))
    return body || null
  } catch {
    return null
  }
}

/** Loads an Agent's full skill text (via the workspace.skills API, keeping the native injection format)
 *  AGENT_SKILL_MAP directories match by prefix: the directory itself and all SKILL.md under its subdirectories
 *  are injected, so sub-skills created on the settings page (e.g. storyboard-breaker/xxx) take effect without code changes.
 *  When lang is not zh, each skill prefers SKILL.<lang>.md, falling back to the base (Chinese) version when missing */
export async function loadAgentSkills(agentType: string, lang?: string | null): Promise<string> {
  const workspace = skillWorkspaces[agentType]
  const prefixes = AGENT_SKILL_MAP[agentType] || []
  if (!workspace || !prefixes.length) return ''

  const allPaths = scanSkillPaths().map(p => p.replace(/^skills\//, ''))
  const relPaths = allPaths.filter(p =>
    prefixes.some(prefix => p === prefix || p.startsWith(prefix + '/')))

  const useLocalized = Boolean(lang && lang !== 'zh')
  const contents: string[] = []
  for (const relPath of relPaths) {
    let body: string | null | undefined
    if (useLocalized) body = await readLocalizedSkill(relPath, lang!)
    if (!body) {
      const skill = await workspace.skills?.get(`skills/${relPath}`)
      body = skill?.instructions?.trim()
    }
    if (body) contents.push(formatSkillSection(relPath, body))
  }

  if (!contents.length) return ''

  // i18n: user-facing — injected into agent instructions (LLM prompt, product behavior)
  return [
    '以下是该 Agent 专属的项目技能规范（SKILL.md）。', // i18n: user-facing
    '不同 Agent 会加载不同 skill；你只需要遵守当前注入的这些技能。', // i18n: user-facing
    '你必须在不违背当前工具边界的前提下优先遵守这些规范；若与用户明确要求冲突，以用户要求为准。', // i18n: user-facing
    '',
    contents.join('\n\n'),
  ].join('\n')
}

/**
 * Forces a rescan of every Agent's skills (called after SKILL.md edits)
 * maybeRefresh detects directory additions/removals (dynamic resolver path changes); refresh handles content updates
 * (directory mtime does not change on file-content edits, so maybeRefresh's staleness check alone is unreliable)
 */
export async function refreshSkillWorkspaces(): Promise<void> {
  await Promise.all(
    [...Object.values(skillWorkspaces), skillsManagerWorkspace]
      .map(async workspace => {
        await workspace.skills?.maybeRefresh()
        await workspace.skills?.refresh()
      }),
  )
}
