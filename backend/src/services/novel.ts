/**
 * Full-novel import pipeline — the "throw in a novel → episodic short drama" entry
 *
 * Four steps (all direct LLM calls, bypassing Mastra agents — multi-step tool loops are
 * unreliable on small models, per the extraction.ts directPropsExtraction finding):
 *   1. Chunk chunkNovel (pure code: chapter boundaries first + ~18k-char window + hard cap fallback)
 *   2. Per-chunk outline outlineSegment (map: each chunk compressed to a 1-2k-char structured summary)
 *   3. Episode planning planEpisodes (all chunk summaries read in a single pass → episode outlines + episode rows)
 *   4. Per-episode rolling rewrite rewriteEpisode (source chunks ≤20k + full character cards + recap)
 *
 * Steps 2/3/4 are GPU-heavy LLM calls sharing the GPU serial queue (same lock as media generation).
 * Task state is dual-tracked: in-process Map + sys_task (type=novel_*); the startup sweep marks
 * leftovers failed after restart.
 * Idempotent/resumable: outline/plan artifacts are persisted; reruns continue from the first
 * unfinished chunk.
 */
import { and, asc, eq } from 'drizzle-orm'
import { getActiveConfig, getTextProviderBaseUrl } from './ai.js'
import { enqueueGpuWork } from './gpu-queue.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { db, getInsertId, schema } from '../db/index.js'

/** Per-chunk target window (chars). Rewrite context = chunk content + character cards + recap;
 *  18k leaves ~2k headroom for cards/recap/system prompt; measured reliable window 20.4k (E2E verified) */
export const NOVEL_CHUNK_TARGET = 18_000
/** Hard split cap when no chapter markers exist */
export const NOVEL_CHUNK_MAX = 20_000

export interface NovelChunk {
  content: string
  chapterTitle: string | null
}

/**
 * Novel chunking (pure function, unit-testable):
 *   1. Split chapters by chapter/section/volume heading markers (see chapterRe below)
 *   2. Merge adjacent chapters until near the target window (pack small chapters)
 *   3. Single chapter over the cap → hard split on sentence boundaries
 *   4. No chapter markers at all → hard split by target window + sentence boundaries
 */
export function chunkNovel(raw: string, target = NOVEL_CHUNK_TARGET, max = NOVEL_CHUNK_MAX): NovelChunk[] {
  const text = (raw || '').replace(/\r\n/g, '\n').trim()
  if (!text) return []

  // Chapter markers: Chinese chapter/section/volume headings at line start (N is digits or Chinese numerals)
  // i18n: user-facing
  const chapterRe = /^[ \t]*(第[0-9一二三四五六七八九十百千零两]+[章回节卷][^\n]*)$/gm
  const marks: { index: number; title: string }[] = []
  let m: RegExpExecArray | null
  while ((m = chapterRe.exec(text)) !== null) {
    marks.push({ index: m.index, title: m[1].trim().slice(0, 60) })
  }

  // No chapter markers: treat the whole novel as one chapter and hard split by window
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

  // Merge adjacent chapters up to the target window (packs small chapters, reducing chunk
  // count and LLM call count)
  const merged: NovelChunk[] = []
  for (const ch of chapters) {
    const last = merged[merged.length - 1]
    if (last && (last.content.length + ch.content.length) <= target) {
      last.content += '\n\n' + ch.content
      // Keep the first chapter title; merged chunk title records the range
      last.chapterTitle = last.chapterTitle && last.chapterTitle !== ch.chapterTitle
        ? `${last.chapterTitle} ~ ${ch.chapterTitle}`
        : (last.chapterTitle || ch.chapterTitle)
    } else {
      merged.push({ ...ch })
    }
  }

  // A single chunk still over the cap (chapter too large) → hard split on sentence boundaries
  const out: NovelChunk[] = []
  for (const ch of merged) {
    out.push(...hardSplit(ch, target, max))
  }
  return out
}

