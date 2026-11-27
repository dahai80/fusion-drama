/**
 * Asset extraction task — async, tracked at (episode x target) granularity.
 * Characters / scenes / props can each be extracted separately; the three share the GPU serial
 * queue (same lock as media generation): 3 concurrent Agents hitting Qwen3.5 + resident FLUX
 * → GPU contention → Metal command buffer crash → fusion-mlx SIGTERM hang. After serialization
 * only one GPU-heavy task runs at any moment.
 * Dual-track task state: running state lives in an in-process Map (dedup + realtime) and is also
 * persisted to sys_task (type=extract) — the startup sweep after a restart marks stale rows failed
 * and status queries fall back to the DB, so the frontend no longer sees "no such task".
 */
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { extractTools } from '../agents/tools/extract-tools.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { enqueueGpuWork } from './gpu-queue.js'
import { getActiveConfig, getTextProviderBaseUrl } from './ai.js'
import { db, getInsertId, schema } from '../db/index.js'
import { and, desc, eq } from 'drizzle-orm'

export type ExtractTarget = 'characters' | 'scenes' | 'props'
export const EXTRACT_TARGETS: ExtractTarget[] = ['characters', 'scenes', 'props']

export interface ExtractTask {
  status: 'running' | 'done' | 'error'
  started_at: string
  finished_at?: string
  error?: string
}

const tasks = new Map<string, ExtractTask>()
const keyOf = (episodeId: number, target: string) => `${episodeId}:${target}`

/** Per-target extraction instruction: restrict to that type only, and require dedup/merge with existing data */
// i18n: user-facing — LLM prompt text (product behavior)
const EXTRACT_MESSAGES: Record<ExtractTarget, string> = {
  characters: '请从本集剧本中提取所有角色信息（外貌需融合性格、含妆造），先用 read_existing_characters 读取项目已有角色，同名或近名（带括号定位/别名，如「林小雨（主角）」与「林小雨」）直接复用已有、不要重复创建，再用 save_dedup_characters 保存。本次只提取角色，不要提取场景和道具。', // i18n: user-facing
  scenes: '请从本集剧本中提取所有场景信息（地点、时间、光影等），先用 read_existing_scenes 读取已有场景去重，再用 save_dedup_scenes 保存。本次只提取场景，不要提取角色和道具。', // i18n: user-facing
  props: '请从本集剧本中提取关键道具（直接推动剧情且值得单独生成图片的物品，如凶器、信物、关键文件等，最多3个）。不要输出分析文字，直接调用 save_dedup_props 工具保存。没有符合条件的就传空数组。description 只记录物品外貌（材质、颜色、形状等）。先用 read_existing_props 读取已有道具去重，再调 save_dedup_props 保存。本次只提取道具。', // i18n: user-facing
}

const SAVE_TOOL_MAP: Record<ExtractTarget, { snakeName: string; tool: any }> = {
  characters: { snakeName: 'save_dedup_characters', tool: extractTools.saveDedupCharacters },
  scenes: { snakeName: 'save_dedup_scenes', tool: extractTools.saveDedupScenes },
  props: { snakeName: 'save_dedup_props', tool: extractTools.saveDedupProps },
}

