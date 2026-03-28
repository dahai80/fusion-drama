/**
 * 角色/场景提取 Agent 工具
 * 工厂函数模式 — 注入 episodeId + dramaId
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/response.js'

export function createExtractTools(episodeId: number, dramaId: number) {
  const readScriptForExtraction = createTool({
    id: 'read_script_for_extraction',
    description: 'Read the formatted screenplay for character/scene extraction.',
    inputSchema: z.object({}),
    execute: async () => {
      const [ep] = db.select().from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId)).all()
      if (!ep) return { error: 'Episode not found' }
      const content = ep.scriptContent || ep.content
      if (!content) return { error: 'Episode has no script content' }
      return { script: content }
    },
  })

  const saveCharacters = createTool({
    id: 'save_characters',
    description: 'Save extracted characters. Each character needs: name, role, description, appearance, personality.',
    inputSchema: z.object({
      characters: z.array(z.object({
        name: z.string(),
        role: z.string().optional(),
        description: z.string().optional(),
        appearance: z.string().optional(),
        personality: z.string().optional(),
      })),
    }),
    execute: async ({ characters }) => {
      const ts = now()
      let count = 0
      for (const char of characters) {
        const existing = db.select().from(schema.characters)
          .where(eq(schema.characters.dramaId, dramaId)).all()
          .find(c => c.name === char.name)
        if (existing) {
          db.update(schema.characters).set({ ...char, updatedAt: ts })
            .where(eq(schema.characters.id, existing.id)).run()
        } else {
          db.insert(schema.characters).values({ ...char, dramaId, createdAt: ts, updatedAt: ts }).run()
        }
        count++
      }
      return { message: `Saved ${count} characters`, count }
    },
  })

  const saveScenes = createTool({
    id: 'save_scenes',
    description: 'Save extracted scenes. Each scene needs: location, time, prompt (visual description).',
    inputSchema: z.object({
      scenes: z.array(z.object({
        location: z.string(),
        time: z.string().optional(),
        prompt: z.string().optional(),
      })),
    }),
    execute: async ({ scenes }) => {
      const ts = now()
      let count = 0
      for (const scene of scenes) {
        const existing = db.select().from(schema.scenes)
          .where(eq(schema.scenes.dramaId, dramaId)).all()
          .find(s => s.location === scene.location)
        if (existing) {
          db.update(schema.scenes).set({
            time: scene.time || existing.time,
            prompt: scene.prompt || existing.prompt,
            updatedAt: ts,
          }).where(eq(schema.scenes.id, existing.id)).run()
        } else {
          db.insert(schema.scenes).values({
            dramaId, location: scene.location,
            time: scene.time || '', prompt: scene.prompt || scene.location,
            createdAt: ts, updatedAt: ts,
          }).run()
        }
        count++
      }
      return { message: `Saved ${count} scenes`, count }
    },
  })

  return { readScriptForExtraction, saveCharacters, saveScenes }
}
