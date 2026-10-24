/**
 * Agent 聊天路由 — 非流式 + SSE 流式两个版本
 */
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { eq } from 'drizzle-orm'
import { validAgentTypes } from '../agents/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { enqueueGpuWork } from '../services/gpu-queue.js'
import { isRagEnabled, isMemoryEnabled, isSupervisorEnabled } from '../services/app-settings.js'
import { buildRagContextBlock } from '../services/rag.js'
import { retrieveMemoryContext, commitAgentMemory } from '../services/agent-memory.js'
import { reviewAgentOutput } from '../services/supervisor.js'
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
    // 跨会话记忆（fusion-memory）：检索此前会话的偏好/决定注入为记忆块，置于 RAG 块之前。
    // fm-server 未启/超时返回 null，不阻断
    let memoryBlock: string | null = null
    if (isMemoryEnabled()) {
      try {
        memoryBlock = await retrieveMemoryContext(message)
        if (memoryBlock) logTaskProgress('Agent', 'memory-context-injected', { agentType, dramaId: drama_id, len: memoryBlock.length })
      } catch (e: any) {
        logTaskWarn('Agent', 'memory-context-failed', { dramaId: drama_id, error: e?.message })
      }
    }
    const contextPrefix = [memoryBlock, ragBlock].filter(Boolean).join('\n\n')
    const userContent = contextPrefix ? `${contextPrefix}\n\n${message}` : message

    // Agent 推理打文本模型（Qwen3.5 decode burst），与图片/视频生成共用 GPU 串行队列，
    // 避免与 LTX-2.5/FLUX 并发争用触发 Metal crash（见 gpu-queue.ts 注释）
    const result = await enqueueGpuWork(`Agent-${agentType}`, () => agent.generate(
      [{ role: 'user', content: userContent }],
      { maxSteps: 20, requestContext },
    ))
    void appendEpisodeEvent(episode_id, 'agent_finished', { agent: agentType, ok: true, ms: Math.round(performance.now() - startTime) })

    // 监督层：supervisor prompt 复审 Agent 产出（同一 GPU 串行队列内跑文本模型）。
    // 审阅失败/关闭时 verdict.degraded=true 原样放行
    let review = null
    if (isSupervisorEnabled()) {
      const verdict = await enqueueGpuWork(`Supervisor-${agentType}`, () =>
        reviewAgentOutput(agentType, message, result.text || ''))
      review = verdict
      void appendEpisodeEvent(episode_id, 'agent_reviewed', {
        agent: agentType, pass: verdict.pass, degraded: verdict.degraded,
        issues: verdict.issues, summary: verdict.summary,
      })
    }

    // 跨会话记忆写入：异步落 fusion-memory，失败仅告警不影响响应
    if (isMemoryEnabled() && (result.text || '').trim()) {
      void commitAgentMemory({
        agentType, dramaId: drama_id, episodeId: episode_id,
        userMessage: message, assistantMessage: result.text || '',
      }).then(ok => {
        if (!ok) logTaskWarn('Agent', 'memory-commit-skipped', { agentType, dramaId: drama_id })
      })
    }

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
      review,
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

// Mastra ChunkType → 前端 SSE 事件（只透出有展示价值的：文本增量/工具调用/工具结果）
function sseEventFromChunk(chunk: any): { event: string, data: string } | null {
    const p = chunk?.payload || {}
    switch (chunk?.type) {
        case 'text-delta':
            return p.text ? { event: 'delta', data: JSON.stringify({ text: String(p.text) }) } : null
        case 'tool-call':
            return { event: 'tool', data: JSON.stringify({ toolName: p.toolName ?? null }) }
        case 'tool-result':
            return { event: 'tool_result', data: JSON.stringify({ toolName: p.toolName ?? null }) }
        default:
            return null
    }
}

