/**
 * 整本小说导入管线 — 「扔一本小说 → 分集短剧」入口
 *
 * 四步（全部 direct LLM 调用，绕过 Mastra Agent——小模型多步工具循环不可靠，
 * 沿用 extraction.ts directPropsExtraction 的结论）：
 *   1. 切块 chunkNovel（纯代码，章界优先 + ~18k 字窗口 + 硬上限兜底）
 *   2. 逐块大纲 outlineSegment（map：每块压缩为结构化摘要 1-2k 字）
 *   3. 分集规划 planEpisodes（全部块摘要单次可读 → 产分集大纲 + 建 episode 行）
 *   4. 逐集滚动改写 rewriteEpisode（原文块 ≤20k + 全剧人物卡 + 前情提要）
 *
 * 2/3/4 是 GPU 密集 LLM 调用，共享 GPU 串行队列（与媒体生成同锁）。
 * 任务状态双轨：进程内 Map + sys_task（type=novel_*），重启后启动清扫标 failed。
 * 幂等可断点：outline/plan 产物落库，重跑从首个未完成块续。
 */
import { and, asc, eq } from 'drizzle-orm'
import { getActiveConfig, getTextProviderBaseUrl } from './ai.js'
import { enqueueGpuWork } from './gpu-queue.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { db, getInsertId, schema } from '../db/index.js'

/** 单块目标窗口（字）。改写时上下文 = 块内容 + 人物卡 + 前情提要，
 *  18k 留 ~2k 余量给人物卡/提要/系统提示，实测可靠窗口 20.4k（E2E 验证） */
export const NOVEL_CHUNK_TARGET = 18_000
/** 无章节标记时的硬切上限 */
export const NOVEL_CHUNK_MAX = 20_000

export interface NovelChunk {
  content: string
  chapterTitle: string | null
}

/**
 * 小说切块（纯函数，可单测）：
 *   1. 按「第N章/回/节 卷」等章节标记切章
 *   2. 相邻章合并直到接近目标窗口（章小于目标时打包）
 *   3. 单章超上限 → 按句读硬切
 *   4. 无任何章节标记 → 按目标窗口 + 句读边界硬切
 */
export function chunkNovel(raw: string, target = NOVEL_CHUNK_TARGET, max = NOVEL_CHUNK_MAX): NovelChunk[] {
  const text = (raw || '').replace(/\r\n/g, '\n').trim()
  if (!text) return []

  // 章节标记：行首的 第N章/回/节/卷（N 为数字或汉字数字）
  const chapterRe = /^[ \t]*(第[0-9一二三四五六七八九十百千零两]+[章回节卷][^\n]*)$/gm
  const marks: { index: number; title: string }[] = []
  let m: RegExpExecArray | null
  while ((m = chapterRe.exec(text)) !== null) {
    marks.push({ index: m.index, title: m[1].trim().slice(0, 60) })
  }

  // 无章节标记：整本当一章走窗口硬切
  const chapters: NovelChunk[] = []
  if (!marks.length) {
    chapters.push(...hardSplit({ content: text, chapterTitle: null }, target, max))
    return chapters
  }

  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].index
    const end = i + 1 < marks.length ? marks[i + 1].index : text.length
    const content = text.slice(start, end).trim()
    if (content) chapters.push({ content, chapterTitle: marks[i].title })
  }

  // 相邻章合并至接近目标窗口（小章打包，减少块数与 LLM 调用次数）
  const merged: NovelChunk[] = []
  for (const ch of chapters) {
    const last = merged[merged.length - 1]
    if (last && (last.content.length + ch.content.length) <= target) {
      last.content += '\n\n' + ch.content
      // 保留首章标题；合并块标题记区间
      last.chapterTitle = last.chapterTitle && last.chapterTitle !== ch.chapterTitle
        ? `${last.chapterTitle} ~ ${ch.chapterTitle}`
        : (last.chapterTitle || ch.chapterTitle)
    } else {
      merged.push({ ...ch })
    }
  }

  // 单块仍超上限（章太大）→ 句读边界硬切
  const out: NovelChunk[] = []
  for (const ch of merged) {
    out.push(...hardSplit(ch, target, max))
  }
  return out
}

