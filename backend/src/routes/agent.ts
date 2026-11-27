/**
 * Agent chat routes — non-streaming + SSE streaming versions
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

// Mastra v1.17 ToolCallChunk / ToolResultChunk shape:
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

// POST /agent/:type/chat — non-streaming agent chat
app.post('/:type/chat', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) {
    // i18n: user-facing
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
    // i18n: user-facing
    return badRequest(c, '需要 drama_id 与 episode_id')
  }

  const agent = mastra.getAgent(agentType)
  if (!agent) {
    logTaskError('Agent', agentType, { reason: 'agent not found' })
    // i18n: user-facing
    return badRequest(c, 'Agent 不存在')
  }

  const requestContext = buildAgentRequestContext({
    episodeId: episode_id,
    dramaId: drama_id,
    modelOverride: body.model || undefined,
    textConfigId: body.config_id || undefined,
  })

  const startTime = performance.now()

  // FR-P1-1: agent_started/agent_finished events (episode-level, SSE replay; thinking-level
  // events are carried by instrumentTools' tool_call/tool_result)
  void appendEpisodeEvent(episode_id, 'agent_started', { agent: agentType })

  try {
    // ONNX RAG: CPU vector retrieval over this drama's script/characters/scenes/props, injected
    // as a background block prefix on the user message. When disabled/model missing/no index,
    // buildRagContextBlock returns null and the message is sent as-is, never blocking the main flow
    let ragBlock: string | null = null
    if (isRagEnabled()) {
      try {
        ragBlock = await buildRagContextBlock(drama_id, message)
      } catch (e: any) {
        logTaskWarn('Agent', 'rag-context-failed', { dramaId: drama_id, error: e?.message })
      }
    }
    // Cross-session memory (fusion-memory): retrieve preferences/decisions from prior sessions
    // injected as a memory block, placed before the RAG block. Returns null when fm-server is
    // down or times out, never blocking
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

    // Agent inference hits the text model (Qwen3.5 decode burst); it shares the GPU serial queue
    // with image/video generation to avoid concurrent contention with LTX-2.5/FLUX triggering
    // Metal crash (see gpu-queue.ts comments)
    const result = await enqueueGpuWork(`Agent-${agentType}`, () => agent.generate(
      [{ role: 'user', content: userContent }],
      { maxSteps: 20, requestContext },
    ))
    void appendEpisodeEvent(episode_id, 'agent_finished', { agent: agentType, ok: true, ms: Math.round(performance.now() - startTime) })

    // Supervisor layer: the supervisor prompt re-reviews agent output (text model runs inside
    // the same GPU serial queue). On review failure/disabled, verdict.degraded=true passes it through unchanged
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

    // Cross-session memory write: async commit to fusion-memory; failure only warns, never affects the response
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

    // Collect all tool calls and results
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

    // script_rewriter fallback: small models (Qwen3.5-4B) often produce the full screenplay in
    // text without calling save_script; returning directly leaves script_content empty. When text
    // starts with "## S" (formatted screenplay scene header) and save_script was not called,
    // auto-persist to DB to avoid a broken E2E chain.
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
    // i18n: user-facing
    return badRequest(c, err.message || 'Agent 执行失败')
  }
})

// GET /agent/:type/debug
app.get('/:type/debug', async (c) => {
  const agentType = c.req.param('type')
  // i18n: user-facing
  if (!validAgentTypes.includes(agentType)) return badRequest(c, '无效的 Agent 类型')
  return success(c, { agent_type: agentType, valid: true })
})

// Mastra ChunkType → frontend SSE events (only surfacing what is worth displaying:
// text deltas / tool calls / tool results)
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

// POST /agent/:type/chat/stream — SSE streaming version: intermediate steps (tool calls/text
// deltas) pushed in real time; the done event carries the full result (same shape as the
// non-streaming response: text/toolCalls/toolResults/review).
// The GPU serial queue covers the entire stream consumption period; supervisor review / memory
// write / event stream are identical to the non-streaming version
app.post('/:type/chat/stream', async (c) => {
  const agentType = c.req.param('type')
  if (!validAgentTypes.includes(agentType)) {
    // i18n: user-facing
    return badRequest(c, `无效的 Agent 类型：${agentType}`)
  }
  const body = await c.req.json()
  const { message, drama_id, episode_id } = body
  logTaskStart('Agent', `${agentType}(stream)`, { dramaId: drama_id, episodeId: episode_id, message })
  if (!episode_id || !drama_id) {
    logTaskError('Agent', `${agentType}(stream)`, { reason: 'missing drama_id or episode_id' })
    // i18n: user-facing
    return badRequest(c, '需要 drama_id 与 episode_id')
  }
  const agent = mastra.getAgent(agentType)
  if (!agent) {
    logTaskError('Agent', `${agentType}(stream)`, { reason: 'agent not found' })
    // i18n: user-facing
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

  // Context prefix (cross-session memory + RAG) matches the non-streaming version: memory first, user content takes priority
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

      // Supervisor review + memory write: identical to the non-streaming version
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

      // script_rewriter fallback (same as non-streaming): auto-persist when text looks like a screenplay and save_script was not called
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