/** Hard split one chunk to ≤max on sentence boundaries (。！？!?；;\n) */
function hardSplit(ch: NovelChunk, target: number, max: number): NovelChunk[] {
  if (ch.content.length <= max) return [ch]
  const parts: NovelChunk[] = []
  let pos = 0
  let partIdx = 0
  while (pos < ch.content.length) {
    let end = Math.min(pos + target, ch.content.length)
    if (end < ch.content.length) {
      // Search backwards from the window end for a sentence boundary (within the last 2k);
      // split in place if none is found
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

/** Single direct text-model call (inside the GPU serial queue); returns the text content, throws on failure */
async function callTextModel(systemPrompt: string, userContent: string, maxTokens: number, label: string): Promise<string> {
  const textConfig = await getActiveConfig('text')
  if (!textConfig) throw new Error('Text model service not configured')
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
  if (!content) throw new Error('LLM returned an empty response')
  logTaskProgress('Novel', `${label}-llm-response`, { textLen: content.length })
  return content
}

/** Extract complete JSON from raw text via bracket matching (same logic as extraction.ts, incl. truncation repair) */
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
// Step 1: import + chunk (synchronous, no LLM)
// ---------------------------------------------------------------------------
export async function importNovel(dramaId: number, content: string, replace = true): Promise<{ segmentCount: number; totalChars: number }> {
  const chunks = chunkNovel(content)
  if (!chunks.length) throw new Error('Novel content is empty')
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
// Step 2: per-chunk outline (background batch, idempotent: chunks with an outline are skipped)
// ---------------------------------------------------------------------------
export interface NovelTask {
  status: 'running' | 'done' | 'error'
  started_at: string
  finished_at?: string
  progress?: { done: number; total: number }
  error?: string
}
const tasks = new Map<string, NovelTask>()

// Audit 1107 F-15: bound the in-process task map — keys are `${dramaId}:${kind}`
// so long-running servers accumulate one entry per drama forever. Evict oldest
// finished entries past the cap; running tasks are never evicted.
const NOVEL_TASKS_MAX = 200
function setNovelTask(key: string, task: NovelTask) {
    if (!tasks.has(key) && tasks.size >= NOVEL_TASKS_MAX) {
        for (const [k, v] of tasks) {
            if (v.status !== 'running') {
                tasks.delete(k)
                if (tasks.size < NOVEL_TASKS_MAX) break
            }
        }
    }
    tasks.set(key, task)
}

export function getNovelTask(dramaId: number, kind: string): NovelTask | null {
  return tasks.get(`${dramaId}:${kind}`) || null
}

// i18n: user-facing
const OUTLINE_SYSTEM_PROMPT = [
  // i18n: user-facing
  '你是小说剧本改编助手。阅读小说片段，输出结构化 JSON 摘要（供后续分集规划使用）。只输出 JSON，不要其他文字：',
  // i18n: user-facing
  '{"summary":"剧情梗概（200-400字，按时间顺序，写清因果）","characters":[{"name":"人物名","profile":"固定人设：性别/年龄/外貌特征/性格/身份，50字内，跨片段必须一致"}],"scenes":["出现的地点及氛围"],"timeline":"时间线要点","hook":"本片段结尾的悬念/钩子"}',
].join('\n')

export async function outlineAllSegments(dramaId: number): Promise<void> {
  const key = `${dramaId}:outline`
  if (tasks.get(key)?.status === 'running') throw new Error('Outline task is already running')
  const task: NovelTask = { status: 'running', started_at: new Date().toISOString() }
  setNovelTask(key, task)
  logTaskStart('Novel', 'outline-start', { dramaId })
  void (async () => {
    try {
      const segments = await db.select().from(schema.novelSegments)
        .where(eq(schema.novelSegments.dramaId, dramaId))
        .orderBy(asc(schema.novelSegments.seq))
      if (!segments.length) throw new Error('No novel chunks; import a novel first')
      let done = 0
      for (const seg of segments) {
        if (seg.outline) { done++; continue }
        const text = await enqueueGpuWork(`novel-outline-${dramaId}-${seg.seq}`, async () =>
          callTextModel(OUTLINE_SYSTEM_PROMPT, seg.content, 2048, 'outline'))
        const parsed = extractNovelJson(text)
        if (!parsed) {
          logTaskWarn('Novel', 'outline-parse-fail', { dramaId, seq: seg.seq, textPreview: text.slice(0, 200) })
          throw new Error(`Failed to parse outline for chunk ${seg.seq}`)
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

/** Aggregate all chunk outlines into a "character cards + per-segment summary" text (shared context for planning and rewriting) */
export async function buildOutlineDigest(dramaId: number): Promise<{ digest: string; characterCards: string; segments: { seq: number; outline: any }[] }> {
  const segments = await db.select().from(schema.novelSegments)
    .where(eq(schema.novelSegments.dramaId, dramaId))
    .orderBy(asc(schema.novelSegments.seq))
  if (!segments.length) throw new Error('No novel chunks; import a novel first')
  const missing = segments.filter(s => !s.outline)
  if (missing.length) throw new Error(`${missing.length} chunks still have no outline`)
  const outlines = segments.map(s => ({ seq: s.seq, outline: JSON.parse(s.outline!) }))
  // Character cards: merge profiles by name (keep first occurrence; cross-chunk consistency is the text anchor)
  const charMap = new Map<string, string>()
  for (const { outline } of outlines) {
    for (const c of outline.characters || []) {
      if (c?.name && !charMap.has(c.name)) charMap.set(c.name, c.profile || '')
    }
  }
  const characterCards = [...charMap.entries()].map(([name, profile]) => `- ${name}：${profile}`).join('\n')
  const digest = outlines.map(({ seq, outline }) =>
    // i18n: user-facing
    `【块 ${seq}】${outline.summary || ''}${outline.hook ? `（钩子：${outline.hook}）` : ''}`).join('\n\n')
  return { digest, characterCards, segments: outlines }
}

// ---------------------------------------------------------------------------
// Step 3: episode planning (single LLM call: all chunk summaries → episode outlines + episode rows)
// ---------------------------------------------------------------------------
// i18n: user-facing
const PLAN_SYSTEM_PROMPT = [
  // i18n: user-facing
  '你是短剧分集策划。基于全书的分段剧情摘要，规划分集短剧。只输出 JSON 数组，不要其他文字：',
  // i18n: user-facing
  '[{"episode_number":1,"title":"本集标题（10字内，吸睛）","segment_range":[起块号,止块号],"synopsis":"本集剧情梗概（150-300字，写清起因-冲突-钩子）","emotional_arc":"情绪曲线一句话"}]',
  // i18n: user-facing
  '规则：',
  // i18n: user-facing
  '1. 每集对应连续的块区间（segment_range 必须覆盖所有块且不重叠）',
  // i18n: user-facing
  '2. 分集点对齐剧情转折/悬念，集尾必须留钩子',
  // i18n: user-facing
  '3. 每集时长按目标时长估算镜头量，不要硬凑集数',
].join('\n')

export async function planEpisodesFromOutlines(dramaId: number, targetMinutes = 2): Promise<{ episodeCount: number }> {
  const { digest, segments } = await buildOutlineDigest(dramaId)
  const firstSeq = segments[0]?.seq ?? 1
  const lastSeq = segments[segments.length - 1]?.seq ?? 1
  const planText = await enqueueGpuWork(`novel-plan-${dramaId}`, async () =>
    callTextModel(PLAN_SYSTEM_PROMPT,
      // i18n: user-facing
      `全书分段剧情摘要（块 ${firstSeq}-${lastSeq}）：\n\n${digest}\n\n目标每集时长：${targetMinutes} 分钟。请规划分集。`,
      8192, 'plan'))
  const plans = extractNovelJson(planText)
  if (!plans || !Array.isArray(plans) || !plans.length) throw new Error('Failed to parse episode plan')
  // Validate segment-range coverage
  const ranges = plans.map((p: any) => p.segment_range).filter(Array.isArray)
  const covered = new Set<number>()
  for (const [a, b] of ranges) {
    for (let s = Math.min(a, b); s <= Math.max(a, b); s++) covered.add(s)
  }
  const missingSeq = segments.filter(s => !covered.has(s.seq)).map(s => s.seq)
  if (missingSeq.length) {
    logTaskWarn('Novel', 'plan-coverage-gap', { dramaId, missingSeq })
    throw new Error(`Episode plan segment ranges do not cover chunks ${missingSeq.join(',')}; retry planning`)
  }

  // Rebuild episodes (planning is rerunnable: first clear old plans and the empty episodes they created)
  const oldPlans = await db.select().from(schema.novelEpisodePlans).where(eq(schema.novelEpisodePlans.dramaId, dramaId))
  for (const op of oldPlans) {
    if (op.episodeId) {
      const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, op.episodeId))
      // Only delete empty episodes created by planning and not yet rewritten (scriptContent
      // empty); episodes created manually or already holding a script are left alone
      if (ep && !ep.scriptContent) {
        await db.update(schema.episodes).set({ deletedAt: new Date().toISOString() }).where(eq(schema.episodes.id, op.episodeId))
      }
    }
  }
  await db.delete(schema.novelEpisodePlans).where(eq(schema.novelEpisodePlans.dramaId, dramaId))

  for (const p of plans) {
    const episodeNumber = Number(p.episode_number)
    if (!episodeNumber) continue
    // Reuse an undeleted episode with the same number (attach the plan to a user-created
    // episode instead of recreating it)
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
        // i18n: user-facing
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
// Step 4: per-episode rolling rewrite (source chunks + character cards + recap → scriptContent)
// ---------------------------------------------------------------------------
// i18n: user-facing (targetLanguage feeds the rewrite prompt)
export async function rewriteEpisodeFromNovel(dramaId: number, episodeId: number, targetLanguage = '中文'): Promise<{ scriptLength: number }> {
  const [plan] = await db.select().from(schema.novelEpisodePlans)
    .where(and(eq(schema.novelEpisodePlans.dramaId, dramaId), eq(schema.novelEpisodePlans.episodeId, episodeId)))
  if (!plan) throw new Error('This episode has no plan (run episode planning first)')
  const planJson = JSON.parse(plan.plan)
  const [from, to] = planJson.segment_range || []
  if (!from || !to) throw new Error('Episode plan is missing its segment range')

  const { characterCards } = await buildOutlineDigest(dramaId)
  const rangeSegs = (await db.select().from(schema.novelSegments).where(eq(schema.novelSegments.dramaId, dramaId)))
    .filter(s => s.seq >= Math.min(from, to) && s.seq <= Math.max(from, to))
    .sort((a, b) => a.seq - b.seq)
  const sourceText = rangeSegs.map(s => s.content).join('\n\n')
  const sourceChars = sourceText.length
  if (sourceChars > 22_000) {
    logTaskWarn('Novel', 'rewrite-source-too-long', { dramaId, episodeId, sourceChars })
    throw new Error(`This episode's source text is ${sourceChars} characters, exceeding the single rewrite window; adjust the episode plan`)
  }

  // Recap: the previous episode plan's recap (rolling); falls back to its synopsis
  let recap = ''
  if (plan.episodeNumber > 1) {
    const [prevPlan] = await db.select().from(schema.novelEpisodePlans)
      .where(and(eq(schema.novelEpisodePlans.dramaId, dramaId), eq(schema.novelEpisodePlans.episodeNumber, plan.episodeNumber - 1)))
    if (prevPlan) {
      recap = prevPlan.recap || JSON.parse(prevPlan.plan).synopsis || ''
    }
  }

  // i18n: user-facing
  const systemPrompt = [
    // i18n: user-facing
    '你是短剧编剧。基于小说原文改编本集短剧剧本。只输出剧本正文，不要任何解释。',
    // i18n: user-facing
    '格式要求：',
    // i18n: user-facing
    '1. 每个镜头一段：场景标头（S01 内景/外景·地点·时间）+ 画面描述 + 人物对白（@角色名，动作描述，说：「台词」）',
    // i18n: user-facing
    '2. 对白占剧本主体，台词口语化、有冲突感；每句台词 ≤60 字（TTS 单句上限）',
    // i18n: user-facing
    '3. 人物外貌/性格必须严格遵循人物卡，不得改动人设',
    // i18n: user-facing
    '4. 与前情提要在剧情上严格衔接，不重复已演过的情节',
    // i18n: user-facing
    `5. 全文使用${targetLanguage}`,
  ].join('\n')

  // i18n: user-facing
  const userContent = `【全剧人物卡】\n${characterCards}\n\n${recap ? `【前情提要】\n${recap}\n\n` : ''}【本集剧情梗概】\n${planJson.synopsis || ''}\n\n【小说原文】\n${sourceText}`

  const script = await enqueueGpuWork(`novel-rewrite-${dramaId}-${episodeId}`, async () =>
    callTextModel(systemPrompt, userContent, 16_384, 'rewrite'))

  const ts = new Date().toISOString()
  await db.update(schema.episodes)
    .set({ scriptContent: script, updatedAt: ts })
    .where(eq(schema.episodes.id, episodeId))

  // This episode's recap (rolling context for the next episode): lightweight second call,
  // failure does not block (falls back to synopsis)
  try {
    const recapText = await enqueueGpuWork(`novel-recap-${dramaId}-${episodeId}`, async () =>
      // i18n: user-facing
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

/** Episode planning + rolling rewrite of all episodes (sequential: an episode finishes before the next starts — recap dependency chain) */
export async function rewriteAllEpisodes(dramaId: number, targetLanguage = '中文' /* i18n: user-facing */): Promise<void> {
  const key = `${dramaId}:rewrite`
  if (tasks.get(key)?.status === 'running') throw new Error('Rewrite task is already running')
  const task: NovelTask = { status: 'running', started_at: new Date().toISOString() }
  setNovelTask(key, task)
  logTaskStart('Novel', 'rewrite-all-start', { dramaId })
  void (async () => {
    try {
      const plans = await db.select().from(schema.novelEpisodePlans)
        .where(eq(schema.novelEpisodePlans.dramaId, dramaId))
        .orderBy(asc(schema.novelEpisodePlans.episodeNumber))
      if (!plans.length) throw new Error('No episode plan; run episode planning first')
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