/** 按句读边界（。！？!?；;\n）硬切一块到 ≤max */
function hardSplit(ch: NovelChunk, target: number, max: number): NovelChunk[] {
  if (ch.content.length <= max) return [ch]
  const parts: NovelChunk[] = []
  let pos = 0
  let partIdx = 0
  while (pos < ch.content.length) {
    let end = Math.min(pos + target, ch.content.length)
    if (end < ch.content.length) {
      // 在窗口末尾往前找句读边界（最近 2k 内），找不到就地切
      const window = ch.content.slice(Math.max(pos, end - 2000), end)
      const lastStop = Math.max(window.lastIndexOf('。'), window.lastIndexOf('！'), window.lastIndexOf('？'), window.lastIndexOf('\n'), window.lastIndexOf('；'))
      if (lastStop > 0) end = Math.max(pos, end - 2000) + lastStop + 1
    }
    const content = ch.content.slice(pos, end).trim()
    if (content) {
      parts.push({ content, chapterTitle: ch.chapterTitle ? `${ch.chapterTitle}（${++partIdx}）` : null })
    }
    pos = end
  }
  return parts
}

/** 直连文本模型一次调用（GPU 串行队列内），返回文本内容；失败抛错 */
async function callTextModel(systemPrompt: string, userContent: string, maxTokens: number, label: string): Promise<string> {
  const textConfig = await getActiveConfig('text')
  if (!textConfig) throw new Error('未配置文本模型服务')
  const baseUrl = getTextProviderBaseUrl(textConfig)
  logTaskProgress('Novel', `${label}-llm-call`, { model: textConfig.model, inputLen: userContent.length })
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
        { role: 'user', content: userContent },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
    signal: AbortSignal.timeout(30 * 60_000),
  })
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`LLM ${resp.status}: ${errText.slice(0, 200)}`)
  }
  const result: any = await resp.json()
  const content: string = result?.choices?.[0]?.message?.content?.trim() || ''
  if (!content) throw new Error('LLM 空响应')
  logTaskProgress('Novel', `${label}-llm-response`, { textLen: content.length })
  return content
}

/** 从 raw 文本中用括号匹配提取完整 JSON（与 extraction.ts 同逻辑，含截断修复） */
export function extractNovelJson(raw: string): any | null {
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
  return null
}

// ---------------------------------------------------------------------------
// Step 1: 导入切块（同步，无 LLM）
// ---------------------------------------------------------------------------
export async function importNovel(dramaId: number, content: string, replace = true): Promise<{ segmentCount: number; totalChars: number }> {
  const chunks = chunkNovel(content)
  if (!chunks.length) throw new Error('小说内容为空')
  if (replace) {
    await db.delete(schema.novelSegments).where(eq(schema.novelSegments.dramaId, dramaId))
    await db.delete(schema.novelEpisodePlans).where(eq(schema.novelEpisodePlans.dramaId, dramaId))
  }
  for (let i = 0; i < chunks.length; i++) {
    const ts = new Date().toISOString()
    await db.insert(schema.novelSegments).values({
      dramaId,
      seq: i + 1,
      content: chunks[i].content,
      chapterTitle: chunks[i].chapterTitle,
      createdAt: ts,
      updatedAt: ts,
    })
  }
  logTaskSuccess('Novel', 'import-done', { dramaId, segmentCount: chunks.length, totalChars: content.length })
  return { segmentCount: chunks.length, totalChars: content.length }
}

// ---------------------------------------------------------------------------
// Step 2: 逐块大纲（后台批处理，幂等：跳过已有 outline 的块）
// ---------------------------------------------------------------------------
export interface NovelTask {
  status: 'running' | 'done' | 'error'
  started_at: string
  finished_at?: string
  progress?: { done: number; total: number }
  error?: string
}
const tasks = new Map<string, NovelTask>()

export function getNovelTask(dramaId: number, kind: string): NovelTask | null {
  return tasks.get(`${dramaId}:${kind}`) || null
}

const OUTLINE_SYSTEM_PROMPT = `你是小说剧本改编助手。阅读小说片段，输出结构化 JSON 摘要（供后续分集规划使用）。只输出 JSON，不要其他文字：
{"summary":"剧情梗概（200-400字，按时间顺序，写清因果）","characters":[{"name":"人物名","profile":"固定人设：性别/年龄/外貌特征/性格/身份，50字内，跨片段必须一致"}],"scenes":["出现的地点及氛围"],"timeline":"时间线要点","hook":"本片段结尾的悬念/钩子"}`

