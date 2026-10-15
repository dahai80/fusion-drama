import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('characters and scenes tables store the agent-written final prompt', () => {
  const schema = read('src/db/schema.ts')
  const sqliteSchema = read('src/db/sqlite-schema.ts')

  // Drizzle 表定义（MySQL→SQLite 迁移后为 sqliteTable）
  assert.match(schema, /export const characters = sqliteTable\('characters'[\s\S]*?finalPrompt: text\('final_prompt'\)/)
  assert.match(schema, /export const scenes = sqliteTable\('scenes'[\s\S]*?finalPrompt: text\('final_prompt'\)/)
  // SQLite DDL（启动时幂等重放）
  assert.match(sqliteSchema, /CREATE TABLE IF NOT EXISTS characters \([\s\S]*?final_prompt TEXT/)
  assert.match(sqliteSchema, /CREATE TABLE IF NOT EXISTS scenes \([\s\S]*?final_prompt TEXT/)
})

test('grid prompt agent tools save agent-written final prompts with style injection', () => {
  const tools = read('src/agents/tools/image-prompt-tools.ts')

  assert.match(tools, /save_character_final_prompt/)
  assert.match(tools, /save_scene_final_prompt/)
  // 保存时注入项目视觉风格并落库
  assert.match(tools, /getDramaStylePrompt/)
  assert.match(tools, /set\(\{ finalPrompt, updatedAt: now\(\) \}\)/)
  // 提示词由 Agent 创作，不再由工具机械拼接
  assert.doesNotMatch(tools, /generate_character_prompt/)
  assert.doesNotMatch(tools, /generate_scene_prompt/)
})

test('prompt agent instructions reference per-asset skills; skill files define the specs', () => {
  const agents = read('src/agents/index.ts')
  const charSkill = read('workspace/skills/prompt-generator/character-prompt/SKILL.md')
  const sceneSkill = read('workspace/skills/prompt-generator/scene-prompt/SKILL.md')

  // settings.vue 不再内嵌默认提示词副本：Agent 提示词由 /prompts API
  // 从 workspace 文件 + 后端 DEFAULT_PROMPTS 提供（agents/index.ts）
  // 三类图片规范入口（具体创作规则在各自 SKILL.md 中）
  assert.match(agents, /角色四视图/)
  assert.match(agents, /场景固定视角/)
  assert.match(agents, /道具白底单品/)
  // 保存工具约定
  assert.match(agents, /save_character_final_prompt/)
  assert.match(agents, /save_scene_final_prompt/)
  // 角色四视图 / 场景固定视角的必备要素由技能文件承载
  // （输出语言跟随会话语言指令，支持多语言而非固定中文）
  assert.match(charSkill, /正脸特写/)
  assert.match(charSkill, /正面、45 度侧面、90 度侧面、背面/)
  assert.match(charSkill, /四个视图的脸、发型和服装完全一致/)
  assert.match(charSkill, /语言跟随会话语言指令/)
  assert.match(sceneSkill, /固定机位广角镜头/)
  assert.match(sceneSkill, /前景（\[前景元素\]）、中景（\[中景主体空间\]）、后景（\[后景纵深\]）/)
  assert.match(sceneSkill, /出入口/)
  assert.match(sceneSkill, /语言跟随会话语言指令/)
})

test('image generation prefers the stored final prompt with agent generation and legacy fallback', () => {
  const service = read('src/services/final-prompt.ts')
  const characters = read('src/routes/characters.ts')
  const scenes = read('src/routes/scenes.ts')

  assert.match(service, /export async function ensureCharacterFinalPrompt/)
  assert.match(service, /export async function ensureSceneFinalPrompt/)
  assert.match(service, /getAgent\('prompt_generator'/)
  // 已有最终提示词直接复用（force 时忽略强制重新生成）
  assert.match(service, /if \(char\.finalPrompt && !force\) return char\.finalPrompt/)
  assert.match(service, /if \(scene\.finalPrompt && !force\) return scene\.finalPrompt/)
  assert.match(service, /force = false/)

  assert.match(characters, /ensureCharacterFinalPrompt\(char, ep\.id, /)
  // 文本模型覆盖（text_model/text_config_id）透传到提示词 Agent
  assert.match(characters, /text_model/)
  assert.match(characters, /finalPrompt \|\| characterImagePrompt\(char, stylePrompt\)/)
  assert.match(scenes, /ensureSceneFinalPrompt\(scene, ep\.id, /)
  assert.match(scenes, /text_model/)
  // 手动编辑最终提示词以传入值为准；未传入保留原值（不再自动置空）
  assert.match(characters, /updates\.finalPrompt = body\.final_prompt \|\| null/)
  assert.match(scenes, /updates\.finalPrompt = body\.final_prompt \|\| null/)
})
