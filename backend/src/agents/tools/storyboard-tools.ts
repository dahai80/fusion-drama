/**
 * 分镜拆解 Agent 工具
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/response.js'

// 读取剧本 + 角色 + 场景（为分镜拆解提供完整上下文）
export const readStoryboardContext = createTool({
  id: 'read_storyboard_context',
  description: 'Read the formatted screenplay, characters, and scenes for storyboard breakdown.',
  inputSchema: z.object({
    episode_id: z.number().describe('Episode ID'),
  }),
  execute: async ({ episode_id }) => {
    const [ep] = db.select().from(schema.episodes)
      .where(eq(schema.episodes.id, episode_id)).all()
    if (!ep) return { error: 'Episode not found' }

    const script = ep.scriptContent || ep.content
    if (!script) return { error: 'Episode has no script' }

    const chars = db.select().from(schema.characters)
      .where(eq(schema.characters.dramaId, ep.dramaId)).all()
    const scns = db.select().from(schema.scenes)
      .where(eq(schema.scenes.dramaId, ep.dramaId)).all()

    return {
      script,
      drama_id: ep.dramaId,
      episode_id: ep.id,
      characters: chars.map(c => ({ id: c.id, name: c.name })),
      scenes: scns.map(s => ({ id: s.id, location: s.location, time: s.time })),
    }
  },
})

// 保存分镜列表
export const saveStoryboards = createTool({
  id: 'save_storyboards',
  description: 'Save generated storyboards to the database. Replaces existing storyboards for the episode.',
  inputSchema: z.object({
    episode_id: z.number().describe('Episode ID'),
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
      characters: z.array(z.number()).optional(),
    })).describe('List of storyboard shots'),
  }),
  execute: async ({ episode_id, storyboards }) => {
    const ts = now()

    // 删除旧分镜
    db.delete(schema.storyboards)
      .where(eq(schema.storyboards.episodeId, episode_id))
      .run()

    // 插入新分镜
    let totalDuration = 0
    for (const sb of storyboards) {
      db.insert(schema.storyboards).values({
        episodeId: episode_id,
        storyboardNumber: sb.shot_number,
        title: sb.title,
        shotType: sb.shot_type,
        angle: sb.angle,
        movement: sb.movement,
        location: sb.location,
        time: sb.time,
        action: sb.action,
        dialogue: sb.dialogue,
        description: sb.description,
        result: sb.result,
        atmosphere: sb.atmosphere,
        videoPrompt: sb.video_prompt,
        sceneId: sb.scene_id,
        duration: sb.duration || 10,
        createdAt: ts,
        updatedAt: ts,
      }).run()
      totalDuration += sb.duration || 10
    }

    // 更新 episode 时长
    db.update(schema.episodes)
      .set({ duration: Math.ceil(totalDuration / 60), updatedAt: ts })
      .where(eq(schema.episodes.id, episode_id))
      .run()

    return {
      message: `Saved ${storyboards.length} storyboards`,
      count: storyboards.length,
      total_duration: totalDuration,
    }
  },
})

// 更新单个分镜
export const updateStoryboard = createTool({
  id: 'update_storyboard',
  description: 'Update a specific storyboard shot.',
  inputSchema: z.object({
    storyboard_id: z.number().describe('Storyboard ID'),
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

    db.update(schema.storyboards)
      .set(updates)
      .where(eq(schema.storyboards.id, storyboard_id))
      .run()

    return { message: `Storyboard ${storyboard_id} updated` }
  },
})
