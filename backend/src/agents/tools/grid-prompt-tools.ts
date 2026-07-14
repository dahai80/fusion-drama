/**
 * 图片提示词生成 Agent 工具
 * 工厂函数模式 — 注入 episodeId + dramaId
 *
 * 支持两类提示词生成：
 * 1. 角色图片提示词
 * 2. 场景图片提示词
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'

export function createGridPromptTools(episodeId: number, dramaId: number) {

  // ─── 角色提示词 ───────────────────────────────────────

  const readCharacters = createTool({
    id: 'read_characters',
    description: '读取当前剧集中的所有角色信息，用于生成角色图片提示词。',
    inputSchema: z.object({}),
    execute: async () => {
      const chars = (await db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, dramaId)))
        .filter(c => !c.deletedAt)
      return {
        characters: chars.map(c => ({
          id: c.id,
          name: c.name,
          role: c.role || '',
          description: c.description || '',
          appearance: c.appearance || '',
          styling: c.styling || '',
        })),
      }
    },
  })

  const generateCharacterPrompt = createTool({
    id: 'generate_character_prompt',
    description: '为角色生成 AI 图片生成的英文提示词。',
    inputSchema: z.object({
      character_id: z.number(),
    }),
    execute: async ({ character_id }) => {
      const [c] = await db.select().from(schema.characters)
        .where(eq(schema.characters.id, character_id))
      if (!c) return { error: 'Character not found' }

      const parts: string[] = []
      if (c.appearance) parts.push(c.appearance)
      if (c.styling) parts.push(c.styling)
      else if (c.description) parts.push(c.description)
      if (c.role) parts.push(`role: ${c.role}`)

      const base = parts.join(', ')
      const prompt = `${base}, cinematic portrait, high quality, consistent art style, no text, no watermark`

      return {
        character_id: c.id,
        character_name: c.name,
        prompt,
      }
    },
  })

  // ─── 场景提示词 ───────────────────────────────────────

  const readScenes = createTool({
    id: 'read_scenes',
    description: '读取当前剧集中的所有场景信息，用于生成场景图片提示词。',
    inputSchema: z.object({}),
    execute: async () => {
      const scenes = (await db.select().from(schema.scenes)
        .where(eq(schema.scenes.dramaId, dramaId)))
        .filter(s => !s.deletedAt)
      return {
        scenes: scenes.map(s => ({
          id: s.id,
          location: s.location,
          time: s.time || '',
          prompt: s.prompt || '',
          lighting: s.lighting || '',
        })),
      }
    },
  })

  const generateScenePrompt = createTool({
    id: 'generate_scene_prompt',
    description: '为场景生成 AI 图片生成的英文提示词。',
    inputSchema: z.object({
      scene_id: z.number(),
    }),
    execute: async ({ scene_id }) => {
      const [s] = await db.select().from(schema.scenes)
        .where(eq(schema.scenes.id, scene_id))
      if (!s) return { error: 'Scene not found' }

      const parts: string[] = []
      if (s.location) parts.push(s.location)
      if (s.time) parts.push(s.time)
      if (s.prompt) parts.push(s.prompt)
      if (s.lighting) parts.push(s.lighting)

      const base = parts.join(', ')
      const prompt = `${base}, cinematic scene, atmospheric lighting, high quality, consistent art style, no text, no watermark`

      return {
        scene_id: s.id,
        location: s.location,
        prompt,
      }
    },
  })

  return {
    readCharacters,
    generateCharacterPrompt,
    readScenes,
    generateScenePrompt,
  }
}