export async function outlineAllSegments(dramaId: number): Promise<void> {
  const key = `${dramaId}:outline`
  if (tasks.get(key)?.status === 'running') throw new Error('大纲任务已在运行')
  const task: NovelTask = { status: 'running', started_at: new Date().toISOString() }
  tasks.set(key, task)
  logTaskStart('Novel', 'outline-start', { dramaId })
  void (async () => {
    try {
      const segments = await db.select().from(schema.novelSegments)
        .where(eq(schema.novelSegments.dramaId, dramaId))
        .orderBy(asc(schema.novelSegments.seq))
      if (!segments.length) throw new Error('无小说切块，请先导入')
      let done = 0
      for (const seg of segments) {
        if (seg.outline) { done++; continue }
        const text = await enqueueGpuWork(`novel-outline-${dramaId}-${seg.seq}`, async () =>
          callTextModel(OUTLINE_SYSTEM_PROMPT, seg.content, 2048, 'outline'))
        const parsed = extractNovelJson(text)
        if (!parsed) {
          logTaskWarn('Novel', 'outline-parse-fail', { dramaId, seq: seg.seq, textPreview: text.slice(0, 200) })
          throw new Error(`块 ${seg.seq} 大纲解析失败`)
        }
        await db.update(schema.novelSegments)
          .set({ outline: JSON.stringify(parsed), updatedAt: new Date().toISOString() })
          .where(eq(schema.novelSegments.id, seg.id))
        done++
        task.progress = { done, total: segments.length }
      }
      task.status = 'done'
      task.finished_at = new Date().toISOString()
      logTaskSuccess('Novel', 'outline-done', { dramaId, done })
    } catch (err) {
      task.status = 'error'
      task.finished_at = new Date().toISOString()
      task.error = (err as Error).message
      logTaskError('Novel', 'outline-failed', { dramaId, error: (err as Error).message })
    }
  })()
}

/** 汇总全部块大纲为「人物卡 + 分段摘要」文本（规划与改写的共享上下文） */
export async function buildOutlineDigest(dramaId: number): Promise<{ digest: string; characterCards: string; segments: { seq: number; outline: any }[] }> {
  const segments = await db.select().from(schema.novelSegments)
    .where(eq(schema.novelSegments.dramaId, dramaId))
    .orderBy(asc(schema.novelSegments.seq))
  if (!segments.length) throw new Error('无小说切块，请先导入')
  const missing = segments.filter(s => !s.outline)
  if (missing.length) throw new Error(`尚有 ${missing.length} 块未生成大纲`)
  const outlines = segments.map(s => ({ seq: s.seq, outline: JSON.parse(s.outline!) }))
  // 人物卡：同名合并 profile（取首次出现，跨块一致是文本锚）
  const charMap = new Map<string, string>()
  for (const { outline } of outlines) {
    for (const c of outline.characters || []) {
      if (c?.name && !charMap.has(c.name)) charMap.set(c.name, c.profile || '')
    }
  }
  const characterCards = [...charMap.entries()].map(([name, profile]) => `- ${name}：${profile}`).join('\n')
  const digest = outlines.map(({ seq, outline }) =>
    `【块 ${seq}】${outline.summary || ''}${outline.hook ? `（钩子：${outline.hook}）` : ''}`).join('\n\n')
  return { digest, characterCards, segments: outlines }
}

// ---------------------------------------------------------------------------
// Step 3: 分集规划（单次 LLM：全部块摘要 → 分集大纲 + 建 episode 行）
// ---------------------------------------------------------------------------
const PLAN_SYSTEM_PROMPT = `你是短剧分集策划。基于全书的分段剧情摘要，规划分集短剧。只输出 JSON 数组，不要其他文字：
[{"episode_number":1,"title":"本集标题（10字内，吸睛）","segment_range":[起块号,止块号],"synopsis":"本集剧情梗概（150-300字，写清起因-冲突-钩子）","emotional_arc":"情绪曲线一句话"}]
规则：
1. 每集对应连续的块区间（segment_range 必须覆盖所有块且不重叠）
2. 分集点对齐剧情转折/悬念，集尾必须留钩子
3. 每集时长按目标时长估算镜头量，不要硬凑集数`