function camelFromSnake(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

/** Extracts a complete JSON value from raw text via bracket matching (small models often drop closing tags or trail extra text) */
export function extractJson(raw: string): any | null {
    const start = raw.search(/[[{]/)
    if (start < 0) return null
    const open = raw[start]
    const close = open === '[' ? ']' : '}'
    let depth = 0
    let inStr = false
    let escape = false
    for (let i = start; i < raw.length; i++) {
        const ch = raw[i]
        if (escape) { escape = false; continue }
        if (ch === '\\') { escape = true; continue }
        if (ch === '"') { inStr = !inStr; continue }
        if (inStr) continue
        if (ch === open) depth++
        else if (ch === close) {
            depth--
            if (depth === 0) {
                const candidate = raw.slice(start, i + 1)
                try { return JSON.parse(candidate) } catch {}
                try { return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1')) } catch {}
            }
        }
    }
    if (open === '[') {
        let lastCompleteObj = -1
        depth = 0
        inStr = false
        escape = false
        for (let i = start + 1; i < raw.length; i++) {
            const ch = raw[i]
            if (escape) { escape = false; continue }
            if (ch === '\\') { escape = true; continue }
            if (ch === '"') { inStr = !inStr; continue }
            if (inStr) continue
            if (ch === '{') depth++
            else if (ch === '}') {
                depth--
                if (depth === 0) lastCompleteObj = i
            }
        }
        if (lastCompleteObj > 0) {
            const repaired = raw.slice(start, lastCompleteObj + 1) + ']'
            try { return JSON.parse(repaired) } catch {}
            try { return JSON.parse(repaired.replace(/,\s*([}\]])/g, '$1')) } catch {}
            logTaskWarn('Extract', 'text-toolcall-truncated-repair', { originalLen: raw.length, repairedLen: repaired.length })
        }
    }
    return null
}

/**
 * Direct LLM props extraction: bypasses the Mastra Agent and calls the fusion-mlx text model directly.
 * 4-bit Qwen3.5-4B running a Mastra Agent multi-step tool loop is unreliable —
 * 1) outputs long prose analysis instead of calling save_dedup_props; 2) calls mastra_workspace_* instead of
 * the extract tools; 3) the 4th request triggers a scheduler deadlock (corrupted prefix-cache blocks, waiting=1 running=0).
 * A single direct LLM call + JSON output bypasses all three problems.
 */
async function directPropsExtraction(episodeId: number, dramaId: number, requestContext: any): Promise<{ directCall: true; propsCount: number; text: string }> {
    logTaskProgress('Extract', 'props-direct-llm', { episodeId })

    const [episode] = await db.select({ scriptContent: schema.episodes.scriptContent })
        .from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId))
        .limit(1)
    if (!episode?.scriptContent) {
        logTaskError('Extract', 'props-direct-no-script', { episodeId })
        return { directCall: true, propsCount: 0, text: 'no script' }
    }

    const textConfig = await getActiveConfig('text')
    if (!textConfig) {
        logTaskError('Extract', 'props-direct-no-config', { episodeId })
        return { directCall: true, propsCount: 0, text: 'no text config' }
    }
    const baseUrl = getTextProviderBaseUrl(textConfig)

    // i18n: user-facing — LLM prompt text (product behavior); content kept byte-identical
    const systemPrompt = [
        '你是道具提取助手。从剧本中提取关键道具——必须同时满足：', // i18n: user-facing
        '1. 直接推动剧情（出现/交接/损坏/发现引发情节转折，如凶器、信物、关键文件、定情礼物、证据）', // i18n: user-facing
        '2. 值得单独生成图片（分镜会给特写或反复出现，需要固定外观）', // i18n: user-facing
        '排除：随手使用的日常物品（手机、筷子、水杯）、场景陈设（桌椅、灯具）、使用后放弃的普通兵器。', // i18n: user-facing
        '一集通常 0-3 个，没有就输出空数组。最多保留 3 个。', // i18n: user-facing
        '', // i18n: user-facing
        '只输出 JSON 数组，不要输出任何其他文字：', // i18n: user-facing
        '[{"name":"道具名","type":"类型（日常/武器/交通/装饰/文件等）","description":"物品外貌（材质、颜色、形状、大小、新旧、磨损），不写剧情用途"}]', // i18n: user-facing
    ].join('\n')

    logTaskProgress('Extract', 'props-direct-llm-call', { episodeId, model: textConfig.model, scriptLen: episode.scriptContent.length })
    const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${textConfig.apiKey}`,
        },
        body: JSON.stringify({
            model: textConfig.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: episode.scriptContent },
            ],
            max_tokens: 4096,
            temperature: 0.3,
        }),
        // T1: even the direct LLM call needs a bounded timeout — a poisoned local engine must not hold the GPU queue forever
        signal: AbortSignal.timeout(30 * 60_000),
    })

    if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        logTaskError('Extract', 'props-direct-llm-fail', { episodeId, status: resp.status, errText: errText.slice(0, 200) })
        return { directCall: true, propsCount: 0, text: `LLM fail ${resp.status}` }
    }

    const result: any = await resp.json()
    const text: string = result?.choices?.[0]?.message?.content?.trim() || ''
    logTaskProgress('Extract', 'props-direct-llm-response', { episodeId, textLen: text.length, textPreview: text.slice(0, 300) })

    const props = extractJson(text)
    if (!props || !Array.isArray(props) || props.length === 0) {
                logTaskWarn('Extract', 'props-direct-empty', { episodeId, textLen: text.length })
        return { directCall: true, propsCount: 0, text }
    }

    try {
        const toolResult = await extractTools.saveDedupProps.execute!(
            { props } as any,
            { requestContext } as any,
        )
        logTaskSuccess('Extract', 'props-direct-saved', { episodeId, propsCount: props.length, toolResult })
        return { directCall: true, propsCount: props.length, text }
    } catch (e: any) {
        logTaskError('Extract', 'props-direct-save-fail', { episodeId, error: e?.message })
        return { directCall: true, propsCount: 0, text: `save fail: ${e?.message}` }
    }
}

/**
 * Small models (4-bit Qwen3.5-4B) often emit tool calls as text instead of standard function calls.
 * Parses two formats:
 * 1. <function=saveDedupCharacters>\n<parameter=characters>\n[...JSON...]\n</parameter>
 * 2. {"name": "saveDedupCharacters", "arguments": {"characters": [...]}}
 */
function parseTextToolCall(text: string, target: ExtractTarget): Record<string, any> | null {
  const { snakeName } = SAVE_TOOL_MAP[target]
  const camelName = camelFromSnake(snakeName)
  const namePattern = `(?:${camelName}|${snakeName})`

  // Format 1: <function=saveDedupCharacters>\n<parameter=characters>\n[...]</parameter>
  const fnMatch = text.match(new RegExp(
    `<function=${namePattern}>\\s*<parameter=(\\w+)>\\s*([\\s\\S]*?)(?:</parameter>|</function>|$)`,
    'i',
  ))
  if (fnMatch) {
    const paramName = fnMatch[1]
    const rawValue = fnMatch[2].trim()
    let parsed: any = null
    try { parsed = JSON.parse(rawValue) } catch {}
    if (!parsed) parsed = extractJson(rawValue)
    if (parsed) return { [paramName]: parsed }
    // DEBUG: dump raw value for inspection
        logTaskWarn('Extract', `text-toolcall-parse-fail`, { target, format: 'xml', paramName, rawLen: rawValue.length })
  }

  // Format 2: {"name": "saveDedupCharacters", "arguments": {"characters": [...]}}
  const jsonRegex = new RegExp(
    `\\{[\\s\\S]*?"name"\\s*:\\s*"${namePattern}"[\\s\\S]*?"arguments"\\s*:\\s*(\\{[\\s\\S]*?\\})[\\s\\S]*?\\}`,
    'i',
  )
  const jsonMatch = text.match(jsonRegex)
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1])
    } catch {
      logTaskWarn('Extract', `text-toolcall-parse-fail`, { target, format: 'json' })
    }
  }

  // Format 3: raw JSON array in text (no function wrapper — model outputs [{...}] directly)
  const paramName = snakeName.replace('save_dedup_', '')
  const rawJson = extractJson(text)
  if (rawJson && Array.isArray(rawJson) && rawJson.length > 0) {
    return { [paramName]: rawJson }
  }

  return null
}

/** Starts an async extraction task (returns immediately); returns false when the same episode+target is already running; optional text model override */
export async function startExtraction(episodeId: number, dramaId: number, target: ExtractTarget, opts: { model?: string; configId?: number } = {}): Promise<boolean> {
  const key = keyOf(episodeId, target)
  if (tasks.get(key)?.status === 'running') return false
  // B13 TOCTOU: claim the slot synchronously before persisting — a concurrent second request arriving during the await
  // is rejected outright by the running check; a failed insert must release the slot
  const task: ExtractTask = { status: 'running', started_at: new Date().toISOString() }
  tasks.set(key, task)

  let dbTaskId: number
  try {
    // Persist to sys_task: type=extract (not in the media generation queue; extraction manages its own lifecycle),
    // episode_id feeds the task panel /episodes/:id/generation-tasks aggregate filter
    const ts = new Date().toISOString()
    const insertRes = await db.insert(schema.sysTask).values({
      type: 'extract',
      dramaId,
      episodeId,
      // i18n: user-facing
      prompt: `提取${target}`,
      model: opts.model || null,
      params: JSON.stringify({ target }),
      status: 'processing',
      createdAt: ts,
      updatedAt: ts,
    })
    dbTaskId = getInsertId(insertRes)
  } catch (err) {
    tasks.delete(key)
    throw err
  }

  logTaskStart('Extract', target, { episodeId, dramaId, model: opts.model || undefined, configId: opts.configId || undefined })

  const requestContext = buildAgentRequestContext({
    episodeId,
    dramaId,
    modelOverride: opts.model || undefined,
    textConfigId: opts.configId || undefined,
  })
  ;(async () => {
    // Props use direct LLM extraction, bypassing the Mastra Agent (4-bit model multi-step tool loop is unreliable)
    if (target === 'props') {
      return enqueueGpuWork(`Extract-${target}-ep${episodeId}`, () => directPropsExtraction(episodeId, dramaId, requestContext))
    }
    const agent = mastra.getAgent('extractor')
    // i18n: user-facing
    if (!agent) throw new Error('提取 Agent 不可用')
    return enqueueGpuWork(`Extract-${target}-ep${episodeId}`, () => agent.generate([{ role: 'user', content: EXTRACT_MESSAGES[target] }], {
      maxSteps: 20,
      requestContext,
      // Print Agent progress step by step: which tools were called, what was output
      onStepFinish: (step: any) => {
        const tools = (step?.toolCalls || [])
          .map((t: any) => t?.toolName || t?.payload?.toolName)
          .filter(Boolean)
        logTaskProgress('Extract', `${target}-step`, {
          episodeId,
          tools: tools.length ? tools.join(',') : undefined,
          text: (step?.text || '').slice(0, 200) || undefined,
        })
      },
    }))
  })()
    .then(async (result: any) => {
      task.status = 'done'
      task.finished_at = new Date().toISOString()

      // Props direct-LLM path: saving already happened inside directPropsExtraction; skip the Agent fallback logic
      if (result?.directCall) {
        logTaskSuccess('Extract', target, { episodeId, propsCount: result.propsCount })
        return (async () => {
          if (dbTaskId) {
            await db.update(schema.sysTask).set({
              status: 'completed',
              resultUrl: (result.text || '').slice(0, 500) || null,
              updatedAt: new Date().toISOString(),
            }).where(eq(schema.sysTask.id, dbTaskId))
          }
        })().catch((e: any) => logTaskError('Extract', target, { episodeId, error: `status write-back failed: ${e?.message}` }))
      }

      const toolNames = (result?.toolCalls || []).map((t: any) => t?.toolName).filter(Boolean)
      const saveInfo = SAVE_TOOL_MAP[target]
      const calledSave = toolNames.some((n: any) => n === saveInfo.snakeName || n === camelFromSnake(saveInfo.snakeName))

      // Fallback: small models often emit save_dedup_* as text instead of a standard function call.
      // When no save tool was called, parse the <function=saveDedup*> format from result.text and execute the tool directly.
      // L11: whether data actually landed decides the terminal state — marking completed without saving shows success with empty data
      let saved = calledSave
      if (!saved) {
        const parsedArgs = parseTextToolCall(result?.text || '', target)
        if (parsedArgs) {
          try {
            const toolResult = await saveInfo.tool.execute(parsedArgs as any, { requestContext } as any)
            logTaskSuccess('Extract', `${target}-text-fallback`, { episodeId, toolResult })
            saved = true
          } catch (e: any) {
            logTaskError('Extract', `${target}-text-fallback`, { episodeId, error: e?.message })
          }
        } else {
          logTaskWarn('Extract', `${target}-no-save`, {
            episodeId,
            textLen: (result?.text || '').length,
            textPreview: (result?.text || '').slice(0, 300),
          })
        }
      }

      logTaskSuccess('Extract', target, {
        episodeId,
        steps: result?.steps?.length,
        toolCalls: toolNames.join(',') || undefined,
        reply: (result?.text || '').slice(0, 300) || undefined,
      })
      return (async () => {
        if (dbTaskId) {
          await db.update(schema.sysTask).set({
            status: saved ? 'completed' : 'failed',
            // i18n: user-facing
            errorMsg: saved ? null : '提取完成但未保存任何资产（模型未调用保存工具），请重试',
            resultUrl: (result?.text || '').slice(0, 500) || null,
            updatedAt: new Date().toISOString(),
          }).where(eq(schema.sysTask.id, dbTaskId))
        }
      })().catch((e: any) => logTaskError('Extract', target, { episodeId, error: `status write-back failed: ${e?.message}` }))
    })
    .catch(async (err: any) => {
      task.status = 'error'
      task.finished_at = new Date().toISOString()
      // i18n: user-facing
      task.error = err?.message || '提取失败'
      logTaskError('Extract', target, { episodeId, error: err?.message })
      if (dbTaskId) {
        await db.update(schema.sysTask).set({
          status: 'failed',
          // i18n: user-facing
          errorMsg: err?.message || '提取失败',
          updatedAt: new Date().toISOString(),
        }).where(eq(schema.sysTask.id, dbTaskId))
      }
    })
  return true
}

/** Returns extraction task status for the three targets of one episode: in-memory state first (realtime while running),
 *  falling back to the latest sys_task row when no in-memory state exists (after a restart the startup sweep has already
 *  marked processing rows failed, so this returns the terminal state and the frontend sees "interrupted, retry" instead
 *  of "not started" — the task itself was persisted to sys_task, see startExtraction) */
export async function getExtractionStatus(episodeId: number): Promise<Record<ExtractTarget, ExtractTask | null>> {
  const result = {} as Record<ExtractTarget, ExtractTask | null>
  const missing = EXTRACT_TARGETS.filter(t => !tasks.get(keyOf(episodeId, t)))
  for (const target of EXTRACT_TARGETS) {
    const mem = tasks.get(keyOf(episodeId, target))
    if (mem) result[target] = mem
  }
  if (!missing.length) return result

  const rows = await db.select().from(schema.sysTask)
    .where(and(eq(schema.sysTask.type, 'extract'), eq(schema.sysTask.episodeId, episodeId)))
    .orderBy(desc(schema.sysTask.id))
    .limit(30)
  for (const target of missing) {
    const hit = rows.find(r => {
      try { return JSON.parse(r.params || '{}').target === target } catch { return false }
    })
    if (!hit) { result[target] = null; continue }
    result[target] = {
      status: hit.status === 'completed' ? 'done' : hit.status === 'failed' ? 'error' : 'running',
      started_at: hit.createdAt,
      finished_at: hit.updatedAt || undefined,
      error: hit.errorMsg || undefined,
    }
  }
  return result
}
