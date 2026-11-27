/**
 * Skill management routes — all reads/writes go through the Mastra Workspace API
 * File operations are jailed inside the backend/workspace/ directory
 */
import { Hono } from 'hono'
import { success, badRequest } from '../utils/response.js'
import { refreshSkillWorkspaces, skillsManagerWorkspace } from '../agents/skills.js'

const app = new Hono()
const fsm = () => skillsManagerWorkspace.filesystem!
const LANGS = ['zh', 'en', 'ja', 'ko']
const normalizeLang = (v?: string) => (v && LANGS.includes(v) ? v : 'zh')
/** Skill file path; non-zh lang maps to the language variant SKILL.<lang>.md */
const skillFile = (id: string, lang?: string) => `skills/${id}/SKILL${lang && lang !== 'zh' ? `.${lang}` : ''}.md`
const SKILL_ID_SEGMENT = /^[a-z0-9-]+$/
/** GET/PUT/DELETE path params are validated too: rejects traversal forms like `..`/backslashes/empty segments, preventing escapes from the workspace jail */
const assertValidSkillId = (id: string) => {
  const segments = id.split('/')
  if (!segments.length || !segments.every((seg: string) => SKILL_ID_SEGMENT.test(seg))) {
    throw new Error('Each segment of a skill id may only contain lowercase letters, digits, and hyphens')
  }
  return segments
}

// GET /skills?lang= — List all skills (native discovery via workspace.skills)
// For non-zh lang with an existing variant, name/description come from the variant frontmatter (falls back to the base version when missing)
app.get('/', async (c) => {
  const lang = normalizeLang(c.req.query('lang'))
  const metas = await skillsManagerWorkspace.skills?.list() || []
  const out = []
  for (const meta of metas) {
    const id = meta.path.replace(/^skills\//, '')
    let name = meta.name
    let description = meta.description || ''
    if (lang !== 'zh' && await fsm().exists(skillFile(id, lang))) {
      const raw = String(await fsm().readFile(skillFile(id, lang), { encoding: 'utf-8' }))
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] || ''
      const n = /^name:\s*(.+)$/m.exec(fm)?.[1]?.trim()
      const d = /^description:\s*(.+)$/m.exec(fm)?.[1]?.trim()
      if (n) name = n
      if (d) description = d
    }
    out.push({ id, name, description })
  }
  return success(c, out)
})

// GET /skills/:id?lang= — Get skill content (raw, including frontmatter for editing)
// Non-zh lang reads the language variant; missing variant falls back to base content with is_default=true (frontend shows "follows Chinese")
app.get('/*', async (c) => {
  const id = c.req.path.slice('/api/v1/skills/'.length)
  try { assertValidSkillId(id) } catch (e: any) { return badRequest(c, e.message) }
  const lang = normalizeLang(c.req.query('lang'))
  if (!await fsm().exists(skillFile(id))) return badRequest(c, 'Skill not found')
  const variantExists = lang !== 'zh' && await fsm().exists(skillFile(id, lang))
  const content = await fsm().readFile(skillFile(id, variantExists ? lang : undefined), { encoding: 'utf-8' })
  return success(c, { id, lang, content, is_default: lang !== 'zh' && !variantExists })
})

// PUT /skills/:id?lang= — Update skill content (non-zh lang writes the language variant; base version changes require a skill cache refresh)
app.put('/*', async (c) => {
  const id = c.req.path.slice('/api/v1/skills/'.length)
  try { assertValidSkillId(id) } catch (e: any) { return badRequest(c, e.message) }
  const body = await c.req.json()
  const lang = normalizeLang(c.req.query('lang') ?? body.lang)
  if (lang !== 'zh' && !await fsm().exists(skillFile(id))) return badRequest(c, 'Skill not found')
  // Audit 1107 F-11: content must be a string — undefined would write "undefined" to disk
  if (typeof body.content !== 'string') return badRequest(c, 'content must be a string')
  await fsm().writeFile(skillFile(id, lang), body.content, { recursive: true })
  // Directory mtime does not change on file content edits (APFS); explicitly refresh the skill cache. Language variants are read directly, no refresh needed.
  if (lang === 'zh') await refreshSkillWorkspaces()
  return success(c)
})

// POST /skills — Create new skill directory
app.post('/', async (c) => {
  const body = await c.req.json()
  const { id, description } = body
  if (!id) return badRequest(c, 'Skill id is required')
  // Mastra skill spec: frontmatter name must match the directory name, lowercase letters/digits/hyphens only
  const segments = String(id).split('/')
  if (!segments.every((seg: string) => SKILL_ID_SEGMENT.test(seg))) {
    return badRequest(c, 'Each segment of a skill id may only contain lowercase letters, digits, and hyphens')
  }
  if (await fsm().exists(skillFile(id))) return badRequest(c, 'Skill already exists')

  const name = segments[segments.length - 1]
  // Audit 1107 F-11: description is interpolated into YAML frontmatter —
  // strip newlines/`---` so it can't break out of the description field
  const safeDesc = String(description || '').replace(/[\r\n]+/g, ' ').replace(/---/g, '—').slice(0, 300)
  const content = `---
name: ${name}
description: ${safeDesc}
---

# ${name}

Write your skill content here.
`
  await fsm().writeFile(skillFile(id), content, { recursive: true, overwrite: false })
  await refreshSkillWorkspaces()
  return success(c, { id, name, description: description || '' })
})

// DELETE /skills/:id — Delete skill directory
app.delete('/*', async (c) => {
  const id = c.req.path.slice('/api/v1/skills/'.length)
  try { assertValidSkillId(id) } catch (e: any) { return badRequest(c, e.message) }
  if (!await fsm().exists(`skills/${id}`)) return badRequest(c, 'Skill not found')
  await fsm().rmdir(`skills/${id}`, { recursive: true })
  await refreshSkillWorkspaces()
  return success(c)
})

export default app