export async function planEpisodesFromOutlines(dramaId: number, targetMinutes = 2): Promise<{ episodeCount: number }> {
  const { digest, segments } = await buildOutlineDigest(dramaId)
  const firstSeq = segments[0]?.seq ?? 1
  const lastSeq = segments[segments.length - 1]?.seq ?? 1
  const planText = await enqueueGpuWork(`novel-plan-${dramaId}`, async () =>
    callTextModel(PLAN_SYSTEM_PROMPT,
      `全书分段剧情摘要（块 ${firstSeq}-${lastSeq}）：\n\n${digest}\n\n目标每集时长：${targetMinutes} 分钟。请规划分集。`,
      8192, 'plan'))
  const plans = extractNovelJson(planText)
  if (!plans || !Array.isArray(plans) || !plans.length) throw new Error('分集规划解析失败')
  // 校验块区间覆盖
  const ranges = plans.map((p: any) => p.segment_range).filter(Array.isArray)
  const covered = new Set<number>()
  for (const [a, b] of ranges) {
    for (let s = Math.min(a, b); s <= Math.max(a, b); s++) covered.add(s)
  }
  const missingSeq = segments.filter(s => !covered.has(s.seq)).map(s => s.seq)
  if (missingSeq.length) {
    logTaskWarn('Novel', 'plan-coverage-gap', { dramaId, missingSeq })
    throw new Error(`分集规划块区间未覆盖块 ${missingSeq.join(',')}，请重试规划`)
  }

  // 重建分集（规划可重跑：先清旧 plan 与其创建的空 episode）
  const oldPlans = await db.select().from(schema.novelEpisodePlans).where(eq(schema.novelEpisodePlans.dramaId, dramaId))
  for (const op of oldPlans) {
    if (op.episodeId) {
      const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, op.episodeId))
      // 只删规划创建且未改写的空集（scriptContent 为空），用户手建/已有剧本的集不动
      if (ep && !ep.scriptContent) {
        await db.update(schema.episodes).set({ deletedAt: new Date().toISOString() }).where(eq(schema.episodes.id, op.episodeId))
      }
    }
  }
  await db.delete(schema.novelEpisodePlans).where(eq(schema.novelEpisodePlans.dramaId, dramaId))

  for (const p of plans) {
    const episodeNumber = Number(p.episode_number)
    if (!episodeNumber) continue
    // 复用同号未删集（若用户已有该集则挂 plan 不重建）
    const [existing] = await db.select().from(schema.episodes)
      .where(and(eq(schema.episodes.dramaId, dramaId), eq(schema.episodes.episodeNumber, episodeNumber)))
    let episodeId: number
    if (existing && !existing.deletedAt) {
      episodeId = existing.id
    } else {
      const ts = new Date().toISOString()
      episodeId = getInsertId(await db.insert(schema.episodes).values({
        dramaId,
        episodeNumber,
        title: String(p.title || `第${episodeNumber}集`),
        description: String(p.synopsis || ''),
        status: 'draft',
        createdAt: ts,
        updatedAt: ts,
      }))
    }
    const ts = new Date().toISOString()
    await db.insert(schema.novelEpisodePlans).values({
      dramaId,
      episodeId,
      episodeNumber,
      plan: JSON.stringify(p),
      createdAt: ts,
      updatedAt: ts,
    })
  }
  logTaskSuccess('Novel', 'plan-done', { dramaId, episodeCount: plans.length })
  return { episodeCount: plans.length }
}

