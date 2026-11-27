/**
 * Agent prompt management routes — read/write workspace/prompts/<agent_type>[.<lang>].md
 * File operations are jailed inside the backend/workspace/ directory (mirrors the skills routes)
 * ?lang=en/ja/ko reads/writes language variants; zh or omitted means the base version (historical behavior)
 */
import { Hono } from 'hono'
import { success, badRequest } from '../utils/response.js'
import { skillsManagerWorkspace } from '../agents/skills.js'
import { validAgentTypes, DEFAULT_PROMPTS } from '../agents/index.js'
import { loadAgentPromptFile, serializePromptFile, promptFilePath } from '../agents/prompts.js'

const app = new Hono()
const fsm = () => skillsManagerWorkspace.filesystem!

const checkType = (type: string) => validAgentTypes.includes(type)
const LANGS = ['zh', 'en', 'ja', 'ko']
const normalizeLang = (v?: string) => (v && LANGS.includes(v) ? v : 'zh')

// GET /prompts — list the prompt status of all agents (base-version view; name/model belong to the base version only)
app.get('/', async (c) => {
  const list = await Promise.all(validAgentTypes.map(async (type) => {
    const file = await loadAgentPromptFile(type)
    return {
      agent_type: type,
      name: file?.name || DEFAULT_PROMPTS[type].name,
      model: file?.model || '',
      is_default: !file,
    }
  }))
  return success(c, list)
})

// GET /prompts/:type?lang= — effective content (language variant first, falls back to base version, then to code defaults)
// is_default=true means the current language has no dedicated file (content is a fallback version); the frontend uses this to show "follows Chinese"
app.get('/:type', async (c) => {
  const type = c.req.param('type')
  if (!checkType(type)) return badRequest(c, 'Unknown agent type')
  const lang = normalizeLang(c.req.query('lang'))
  const [file, base] = await Promise.all([
    loadAgentPromptFile(type, lang),
    lang === 'zh' ? Promise.resolve(null) : loadAgentPromptFile(type),
  ])
  // When lang is non-zh and the variant does not exist, file is the base version; double-check variant existence via the path
  const variantExists = lang !== 'zh' && await fsm().exists(promptFilePath(type, lang))
  if (file) {
    return success(c, {
      agent_type: type,
      lang,
      name: base?.name || file.name || DEFAULT_PROMPTS[type].name,
      model: base?.model || file.model,
      system_prompt: file.instructions,
      is_default: lang === 'zh' ? false : !variantExists,
    })
  }
  return success(c, {
    agent_type: type,
    lang,
    name: DEFAULT_PROMPTS[type].name,
    model: '',
    system_prompt: DEFAULT_PROMPTS[type].instructions,
    is_default: true,
  })
})

// PUT /prompts/:type?lang= — save as a prompt file (non-zh lang writes the language variant; model is saved with the base version only)
app.put('/:type', async (c) => {
  const type = c.req.param('type')
  if (!checkType(type)) return badRequest(c, 'Unknown agent type')
  const body = await c.req.json()
  const lang = normalizeLang(c.req.query('lang') ?? body.lang)
  const instructions = String(body.system_prompt ?? '').trim()
  if (!instructions) return badRequest(c, 'system_prompt is required')
  if (lang === 'zh') {
    const name = String(body.name || DEFAULT_PROMPTS[type].name)
    const model = String(body.model ?? '').trim()
    await fsm().writeFile(promptFilePath(type), serializePromptFile({ name, model, instructions }), { recursive: true })
    return success(c, { agent_type: type, lang, name, model, is_default: false })
  }
  // Language variant: model is never read from the variant, name is display-only; keep the variant's own name (default to base/default name)
  const base = await loadAgentPromptFile(type)
  const name = String(body.name || base?.name || DEFAULT_PROMPTS[type].name)
  await fsm().writeFile(promptFilePath(type, lang), serializePromptFile({ name, model: '', instructions }), { recursive: true })
  return success(c, { agent_type: type, lang, name, is_default: false })
})

// POST /prompts/:type/reset?lang= — delete the language file and fall back (variant→base; base→code defaults)
app.post('/:type/reset', async (c) => {
  const type = c.req.param('type')
  if (!checkType(type)) return badRequest(c, 'Unknown agent type')
  const lang = normalizeLang(c.req.query('lang'))
  const path = promptFilePath(type, lang)
  if (await fsm().exists(path)) await fsm().deleteFile(path)
  return success(c, { agent_type: type, lang, is_default: true })
})

export default app
