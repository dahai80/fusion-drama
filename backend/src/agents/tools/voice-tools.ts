/**
 * 角色音色分配 Agent 工具
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { now } from '../../utils/response.js'

export function createVoiceTools(episodeId: number, dramaId: number) {
  const getCharacters = createTool({
    id: 'get_characters',
    description: 'Get all characters for the current drama with their current voice assignments.',
    inputSchema: z.object({}),
    execute: async () => {
      const chars = db.select().from(schema.characters)
        .where(eq(schema.characters.dramaId, dramaId)).all()
      return {
        characters: chars.map(c => ({
          id: c.id,
          name: c.name,
          role: c.role,
          personality: c.personality,
          description: c.description,
          current_voice: c.voiceStyle || '未分配',
        })),
      }
    },
  })

  const listVoices = createTool({
    id: 'list_voices',
    description: 'List all available voice options for TTS.',
    inputSchema: z.object({}),
    execute: async () => ({
      voices: [
        { id: 'alloy', gender: '中性', traits: '平衡自然', suitable_for: '旁白、通用' },
        { id: 'echo', gender: '男', traits: '低沉稳重', suitable_for: '成熟男性、旁白' },
        { id: 'fable', gender: '男', traits: '温暖富有表现力', suitable_for: '年轻男性、故事叙述' },
        { id: 'onyx', gender: '男', traits: '深沉有力', suitable_for: '权威角色、反派' },
        { id: 'nova', gender: '女', traits: '温柔甜美', suitable_for: '年轻女性、女主' },
        { id: 'shimmer', gender: '女', traits: '明亮活泼', suitable_for: '活泼女性、少女' },
      ],
      instruction: '根据角色的性别、性格、年龄来匹配最合适的音色。',
    }),
  })

  const assignVoice = createTool({
    id: 'assign_voice',
    description: 'Assign a voice to a character.',
    inputSchema: z.object({
      character_id: z.number().describe('Character ID'),
      voice_id: z.string().describe('Voice ID from list_voices'),
      reason: z.string().optional().describe('Why this voice fits'),
    }),
    execute: async ({ character_id, voice_id, reason }) => {
      db.update(schema.characters)
        .set({ voiceStyle: voice_id, voiceProvider: voice_id, updatedAt: now() })
        .where(eq(schema.characters.id, character_id))
        .run()
      return { message: `Assigned voice "${voice_id}" to character ${character_id}`, reason }
    },
  })

  return { getCharacters, listVoices, assignVoice }
}
