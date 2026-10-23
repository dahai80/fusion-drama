/**
 * Agent 聊天路由 — 非流式版本
 */
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { validAgentTypes } from '../agents/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { enqueueGpuWork } from '../services/gpu-queue.js'
import { isRagEnabled } from '../services/app-settings.js'
import { buildRagContextBlock } from '../services/rag.js'
import { mastra } from '../mastra/index.js'
import { db, schema } from '../db/index.js'
import { now } from '../utils/response.js'
import { success, badRequest } from '../utils/response.js'
import { logTaskError, logTaskPayload, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { appendEpisodeEvent } from '../utils/task-events.js'

const app = new Hono()

// Mastra v1.17 的 ToolCallChunk / ToolResultChunk 结构：
// { type: 'tool-call', payload: { toolCallId, toolName, args } }
// { type: 'tool-result', payload: { toolCallId, toolName, result, isError } }
function normalizeToolName(entry: any) {
  return entry?.payload?.toolName
    || entry?.toolName
    || entry?.tool?.toolName
    || entry?.tool?.id
    || entry?.name
    || entry?.type
    || null
}

function normalizeToolResult(entry: any) {
  const result = entry?.payload?.result ?? entry?.result ?? entry?.payload?.output ?? entry?.output ?? entry?.data ?? null
  return typeof result === 'string' ? result : JSON.stringify(result)
}

// POST /agent/:type/chat — 非流式 Agent 对话
app.post('/:type/chat', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) {
    return badRequest(c, `无效的 Agent 类型：${agentType}`)
  }

  const body = await c.req.json()
  const { message, drama_id, episode_id } = body

  logTaskStart('Agent', agentType, {
    dramaId: drama_id,
    episodeId: episode_id,
    message,
  })
  logTaskPayload('Agent', `${agentType} input`, body)

  if (!episode_id || !drama_id) {
    logTaskError('Agent', agentType, { reason: 'missing drama_id or episode_id' })
    return badRequest(c, '需要 drama_id 与 episode_id')
  }

  const agent = mastra.getAgent(agentType)
  if (!agent) {
    logTaskError('Agent', agentType, { reason: 'agent not found' })
    return badRequest(c, 'Agent 不存在')
  }

  const requestContext = buildAgentRequestContext({
    episodeId: episode_id,
    dramaId: drama_id,
    modelOverride: body.model || undefined,
    textConfigId: body.config_id || undefined,
  })

  const startTime = performance.now()

  // FR-P1-1: agent_started/agent_finished 事件（episode 维度，SSE 回放；thinking 级
  // 事件由 instrumentTools 的 tool_call/tool_result 承载）
  void appendEpisodeEvent(episode_id, 'agent_started', { agent: agentType })

  try {
    // ONNX RAG：CPU 向量检索本 drama 的剧本/角色/场景/道具，作为背景块前缀注入用户消息。
    // 关闭/模型缺失/无索引时 buildRagContextBlock 返回 null，消息原样发送，不阻断主流程
    let ragBlock: string | null = null
    if (isRagEnabled()) {
      try {
        ragBlock = await buildRagContextBlock(drama_id, message)
      } catch (e: any) {
        logTaskWarn('Agent', 'rag-context-failed', { dramaId: drama_id, error: e?.message })
      }
    }
    const userContent = ragBlock ? `${ragBlock}\n\n${message}` : message

    // Agent 推理打文本模型（Qwen3.5 decode burst），与图片/视频生成共用 GPU 串行队列，
    // 避免与 LTX-2.5/FLUX 并发争用触发 Metal crash（见 gpu-queue.ts 注释）
    const result = await enqueueGpuWork(`Agent-${agentType}`, () => agent.generate(
      [{ role: 'user', content: userContent }],
      { maxSteps: 20, requestContext },
    ))
    void appendEpisodeEvent(episode_id, 'agent_finished', { agent: agentType, ok: true, ms: Math.round(performance.now() - startTime) })

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    logTaskSuccess('Agent', agentType, { elapsedSeconds: elapsed })

    // 收集所有 tool calls 和 results
    const toolCalls = result.toolCalls || []
    const toolResults = result.toolResults || []
    const normalizedToolCalls = toolCalls.map((tc: any) => ({
      toolName: normalizeToolName(tc),
      args: tc?.payload?.args ?? tc?.args ?? tc?.input ?? null,
    }))
    const normalizedToolResults = toolResults.map((tr: any) => ({
      toolName: normalizeToolName(tr),
      result: normalizeToolResult(tr),
    }))

    logTaskProgress('Agent', 'tool-summary', {
      agentType,
      toolCalls: normalizedToolCalls.map((tc: any) => tc.toolName),
      toolResults: normalizedToolResults.map((tr: any) => tr.toolName),
    })
    logTaskPayload('Agent', `${agentType} tool-results`, normalizedToolResults)

    // script_rewriter 兜底：小模型（Qwen3.5-4B）常生成完整剧本在 text 但不调 save_script，
    // 直接返回导致 script_content 空。检测 text 以「## S」开头（格式化剧本场景头）且未调
    // save_script 时自动落库，避免 E2E 断链。
    if (agentType === 'script_rewriter') {
      const calledSave = normalizedToolCalls.some((tc: any) => tc.toolName === 'save_script' || tc.toolName === 'saveScript')
      const text = (result.text || '').trim()
      if (!calledSave && /^##\s*S\d/.test(text) && text.length > 200) {
        try {
          await db.update(schema.episodes).set({ scriptContent: text, updatedAt: now() })
            .where(eq(schema.episodes.id, episode_id))
          logTaskWarn('Agent', 'script-autosave', { episodeId: episode_id, reason: 'save_script not called, text looks like screenplay', len: text.length })
        } catch (e: any) {
          logTaskError('Agent', 'script-autosave', { episodeId: episode_id, error: e?.message })
        }
      }
    }

    return success(c, {
      type: 'done',
      text: result.text || '',
      toolCalls: normalizedToolCalls,
      toolResults: normalizedToolResults,
    })
  } catch (err: any) {
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
    logTaskError('Agent', agentType, { elapsedSeconds: elapsed, error: err.message })
    void appendEpisodeEvent(episode_id, 'agent_finished', { agent: agentType, ok: false, ms: Math.round(performance.now() - startTime), error: String(err.message || '').slice(0, 300) })
    console.error(err.stack || err)
    return badRequest(c, err.message || 'Agent 执行失败')
  }
})

// GET /agent/:type/debug
app.get('/:type/debug', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) return badRequest(c, '无效的 Agent 类型')
  return success(c, { agent_type: agentType, valid: true })
})

export default app
