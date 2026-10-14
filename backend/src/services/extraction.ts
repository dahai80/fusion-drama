/**
 * 资产提取任务 — 异步执行，按「集 × 类型」粒度跟踪
 * 角色 / 场景 / 道具 可分别单独提取，三类共享 GPU 串行队列（与媒体生成同锁）：
 * 并发 3 个 Agent 打 Qwen3.5 + FLUX 常驻 → GPU 争用 → Metal command buffer 崩溃 →
 * fusion-mlx SIGTERM 挂死。串行化后任意时刻仅一个 GPU 密集任务运行。
 * 任务状态为进程内内存态：后端重启后运行中的任务状态丢失（Agent 调用本身已被中断）
 */
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { extractTools } from '../agents/tools/extract-tools.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { enqueueGpuWork } from './gpu-queue.js'
import { getActiveConfig, getTextProviderBaseUrl } from './ai.js'
import { writeFileSync } from 'fs'
import { db, getInsertId, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'

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

/** 每类资产的提取指令：限定只提取该类型，并要求与已有数据去重合并 */
const EXTRACT_MESSAGES: Record<ExtractTarget, string> = {
  characters: '请从本集剧本中提取所有角色信息（外貌需融合性格、含妆造），先用 read_existing_characters 读取项目已有角色，同名或近名（带括号定位/别名，如「林小雨（主角）」与「林小雨」）直接复用已有、不要重复创建，再用 save_dedup_characters 保存。本次只提取角色，不要提取场景和道具。',
  scenes: '请从本集剧本中提取所有场景信息（地点、时间、光影等），先用 read_existing_scenes 读取已有场景去重，再用 save_dedup_scenes 保存。本次只提取场景，不要提取角色和道具。',
  props: '请从本集剧本中提取关键道具（直接推动剧情且值得单独生成图片的物品，如凶器、信物、关键文件等，最多3个）。不要输出分析文字，直接调用 save_dedup_props 工具保存。没有符合条件的就传空数组。description 只记录物品外貌（材质、颜色、形状等）。先用 read_existing_props 读取已有道具去重，再调 save_dedup_props 保存。本次只提取道具。',
}

const SAVE_TOOL_MAP: Record<ExtractTarget, { snakeName: string; tool: any }> = {
  characters: { snakeName: 'save_dedup_characters', tool: extractTools.saveDedupCharacters },
  scenes: { snakeName: 'save_dedup_scenes', tool: extractTools.saveDedupScenes },
  props: { snakeName: 'save_dedup_props', tool: extractTools.saveDedupProps },
}

function camelFromSnake(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

/** 从 raw 文本中用括号匹配提取完整 JSON（小模型常漏闭合标签或尾随文字） */
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
 * 道具直接 LLM 提取：绕过 Mastra Agent，直接调 fusion-mlx 文本模型。
 * 4-bit Qwen3.5-4B 跑 Mastra Agent 多步工具循环不可靠——
 * ① 不调 save_dedup_props 而输出大段散文分析；② 调 mastra_workspace_* 而非 extract 工具；
 * ③ 第 4 个请求触发 scheduler 死锁（prefix cache 块损坏，waiting=1 running=0）。
 * 直接单次 LLM 调用 + JSON 输出绕过以上三问题。
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

    const systemPrompt = `你是道具提取助手。从剧本中提取关键道具——必须同时满足：
1. 直接推动剧情（出现/交接/损坏/发现引发情节转折，如凶器、信物、关键文件、定情礼物、证据）
2. 值得单独生成图片（分镜会给特写或反复出现，需要固定外观）
排除：随手使用的日常物品（手机、筷子、水杯）、场景陈设（桌椅、灯具）、使用后放弃的普通兵器。
一集通常 0-3 个，没有就输出空数组。最多保留 3 个。

只输出 JSON 数组，不要输出任何其他文字：
[{"name":"道具名","type":"类型（日常/武器/交通/装饰/文件等）","description":"物品外貌（材质、颜色、形状、大小、新旧、磨损），不写剧情用途"}]`

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
        try { writeFileSync('/tmp/fd-extract-props-direct.txt', text) } catch {}
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
 * 小模型（4-bit Qwen3.5-4B）常把 tool call 输出为文本而非标准 function call。
 * 解析两种格式：
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
    try { writeFileSync('/tmp/fd-extract-raw.txt', rawValue) } catch {}
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

/** 启动异步提取任务（立即返回）；同集同类型已在运行时返回 false；可指定文本模型覆盖 */
export async function startExtraction(episodeId: number, dramaId: number, target: ExtractTarget, opts: { model?: string; configId?: number } = {}): Promise<boolean> {
  const key = keyOf(episodeId, target)
  if (tasks.get(key)?.status === 'running') return false

  // 落库 sys_task：type=extract（不进媒体生成队列，extraction 自管生命周期），
  // episode_id 供任务面板 /episodes/:id/generation-tasks 聚合过滤
  const ts = new Date().toISOString()
  const insertRes = await db.insert(schema.sysTask).values({
    type: 'extract',
    dramaId,
    episodeId,
    prompt: `提取${target}`,
    model: opts.model || null,
    params: JSON.stringify({ target }),
    status: 'processing',
    createdAt: ts,
    updatedAt: ts,
  })
  const dbTaskId = getInsertId(insertRes)

  const task: ExtractTask = { status: 'running', started_at: new Date().toISOString() }
  tasks.set(key, task)

  logTaskStart('Extract', target, { episodeId, dramaId, model: opts.model || undefined, configId: opts.configId || undefined })

  const requestContext = buildAgentRequestContext({
    episodeId,
    dramaId,
    modelOverride: opts.model || undefined,
    textConfigId: opts.configId || undefined,
  })
  ;(async () => {
    // 道具走直接 LLM 提取，绕过 Mastra Agent（4-bit 模型多步工具循环不可靠）
    if (target === 'props') {
      return enqueueGpuWork(`Extract-${target}-ep${episodeId}`, () => directPropsExtraction(episodeId, dramaId, requestContext))
    }
    const agent = mastra.getAgent('extractor')
    if (!agent) throw new Error('提取 Agent 不可用')
    return enqueueGpuWork(`Extract-${target}-ep${episodeId}`, () => agent.generate([{ role: 'user', content: EXTRACT_MESSAGES[target] }], {
      maxSteps: 20,
      requestContext,
      // 逐步打印 Agent 进展：调用了哪些工具、输出了什么
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

      // 道具直接 LLM 路径：保存已在 directPropsExtraction 内完成，跳过 Agent 兜底逻辑
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
        })().catch((e: any) => logTaskError('Extract', target, { episodeId, error: `状态回写失败: ${e?.message}` }))
      }

      const toolNames = (result?.toolCalls || []).map((t: any) => t?.toolName).filter(Boolean)
      const saveInfo = SAVE_TOOL_MAP[target]
      const calledSave = toolNames.some((n: any) => n === saveInfo.snakeName || n === camelFromSnake(saveInfo.snakeName))

      // 兜底：小模型常把 save_dedup_* 输出为文本而非标准 function call。
      // 检测到未调 save 工具时，从 result.text 解析 <function=saveDedup*> 格式并直接执行工具。
      if (!calledSave) {
        const parsedArgs = parseTextToolCall(result?.text || '', target)
        if (parsedArgs) {
          try {
            const toolResult = await saveInfo.tool.execute(parsedArgs as any, { requestContext } as any)
            logTaskSuccess('Extract', `${target}-text-fallback`, { episodeId, toolResult })
          } catch (e: any) {
            logTaskError('Extract', `${target}-text-fallback`, { episodeId, error: e?.message })
          }
        } else {
          try { writeFileSync(`/tmp/fd-extract-${target}-text.txt`, result?.text || '') } catch {}
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
            status: 'completed',
            resultUrl: (result?.text || '').slice(0, 500) || null,
            updatedAt: new Date().toISOString(),
          }).where(eq(schema.sysTask.id, dbTaskId))
        }
      })().catch((e: any) => logTaskError('Extract', target, { episodeId, error: `状态回写失败: ${e?.message}` }))
    })
    .catch(async (err: any) => {
      task.status = 'error'
      task.finished_at = new Date().toISOString()
      task.error = err?.message || '提取失败'
      logTaskError('Extract', target, { episodeId, error: err?.message })
      if (dbTaskId) {
        await db.update(schema.sysTask).set({
          status: 'failed',
          errorMsg: err?.message || '提取失败',
          updatedAt: new Date().toISOString(),
        }).where(eq(schema.sysTask.id, dbTaskId))
      }
    })
  return true
}

/** 查询某集三类资产的提取任务状态（未启动过的类型为 null） */
export function getExtractionStatus(episodeId: number): Record<ExtractTarget, ExtractTask | null> {
  const result = {} as Record<ExtractTarget, ExtractTask | null>
  for (const target of EXTRACT_TARGETS) result[target] = tasks.get(keyOf(episodeId, target)) || null
  return result
}
