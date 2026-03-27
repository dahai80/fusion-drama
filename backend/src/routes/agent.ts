/**
 * Agent SSE 聊天路由
 */
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { getAgent, validAgentTypes } from '../agents/index.js'
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

  const agent = getAgent(agentType)
  if (!agent) return badRequest(c, 'Agent not found')

  // 构建消息，注入上下文
  const contextInfo = `[Context: drama_id=${drama_id}, episode_id=${episode_id}]`
  const fullMessage = `${contextInfo}\n\n${message}`

  return streamSSE(c, async (stream) => {
    try {
      const result = await agent.stream([
        { role: 'user', content: fullMessage },
      ])

      // Stream fullStream for tool calls + text
      for await (const chunk of result.fullStream) {
        if (chunk.type === 'text-delta') {
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'content',
              data: chunk.textDelta,
            }),
          })
        } else if (chunk.type === 'tool-call') {
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'tool_call',
              data: JSON.stringify(chunk.args),
              tool_name: chunk.toolName,
            }),
          })
        } else if (chunk.type === 'tool-result') {
          const resultStr = typeof chunk.result === 'string'
            ? chunk.result
            : JSON.stringify(chunk.result)
          await stream.writeSSE({
            data: JSON.stringify({
              type: 'tool_result',
              data: resultStr.length > 2000 ? resultStr.slice(0, 2000) + '...[truncated]' : resultStr,
              tool_name: chunk.toolName,
            }),
          })
        }
      }

      // Done
      await stream.writeSSE({
        data: JSON.stringify({ type: 'done', data: '' }),
      })
    } catch (err: any) {
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'error',
          data: err.message || 'Agent execution failed',
        }),
      })
    }
  })
})

// GET /agent/:type/debug
app.get('/:type/debug', async (c) => {
  const agentType = c.req.param('type')
  const agent = getAgent(agentType)
  if (!agent) return badRequest(c, 'Invalid agent type')

  return success(c, {
    agent_type: agentType,
    name: agent.name,
    tools: Object.keys(agent.tools || {}),
  })
})

export default app