// POST /agent/:type/chat/stream — SSE 流式版：中间步骤（工具调用/文本增量）实时推送，
// done 事件带完整结果（与非流式响应同构：text/toolCalls/toolResults/review）。
// GPU 串行队列覆盖整个流消费期；监督复审/记忆写入/事件流与非流式版完全一致
app.post('/:type/chat/stream', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) {
    return badRequest(c, `无效的 Agent 类型：${agentType}`)
  }
  const body = await c.req.json()
  const { message, drama_id, episode_id } = body
  logTaskStart('Agent', `${agentType}(stream)`, { dramaId: drama_id, episodeId: episode_id, message })
  if (!episode_id || !drama_id) {
    logTaskError('Agent', `${agentType}(stream)`, { reason: 'missing drama_id or episode_id' })
    return badRequest(c, '需要 drama_id 与 episode_id')
  }
  const agent = mastra.getAgent(agentType)
  if (!agent) {
    logTaskError('Agent', `${agentType}(stream)`, { reason: 'agent not found' })
    return badRequest(c, 'Agent 不存在')
  }
  const requestContext = buildAgentRequestContext({
    episodeId: episode_id,
    dramaId: drama_id,
    modelOverride: body.model || undefined,
    textConfigId: body.config_id || undefined,
  })
  const startTime = performance.now()
  void appendEpisodeEvent(episode_id, 'agent_started', { agent: agentType })

  // 上下文前缀（跨会话记忆 + RAG）与非流式版一致：记忆在前，用户要求优先
  let ragBlock: string | null = null
  if (isRagEnabled()) {
    try {
      ragBlock = await buildRagContextBlock(drama_id, message)
    } catch (e: any) {
      logTaskWarn('Agent', 'rag-context-failed', { dramaId: drama_id, error: e?.message })
    }
  }
  let memoryBlock: string | null = null
  if (isMemoryEnabled()) {
    try {
      memoryBlock = await retrieveMemoryContext(message)
      if (memoryBlock) logTaskProgress('Agent', 'memory-context-injected', { agentType, dramaId: drama_id, len: memoryBlock.length })
    } catch (e: any) {
      logTaskWarn('Agent', 'memory-context-failed', { dramaId: drama_id, error: e?.message })
    }
  }
  const contextPrefix = [memoryBlock, ragBlock].filter(Boolean).join('\n\n')
  const userContent = contextPrefix ? `${contextPrefix}\n\n${message}` : message

  return streamSSE(c, async (stream) => {
    try {
      const out = await enqueueGpuWork(`Agent-${agentType}`, async () => {
        const result = await agent.stream(
          [{ role: 'user', content: userContent }],
          { maxSteps: 20, requestContext },
        )
        const reader = (result.fullStream as ReadableStream<any>).getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          const evt = sseEventFromChunk(value)
          if (evt) await stream.writeSSE(evt)
        }
        return result
      })
      const text = await out.text
      const toolCalls = (await out.toolCalls) || []
      const toolResults = (await out.toolResults) || []
      const normalizedToolCalls = toolCalls.map((tc: any) => ({
        toolName: normalizeToolName(tc),
        args: tc?.payload?.args ?? tc?.args ?? tc?.input ?? null,
      }))
      const normalizedToolResults = toolResults.map((tr: any) => ({
        toolName: normalizeToolName(tr),
        result: normalizeToolResult(tr),
      }))
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
      logTaskProgress('Agent', 'stream-tool-summary', {
        agentType,
        toolCalls: normalizedToolCalls.map((tc: any) => tc.toolName),
      })
      void appendEpisodeEvent(episode_id, 'agent_finished', { agent: agentType, ok: true, ms: Math.round(performance.now() - startTime) })

      // 监督复审 + 记忆写入：与非流式版一致
      let review = null
      if (isSupervisorEnabled()) {
        const verdict = await enqueueGpuWork(`Supervisor-${agentType}`, () =>
          reviewAgentOutput(agentType, message, text || ''))
        review = verdict
        void appendEpisodeEvent(episode_id, 'agent_reviewed', {
          agent: agentType, pass: verdict.pass, degraded: verdict.degraded,
          issues: verdict.issues, summary: verdict.summary,
        })
      }
      if (isMemoryEnabled() && (text || '').trim()) {
        void commitAgentMemory({
          agentType, dramaId: drama_id, episodeId: episode_id,
          userMessage: message, assistantMessage: text || '',
        }).then(ok => {
          if (!ok) logTaskWarn('Agent', 'memory-commit-skipped', { agentType, dramaId: drama_id })
        })
      }

      // script_rewriter 兜底（同非流式版）：text 形似剧本且未调 save_script 时自动落库
      if (agentType === 'script_rewriter') {
        const calledSave = normalizedToolCalls.some((tc: any) => tc.toolName === 'save_script' || tc.toolName === 'saveScript')
        const trimmed = (text || '').trim()
        if (!calledSave && /^##\s*S\d/.test(trimmed) && trimmed.length > 200) {
          try {
            await db.update(schema.episodes).set({ scriptContent: trimmed, updatedAt: now() })
              .where(eq(schema.episodes.id, episode_id))
            logTaskWarn('Agent', 'script-autosave', { episodeId: episode_id, reason: 'save_script not called, text looks like screenplay', len: trimmed.length })
          } catch (e: any) {
            logTaskError('Agent', 'script-autosave', { episodeId: episode_id, error: e?.message })
          }
        }
      }

      logTaskSuccess('Agent', `${agentType}(stream)`, { elapsedSeconds: elapsed })
      await stream.writeSSE({ event: 'done', data: JSON.stringify({
        type: 'done', text: text || '', toolCalls: normalizedToolCalls, toolResults: normalizedToolResults, review,
      }) })
    } catch (err: any) {
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1)
      logTaskError('Agent', `${agentType}(stream)`, { elapsedSeconds: elapsed, error: err.message })
      void appendEpisodeEvent(episode_id, 'agent_finished', { agent: agentType, ok: false, ms: Math.round(performance.now() - startTime), error: String(err.message || '').slice(0, 300) })
      console.error(err.stack || err)
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ type: 'error', message: String(err?.message || err).slice(0, 500) }) })
    }
  })
})

export default app
