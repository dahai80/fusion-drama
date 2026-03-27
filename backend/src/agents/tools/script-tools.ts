/**
 * 剧本改写 Agent 工具
 */
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { db, schema } from '../../db/index.js'
import { eq } from 'drizzle-orm'
import { getTextConfig } from '../../services/ai.js'
import { now } from '../../utils/response.js'

// 读取剧本内容
export const readEpisodeScript = createTool({
  id: 'read_episode_script',
  description: 'Read the script content of an episode. Returns the raw story/novel text or formatted screenplay.',
  inputSchema: z.object({
    episode_id: z.number().describe('Episode ID'),
  }),
  execute: async ({ episode_id }) => {
    const [ep] = db.select().from(schema.episodes)
      .where(eq(schema.episodes.id, episode_id)).all()
    if (!ep) return { error: `Episode not found (id=${episode_id})` }

    // 优先返回原始内容，回退到格式化剧本
    const content = ep.content || ep.scriptContent
    if (!content) return { error: `Episode has no content (id=${episode_id})` }
    return { content, word_count: content.length }
  },
})

// AI 改写剧本
export const rewriteToScreenplay = createTool({
  id: 'rewrite_to_screenplay',
  description: 'Use AI to rewrite novel text into formatted screenplay format. Reads the episode content and rewrites it.',
  inputSchema: z.object({
    episode_id: z.number().describe('Episode ID to rewrite'),
    instructions: z.string().optional().describe('Additional instructions for the rewrite'),
  }),
  execute: async ({ episode_id, instructions }) => {
    const [ep] = db.select().from(schema.episodes)
      .where(eq(schema.episodes.id, episode_id)).all()
    if (!ep) return { error: `Episode not found` }

    const source = ep.content || ep.scriptContent
    if (!source) return { error: `Episode has no content to rewrite` }

    // 返回内容让 agent LLM 自己改写（工具提供数据，LLM 做改写）
    return {
      source_content: source,
      instruction: `请将以下内容改写为格式化剧本。

格式规范：
- 场景头：## S编号 | 内景/外景 · 地点 | 时间段
- 动作描写：自然段落，不包含镜头语言
- 对白：角色名：（状态/表情）台词内容
- 每个场景 30-60 秒内容

${instructions || ''}

【原始内容】
${source}`,
    }
  },
})

// 保存剧本
export const saveScript = createTool({
  id: 'save_script',
  description: 'Save the rewritten screenplay content to an episode.',
  inputSchema: z.object({
    episode_id: z.number().describe('Episode ID to save to'),
    content: z.string().describe('The formatted screenplay content to save'),
  }),
  execute: async ({ episode_id, content }) => {
    db.update(schema.episodes)
      .set({ scriptContent: content, updatedAt: now() })
      .where(eq(schema.episodes.id, episode_id))
      .run()
    return { message: `Script saved to episode ${episode_id}`, word_count: content.length }
  },
})
