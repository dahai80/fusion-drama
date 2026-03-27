/**
 * 角色/场景提取 Agent 工具
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/response.js'

// 读取剧本用于提取
export const readScriptForExtraction = createTool({
  id: 'read_script_for_extraction',
  description: 'Read the formatted screenplay of an episode for character/scene extraction.',
  inputSchema: z.object({
    episode_id: z.number().describe('Episode ID'),
  }),
  execute: async ({ episode_id }) => {
    const [ep] = db.select().from(schema.episodes)
      .where(eq(schema.episodes.id, episode_id)).all()
    if (!ep) return { error: 'Episode not found' }

    const content = ep.scriptContent || ep.content
    if (!content) return { error: 'Episode has no script content' }

    // 获取 drama_id
    return { script: content, drama_id: ep.dramaId, episode_id: ep.id }
  },
})

// 保存提取的角色
export const saveCharacters = createTool({
  id: 'save_characters',
  description: 'Save extracted characters to the database. Each character has name, role, description, appearance.',
  inputSchema: z.object({
    drama_id: z.number().describe('Drama ID'),
    characters: z.array(z.object({
      name: z.string(),
      role: z.string().optional(),
      description: z.string().optional(),
      appearance: z.string().optional(),
      personality: z.string().optional(),
    })).describe('List of characters to save'),
  }),
  execute: async ({ drama_id, characters }) => {
    const ts = now()
    let count = 0
    for (const char of characters) {
      // 检查是否已存在
      const existing = db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, drama_id))
        .all()
        .find(c => c.name === char.name)

      if (existing) {
        db.update(schema.characters)
          .set({ ...char, updatedAt: ts })
          .where(eq(schema.characters.id, existing.id))
          .run()
      } else {
        db.insert(schema.characters)
          .values({ ...char, dramaId: drama_id, createdAt: ts, updatedAt: ts })
          .run()
      }
      count++
    }
    return { message: `Saved ${count} characters`, count }
  },
})

// 保存提取的场景
export const saveScenes = createTool({
  id: 'save_scenes',
  description: 'Save extracted scenes/backgrounds to the database. Each scene has location, time, prompt.',
  inputSchema: z.object({
    drama_id: z.number().describe('Drama ID'),
    scenes: z.array(z.object({
      location: z.string(),
      time: z.string().optional(),
      prompt: z.string().optional().describe('Visual description for image generation'),
    })).describe('List of scenes to save'),
  }),
  execute: async ({ drama_id, scenes }) => {
    const ts = now()
    let count = 0
    for (const scene of scenes) {
      const existing = db.select().from(schema.scenes)
        .where(eq(schema.scenes.dramaId, drama_id))
        .all()
        .find(s => s.location === scene.location)

      if (existing) {
        db.update(schema.scenes)
          .set({ time: scene.time || existing.time, prompt: scene.prompt || existing.prompt, updatedAt: ts })
          .where(eq(schema.scenes.id, existing.id))
          .run()
      } else {
        db.insert(schema.scenes)
          .values({
            dramaId: drama_id,
            location: scene.location,
            time: scene.time || '',
            prompt: scene.prompt || scene.location,
            createdAt: ts,
            updatedAt: ts,
          })
          .run()
      }
      count++
    }
    return { message: `Saved ${count} scenes`, count }
  },
})
