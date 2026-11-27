import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('characters and scenes tables store the agent-written final prompt', () => {
  const schema = read('src/db/schema.ts')
  const sqliteSchema = read('src/db/sqlite-schema.ts')

  // Drizzle table definitions (sqliteTable after the MySQL→SQLite migration)
  assert.match(schema, /export const characters = sqliteTable\('characters'[\s\S]*?finalPrompt: text\('final_prompt'\)/)
  assert.match(schema, /export const scenes = sqliteTable\('scenes'[\s\S]*?finalPrompt: text\('final_prompt'\)/)
  // SQLite DDL (idempotent replay at startup)
  assert.match(sqliteSchema, /CREATE TABLE IF NOT EXISTS characters \([\s\S]*?final_prompt TEXT/)
  assert.match(sqliteSchema, /CREATE TABLE IF NOT EXISTS scenes \([\s\S]*?final_prompt TEXT/)
})

test('grid prompt agent tools save agent-written final prompts with style injection', () => {
  const tools = read('src/agents/tools/image-prompt-tools.ts')

  assert.match(tools, /save_character_final_prompt/)
  assert.match(tools, /save_scene_final_prompt/)
  // inject the project's visual style on save and persist it
  assert.match(tools, /getDramaStylePrompt/)
  assert.match(tools, /set\(\{ finalPrompt, updatedAt: now\(\) \}\)/)
  // prompts are authored by the agent, no longer mechanically stitched by tools
  assert.doesNotMatch(tools, /generate_character_prompt/)
  assert.doesNotMatch(tools, /generate_scene_prompt/)
})

test('prompt agent instructions reference per-asset skills; skill files define the specs', () => {
  const agents = read('src/agents/index.ts')
  const charSkill = read('workspace/skills/prompt-generator/character-prompt/SKILL.md')
  const sceneSkill = read('workspace/skills/prompt-generator/scene-prompt/SKILL.md')

  // settings.vue no longer embeds a default prompt copy: agent prompts come from the
  // /prompts API backed by workspace files + backend DEFAULT_PROMPTS (agents/index.ts)
  // entry points of the three image specs (detailed authoring rules live in each SKILL.md)
  // i18n: user-facing — asserts the kept zh agent-prompt text
  assert.match(agents, /角色四视图/)
  // i18n: user-facing — asserts the kept zh agent-prompt text
  assert.match(agents, /场景固定视角/)
  // i18n: user-facing — asserts the kept zh agent-prompt text
  assert.match(agents, /道具白底单品/)
  // save-tool conventions
  assert.match(agents, /save_character_final_prompt/)
  assert.match(agents, /save_scene_final_prompt/)
  // the required elements of the character four-view / scene fixed-view specs are carried
  // by the skill files (output language follows the session language directive,
  // multilingual rather than fixed Chinese)
  // i18n: user-facing — asserts the kept zh skill-file text
  assert.match(charSkill, /正脸特写/)
  // i18n: user-facing — asserts the kept zh skill-file text
  assert.match(charSkill, /正面、45 度侧面、90 度侧面、背面/)
  // i18n: user-facing — asserts the kept zh skill-file text
  assert.match(charSkill, /四个视图的脸、发型和服装完全一致/)
  // i18n: user-facing — asserts the kept zh skill-file text
  assert.match(charSkill, /语言跟随会话语言指令/)
  // i18n: user-facing — asserts the kept zh skill-file text
  assert.match(sceneSkill, /固定机位广角镜头/)
  // i18n: user-facing — asserts the kept zh skill-file text
  assert.match(sceneSkill, /前景（\[前景元素\]）、中景（\[中景主体空间\]）、后景（\[后景纵深\]）/)
  // i18n: user-facing — asserts the kept zh skill-file text
  assert.match(sceneSkill, /出入口/)
  // i18n: user-facing — asserts the kept zh skill-file text
  assert.match(sceneSkill, /语言跟随会话语言指令/)
})

test('image generation prefers the stored final prompt with agent generation and legacy fallback', () => {
  const service = read('src/services/final-prompt.ts')
  const characters = read('src/routes/characters.ts')
  const scenes = read('src/routes/scenes.ts')

  assert.match(service, /export async function ensureCharacterFinalPrompt/)
  assert.match(service, /export async function ensureSceneFinalPrompt/)
  assert.match(service, /getAgent\('prompt_generator'/)
  // reuse an existing final prompt as-is (force regenerates even when present)
  assert.match(service, /if \(char\.finalPrompt && !force\) return char\.finalPrompt/)
  assert.match(service, /if \(scene\.finalPrompt && !force\) return scene\.finalPrompt/)
  assert.match(service, /force = false/)

  assert.match(characters, /ensureCharacterFinalPrompt\(char, ep\.id, /)
  // text-model overrides (text_model/text_config_id) pass through to the prompt agent
  assert.match(characters, /text_model/)
  assert.match(characters, /finalPrompt \|\| characterImagePrompt\(char, stylePrompt\)/)
  assert.match(scenes, /ensureSceneFinalPrompt\(scene, ep\.id, /)
  assert.match(scenes, /text_model/)
  // manual final-prompt edits take the passed value as-is; when absent the original is
  // kept (no longer auto-cleared)
  assert.match(characters, /updates\.finalPrompt = body\.final_prompt \|\| null/)
  assert.match(scenes, /updates\.finalPrompt = body\.final_prompt \|\| null/)
})
