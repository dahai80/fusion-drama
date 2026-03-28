/**
 * Agent SSE 聊天路由
 */
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { createAgent, validAgentTypes } from '../agents/index.js'
import { success, badRequest } from '../utils/response.js'

const app = new Hono()

// POST /agent/:type/chat — SSE 流式 Agent 对话
app.post('/:type/chat', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) {
    return badRequest(c, `Invalid agent type: ${agentType}`)
  }

  const body = await c.req.json()
  const { message, drama_id, episode_id } = body

  if (!episode_id || !drama_id) {
    return badRequest(c, 'drama_id and episode_id are required')
  }

  // 每次请求创建新 agent（工具已注入 episodeId/dramaId）
  const agent = createAgent(agentType, episode_id, drama_id)
  if (!agent) return badRequest(c, 'Agent not found')

  console.log(`[Agent] ${agentType} | drama=${drama_id} episode=${episode_id} | "${message}"`)

  return streamSSE(c, async (stream) => {
    try {
      const result = await agent.stream([
        { role: 'user', content: message },
      ])

      for await (const chunk of result.fullStream) {
        if (chunk.type === 'text-delta') {
          await stream.writeSSE({
            data: JSON.stringify({ type: 'content', data: chunk.textDelta }),
          })
        } else if (chunk.type === 'tool-call') {
          console.log(`[Agent] tool_call: ${chunk.toolName}(${JSON.stringify(chunk.args).slice(0, 200)})`)
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'tool_call',
              data: JSON.stringify(chunk.args),
              tool_name: chunk.toolName,
            }),
          })
        } else if (chunk.type === 'tool-result') {
          const resultStr = chunk.result != null
            ? (typeof chunk.result === 'string' ? chunk.result : JSON.stringify(chunk.result))
            : ''
          console.log(`[Agent] tool_result: ${chunk.toolName} → ${resultStr.slice(0, 100)}`)
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'tool_result',
              data: resultStr.length > 2000 ? resultStr.slice(0, 2000) + '...[truncated]' : resultStr,
              tool_name: chunk.toolName,
            }),
          })
        }
      }

      console.log(`[Agent] ${agentType} done`)
      await stream.writeSSE({
        data: JSON.stringify({ type: 'done', data: '' }),
      })
    } catch (err: any) {
      console.error(`[Agent] ${agentType} error:`, err.message)
      await stream.writeSSE({
        data: JSON.stringify({ type: 'error', data: err.message || 'Agent execution failed' }),
      })
    }
  })
})

// GET /agent/:type/debug
app.get('/:type/debug', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) return badRequest(c, 'Invalid agent type')
  return success(c, { agent_type: agentType, valid: true })
})

export default app
