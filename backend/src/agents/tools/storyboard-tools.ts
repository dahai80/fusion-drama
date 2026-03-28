/**
 * 分镜拆解 Agent 工具
 * 工厂函数模式 — 注入 episodeId + dramaId
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/response.js'

export function createStoryboardTools(episodeId: number, dramaId: number) {
  const readStoryboardContext = createTool({
    id: 'read_storyboard_context',
    description: 'Read the screenplay, characters, and scenes for storyboard breakdown.',
    inputSchema: z.object({}),
    execute: async () => {
      const [ep] = db.select().from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId)).all()
      if (!ep) return { error: 'Episode not found' }
      const script = ep.scriptContent || ep.content
      if (!script) return { error: 'Episode has no script' }

      const chars = db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, dramaId)).all()
      const scns = db.select().from(schema.scenes)
        .where(eq(schema.scenes.dramaId, dramaId)).all()

      return {
        script,
        characters: chars.map(c => ({ id: c.id, name: c.name })),
        scenes: scns.map(s => ({ id: s.id, location: s.location, time: s.time })),
      }
    },
  })

  const saveStoryboards = createTool({
    id: 'save_storyboards',
    description: 'Save generated storyboards. Replaces all existing storyboards for this episode.',
    inputSchema: z.object({
      storyboards: z.array(z.object({
        shot_number: z.number(),
        title: z.string().optional(),
        shot_type: z.string().optional(),
        angle: z.string().optional(),
        movement: z.string().optional(),
        location: z.string().optional(),
        time: z.string().optional(),
        action: z.string().optional(),
        dialogue: z.string().optional(),
        description: z.string().optional(),
        result: z.string().optional(),
        atmosphere: z.string().optional(),
        video_prompt: z.string().optional(),
        duration: z.number().optional(),
        scene_id: z.number().nullable().optional(),
      })),
    }),
    execute: async ({ storyboards }) => {
      const ts = now()
      db.delete(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId)).run()

      let totalDuration = 0
      for (const sb of storyboards) {
        db.insert(schema.storyboards).values({
          episodeId,
          storyboardNumber: sb.shot_number,
          title: sb.title, shotType: sb.shot_type,
          angle: sb.angle, movement: sb.movement,
          location: sb.location, time: sb.time,
          action: sb.action, dialogue: sb.dialogue,
          description: sb.description, result: sb.result,
          atmosphere: sb.atmosphere, videoPrompt: sb.video_prompt,
          sceneId: sb.scene_id, duration: sb.duration || 10,
          createdAt: ts, updatedAt: ts,
        }).run()
        totalDuration += sb.duration || 10
      }

      db.update(schema.episodes)
        .set({ duration: Math.ceil(totalDuration / 60), updatedAt: ts })
        .where(eq(schema.episodes.id, episodeId)).run()

      return { message: `Saved ${storyboards.length} storyboards`, count: storyboards.length, total_duration: totalDuration }
    },
  })

  const updateStoryboard = createTool({
    id: 'update_storyboard',
    description: 'Update a specific storyboard shot.',
    inputSchema: z.object({
      storyboard_id: z.number(),
      title: z.string().optional(),
      shot_type: z.string().optional(),
      video_prompt: z.string().optional(),
      description: z.string().optional(),
      dialogue: z.string().optional(),
      duration: z.number().optional(),
    }),
    execute: async ({ storyboard_id, ...fields }) => {
      const updates: Record<string, any> = { updatedAt: now() }
      if (fields.title) updates.title = fields.title
      if (fields.shot_type) updates.shotType = fields.shot_type
      if (fields.video_prompt) updates.videoPrompt = fields.video_prompt
      if (fields.description) updates.description = fields.description
      if (fields.dialogue) updates.dialogue = fields.dialogue
      if (fields.duration) updates.duration = fields.duration
      db.update(schema.storyboards).set(updates).where(eq(schema.storyboards.id, storyboard_id)).run()
      return { message: `Storyboard ${storyboard_id} updated` }
    },
  })

  return { readStoryboardContext, saveStoryboards, updateStoryboard }
}
