/**
 * Agent prompt 管理路由 — 读写 workspace/prompts/<agent_type>.md
 * 文件操作 jail 在 backend/workspace/ 目录内（仿 skills 路由）
 */
import { Hono } from 'hono'
import { success, badRequest } from '../utils/response.js'
import { skillsManagerWorkspace } from '../agents/skills.js'
import { validAgentTypes, DEFAULT_PROMPTS } from '../agents/index.js'
import { loadAgentPromptFile, serializePromptFile, promptFilePath } from '../agents/prompts.js'

const app = new Hono()
const fsm = () => skillsManagerWorkspace.filesystem!

const checkType = (type: string) => validAgentTypes.includes(type)

// GET /prompts — 列出全部 Agent 的 prompt 状态
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

// GET /prompts/:type — 有效内容（文件优先，缺失回退代码默认）
app.get('/:type', async (c) => {
  const type = c.req.param('type')
  if (!checkType(type)) return badRequest(c, 'Unknown agent type')
  const file = await loadAgentPromptFile(type)
  if (file) {
    return success(c, {
      agent_type: type,
      name: file.name || DEFAULT_PROMPTS[type].name,
      model: file.model,
      system_prompt: file.instructions,
      is_default: false,
    })
  }
  return success(c, {
    agent_type: type,
    name: DEFAULT_PROMPTS[type].name,
    model: '',
    system_prompt: DEFAULT_PROMPTS[type].instructions,
    is_default: true,
  })
})

// PUT /prompts/:type — 保存为 prompt 文件
app.put('/:type', async (c) => {
  const type = c.req.param('type')
  if (!checkType(type)) return badRequest(c, 'Unknown agent type')
  const body = await c.req.json()
  const instructions = String(body.system_prompt ?? '').trim()
  if (!instructions) return badRequest(c, 'system_prompt required')
  const name = String(body.name || DEFAULT_PROMPTS[type].name)
  const model = String(body.model ?? '').trim()
  await fsm().writeFile(promptFilePath(type), serializePromptFile({ name, model, instructions }), { recursive: true })
  return success(c, { agent_type: type, name, model, is_default: false })
})

// POST /prompts/:type/reset — 删除文件，回退代码默认值
app.post('/:type/reset', async (c) => {
  const type = c.req.param('type')
  if (!checkType(type)) return badRequest(c, 'Unknown agent type')
  const path = promptFilePath(type)
  if (await fsm().exists(path)) await fsm().deleteFile(path)
  return success(c, { agent_type: type, is_default: true })
})

export default app