// ---------------------------------------------------------------------------
// Step 4: 逐集滚动改写（原文块 + 人物卡 + 前情提要 → scriptContent）
// ---------------------------------------------------------------------------
export async function rewriteEpisodeFromNovel(dramaId: number, episodeId: number, targetLanguage = '中文'): Promise<{ scriptLength: number }> {
  const [plan] = await db.select().from(schema.novelEpisodePlans)
    .where(and(eq(schema.novelEpisodePlans.dramaId, dramaId), eq(schema.novelEpisodePlans.episodeId, episodeId)))
  if (!plan) throw new Error('该集无分集规划（需先运行分集规划）')
  const planJson = JSON.parse(plan.plan)
  const [from, to] = planJson.segment_range || []
  if (!from || !to) throw new Error('分集规划缺块区间')

  const { characterCards } = await buildOutlineDigest(dramaId)
  const rangeSegs = (await db.select().from(schema.novelSegments).where(eq(schema.novelSegments.dramaId, dramaId)))
    .filter(s => s.seq >= Math.min(from, to) && s.seq <= Math.max(from, to))
    .sort((a, b) => a.seq - b.seq)
  const sourceText = rangeSegs.map(s => s.content).join('\n\n')
  const sourceChars = sourceText.length
  if (sourceChars > 22_000) {
    logTaskWarn('Novel', 'rewrite-source-too-long', { dramaId, episodeId, sourceChars })
    throw new Error(`本集原文块共 ${sourceChars} 字，超出单次改写窗口，请调整分集规划`)
  }

  // 前情提要：前一集 plan 的 recap（滚动），无则用其 synopsis 兜底
  let recap = ''
  if (plan.episodeNumber > 1) {
    const [prevPlan] = await db.select().from(schema.novelEpisodePlans)
      .where(and(eq(schema.novelEpisodePlans.dramaId, dramaId), eq(schema.novelEpisodePlans.episodeNumber, plan.episodeNumber - 1)))
    if (prevPlan) {
      recap = prevPlan.recap || JSON.parse(prevPlan.plan).synopsis || ''
    }
  }

  const systemPrompt = `你是短剧编剧。基于小说原文改编本集短剧剧本。只输出剧本正文，不要任何解释。
格式要求：
1. 每个镜头一段：场景标头（S01 内景/外景·地点·时间）+ 画面描述 + 人物对白（@角色名，动作描述，说：「台词」）
2. 对白占剧本主体，台词口语化、有冲突感；每句台词 ≤60 字（TTS 单句上限）
3. 人物外貌/性格必须严格遵循人物卡，不得改动人设
4. 与前情提要在剧情上严格衔接，不重复已演过的情节
5. 全文使用${targetLanguage}`

  const userContent = `【全剧人物卡】\n${characterCards}\n\n${recap ? `【前情提要】\n${recap}\n\n` : ''}【本集剧情梗概】\n${planJson.synopsis || ''}\n\n【小说原文】\n${sourceText}`

  const script = await enqueueGpuWork(`novel-rewrite-${dramaId}-${episodeId}`, async () =>
    callTextModel(systemPrompt, userContent, 16_384, 'rewrite'))

  const ts = new Date().toISOString()
  await db.update(schema.episodes)
    .set({ scriptContent: script, updatedAt: ts })
    .where(eq(schema.episodes.id, episodeId))

  // 本集提要（供下一集滚动上下文）：轻量二次调用，失败不阻断（回退 synopsis）
  try {
    const recapText = await enqueueGpuWork(`novel-recap-${dramaId}-${episodeId}`, async () =>
      callTextModel('你是剧本助手。用 200 字内总结本集剧本的关键剧情进展（供下一集改编时衔接），只输出总结正文。',
        script, 1024, 'recap'))
    await db.update(schema.novelEpisodePlans).set({ recap: recapText, updatedAt: ts })
      .where(eq(schema.novelEpisodePlans.id, plan.id))
  } catch (err) {
    logTaskWarn('Novel', 'recap-failed', { dramaId, episodeId, error: (err as Error).message })
  }

  logTaskSuccess('Novel', 'rewrite-done', { dramaId, episodeId, scriptLength: script.length })
  return { scriptLength: script.length }
}

/** 分集规划 + 全部集滚动改写（顺序，一集完成才下一集——前情提要依赖链） */
export async function rewriteAllEpisodes(dramaId: number, targetLanguage = '中文'): Promise<void> {
  const key = `${dramaId}:rewrite`
  if (tasks.get(key)?.status === 'running') throw new Error('改写任务已在运行')
  const task: NovelTask = { status: 'running', started_at: new Date().toISOString() }
  tasks.set(key, task)
  logTaskStart('Novel', 'rewrite-all-start', { dramaId })
  void (async () => {
    try {
      const plans = await db.select().from(schema.novelEpisodePlans)
        .where(eq(schema.novelEpisodePlans.dramaId, dramaId))
        .orderBy(asc(schema.novelEpisodePlans.episodeNumber))
      if (!plans.length) throw new Error('无分集规划，请先运行分集规划')
      let done = 0
      for (const p of plans) {
        if (!p.episodeId) continue
        const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, p.episodeId))
        if (ep?.scriptContent) { done++; continue }
        await rewriteEpisodeFromNovel(dramaId, p.episodeId, targetLanguage)
        done++
        task.progress = { done, total: plans.length }
      }
      task.status = 'done'
      task.finished_at = new Date().toISOString()
      logTaskSuccess('Novel', 'rewrite-all-done', { dramaId, done })
    } catch (err) {
      task.status = 'error'
      task.finished_at = new Date().toISOString()
      task.error = (err as Error).message
      logTaskError('Novel', 'rewrite-all-failed', { dramaId, error: (err as Error).message })
    }
  })()
}
