import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('characters and scenes tables store the agent-written final prompt', () => {
  const schema = read('src/db/schema.ts')
  const mysql = read('src/db/mysql-schema.ts')

  // Drizzle 表定义
  assert.match(schema, /export const characters = mysqlTable\('characters'[\s\S]*?finalPrompt: text\('final_prompt'\)/)
  assert.match(schema, /export const scenes = mysqlTable\('scenes'[\s\S]*?finalPrompt: text\('final_prompt'\)/)
  // 新建表 DDL + 存量表 backfill
  assert.match(mysql, /CREATE TABLE IF NOT EXISTS characters \([\s\S]*?final_prompt TEXT/)
  assert.match(mysql, /CREATE TABLE IF NOT EXISTS scenes \([\s\S]*?final_prompt TEXT/)
  assert.match(mysql, /table: 'characters', column: 'final_prompt'/)
  assert.match(mysql, /table: 'scenes', column: 'final_prompt'/)
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

test('grid prompt agent instructions define turnaround and layered-composition specs', () => {
  const agents = read('src/agents/index.ts')
  const settings = read('../frontend/app/pages/settings.vue')

  for (const src of [agents, settings]) {
    // 角色三视图
    assert.match(src, /三视图/)
    assert.match(src, /character turnaround sheet/)
    assert.match(src, /front view, side view and back view/)
    // 场景固定视角 + 前中后景
    assert.match(src, /固定视角/)
    assert.match(src, /fixed camera wide shot/)
    assert.match(src, /foreground, midground and background/)
    // 保存工具约定
    assert.match(src, /save_character_final_prompt/)
    assert.match(src, /save_scene_final_prompt/)
  }
})

test('image generation prefers the stored final prompt with agent generation and legacy fallback', () => {
  const service = read('src/services/final-prompt.ts')
  const characters = read('src/routes/characters.ts')
  const scenes = read('src/routes/scenes.ts')

  assert.match(service, /export async function ensureCharacterFinalPrompt/)
  assert.match(service, /export async function ensureSceneFinalPrompt/)
  assert.match(service, /getAgent\('image_prompt_generator'/)
  // 已有最终提示词直接复用（force 时忽略强制重新生成）
  assert.match(service, /if \(char\.finalPrompt && !force\) return char\.finalPrompt/)
  assert.match(service, /if \(scene\.finalPrompt && !force\) return scene\.finalPrompt/)
  assert.match(service, /force = false/)

  assert.match(characters, /ensureCharacterFinalPrompt\(char, ep\.id\)/)
  assert.match(characters, /finalPrompt \|\| characterImagePrompt\(char, stylePrompt\)/)
  assert.match(scenes, /ensureSceneFinalPrompt\(scene, ep\.id\)/)
  // 描述字段编辑后最终提示词失效
  assert.match(characters, /updates\.finalPrompt = null/)
  assert.match(scenes, /updates\.finalPrompt = null/)
})
