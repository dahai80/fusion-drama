/**
 * Direct-LLM storyboard breakdown — bypasses the Mastra agent.
 * Running the storyboard_breaker agent on 4-bit Qwen3.5-4B is unreliable:
 * ① a 27-scene script → 50+ storyboards → 7 batches of save_storyboards (8 each) →
 *   8+ tool calls → scheduler deadlock
 * ② 4-bit models are unreliable in multi-step tool loops (wrong tool, prose output,
 *   re-saving in circles)
 * A single direct LLM call + JSON output + one-shot save_storyboards sidesteps all of it.
 */
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
import { Agent as UndiciAgent } from 'undici'
import { getActiveConfig, getTextProviderBaseUrl } from './ai.js'
import { extractJson } from './extraction.js'
import { storyboardTools } from '../agents/tools/storyboard-tools.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { logTaskError, logTaskProgress, logTaskStart, logTaskSuccess, logTaskWarn } from '../utils/task-logger.js'
import { enqueueGpuWork } from './gpu-queue.js'

export interface StoryboardBreakdownResult {
    success: boolean
    count: number
    text: string
    error?: string
}

// Zero-timeout dispatcher: 8k-token generations can exceed undici's default
// 300s headers timeout on local models, which surfaces as a bare "fetch failed"
const laxDispatcher = new UndiciAgent({ headersTimeout: 0, bodyTimeout: 0 })

/**
 * Build the storyboard-breakdown system prompt — condensed key rules from storyboard_breaker.md
 */
function buildSystemPrompt(characters: { id: number; name: string }[], scenes: { id: number; location: string; time: string }[], props: { id: number; name: string }[]): string {
    const charList = characters.map(c => `{id:${c.id},name:"${c.name}"}`).join(',')
    const sceneList = scenes.map(s => `{id:${s.id},location:"${s.location}",time:"${s.time}"}`).join(',')
    const propList = props.map(p => `{id:${p.id},name:"${p.name}"}`).join(',')

    // i18n: user-facing — model-facing system prompt, Chinese storyboard output is the product intent
    return [
      // i18n: user-facing
      `你是资深影视分镜师，将剧本拆解为分镜段落。每个段落 8-10 秒，对应一个视频生成任务（视频模型单次生成上限 10 秒，duration 超过 10 会被截断）。`,
      ``,
      // i18n: user-facing
      `规则：`,
      // i18n: user-facing
      `1. 按叙事节拍（开场/触发/高潮/收尾）切段，每个节拍拆为 1-3 个段落`,
      // i18n: user-facing
      `2. 每个段落不跨场景，段落内可切镜（换景别/角度）`,
      // i18n: user-facing
      `3. description 写画面描述：按【镜头1】【镜头2】逐子镜头描述，每个【镜头N】以「景别+机位角度+运镜：」开头（如「中景，过肩，缓推：」），随后写画面（谁+动作+表情），有台词时写「角色名说：「台词」」，旁白写「旁白：内容」`,
      // i18n: user-facing
      `4. video_prompt 按 3 秒一段、每段一行换行分隔；每段先写运镜与景别（取自对应【镜头N】三要素，显式写出如「中景，过肩，缓推」），再写画面（谁+动作），再写该段台词；提到场景用 @场景名、角色用 @角色名`,
      // i18n: user-facing
      `5. atmosphere 写氛围、光线、色调`,
      // i18n: user-facing
      `6. scene_id 从场景列表选，character_ids 从角色列表选，prop_ids 从道具列表选（道具被使用/特写/交接时绑定）`,
      // i18n: user-facing
      `7. duration 8-10 秒`,
      // i18n: user-facing
      `8. 台词预算：段内所有台词/旁白总字数 ≤ (duration−2)×4.5 字（TTS 配音约 4.5 字/秒，留 2 秒表演余量）。台词装不下时拆到下一个段落或精简台词——超预算的台词会被配音管线截断丢失`,
      ``,
      // i18n: user-facing
      `镜头语言规则（硬约束）：`,
      // i18n: user-facing
      `- 景别用词限定：远景/全景/中景/中近景/近景/特写；机位角度：平视/俯拍/仰拍/过肩；运镜：固定/缓推/缓拉/左摇/右摇/上摇/下摇/跟拍/手持`,
      // i18n: user-facing
      `- 相邻子镜头景别不得重复，必须形成景别落差`,
      // i18n: user-facing
      `- 节拍对应镜头语法：开场或新场景首个子镜头用远景/全景定场；两人对白用正反打（中近景与近景交替、过肩机位）；情感爆发或关键揭示用特写缓推；反转瞬间插入 1 个特写；收尾用缓拉或上摇回到全景`,
      // i18n: user-facing
      `- 静止镜头连续不超过 2 个子镜头；每个爆点段至少 1 个缓推或跟拍`,
      ``,
      // i18n: user-facing
      `可用场景：[${sceneList}]`,
      // i18n: user-facing
      `可用角色：[${charList}]`,
      // i18n: user-facing
      `可用道具：[${propList}]`,
      ``,
      // i18n: user-facing
      `只输出 JSON 数组，不要输出任何其他文字：`,
      // i18n: user-facing
      `[{"shot_number":1,"description":"【镜头1】...","video_prompt":"3秒画面...\\n3秒画面...","atmosphere":"...","duration":10,"scene_id":1,"character_ids":[1],"prop_ids":[]}]`
    ].join('\n')
}

/**
 * Direct-LLM storyboard breakdown: read script + asset lists → single LLM call → JSON
 * parse → one-shot save
 */
export async function directStoryboardBreakdown(episodeId: number, dramaId: number): Promise<StoryboardBreakdownResult> {
    logTaskStart('StoryboardBreakdown', 'direct-llm', { episodeId, dramaId })

    // 1. read the script
    const [episode] = await db.select({ scriptContent: schema.episodes.scriptContent })
        .from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId))
        .limit(1)
    if (!episode?.scriptContent) {
        logTaskError('StoryboardBreakdown', 'no-script', { episodeId })
        return { success: false, count: 0, text: 'no script', error: 'no script' }
    }

    // 2. read character/scene/prop lists (for ID binding)
    const characters = await db.select({ id: schema.characters.id, name: schema.characters.name })
        .from(schema.characters).where(eq(schema.characters.dramaId, dramaId))
    const scenes = await db.select({ id: schema.scenes.id, location: schema.scenes.location, time: schema.scenes.time })
        .from(schema.scenes).where(eq(schema.scenes.dramaId, dramaId))
    const props = await db.select({ id: schema.props.id, name: schema.props.name })
        .from(schema.props).where(eq(schema.props.dramaId, dramaId))

    logTaskProgress('StoryboardBreakdown', 'context-loaded', {
        episodeId, scriptLen: episode.scriptContent.length,
        characters: characters.length, scenes: scenes.length, props: props.length,
    })

    // 3. build the prompt + direct LLM call
    const textConfig = await getActiveConfig('text')
    if (!textConfig) {
        logTaskError('StoryboardBreakdown', 'no-text-config', { episodeId })
        return { success: false, count: 0, text: 'no config', error: 'no text config' }
    }
    const baseUrl = getTextProviderBaseUrl(textConfig)
    const systemPrompt = buildSystemPrompt(characters, scenes, props)

    logTaskProgress('StoryboardBreakdown', 'llm-call', {
        episodeId, model: textConfig.model,
        promptLen: systemPrompt.length + episode.scriptContent.length,
    })

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
            max_tokens: 8192,
            temperature: 0.3,
        }),
        // @ts-expect-error undici dispatcher option, mirrored from generation.ts laxDispatcher
        dispatcher: laxDispatcher,
    })

    if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        logTaskError('StoryboardBreakdown', 'llm-fail', { episodeId, status: resp.status, errText: errText.slice(0, 200) })
        return { success: false, count: 0, text: `LLM fail ${resp.status}`, error: errText }
    }

    const result: any = await resp.json()
    const text: string = result?.choices?.[0]?.message?.content?.trim() || ''
    logTaskProgress('StoryboardBreakdown', 'llm-response', { episodeId, textLen: text.length, textPreview: text.slice(0, 300) })

    // 4. parse the JSON
    const storyboards = extractJson(text)
    if (!storyboards || !Array.isArray(storyboards) || storyboards.length === 0) {
        logTaskWarn('StoryboardBreakdown', 'parse-empty', { episodeId, textLen: text.length })
        return { success: false, count: 0, text, error: 'no storyboards parsed' }
    }

    logTaskProgress('StoryboardBreakdown', 'parsed', { episodeId, count: storyboards.length })

    // 5. one-shot save (replace_existing=true clears old storyboards)
    const requestContext = buildAgentRequestContext({ episodeId, dramaId })
    try {
        const toolResult = await storyboardTools.saveStoryboards.execute!(
            { replace_existing: true, storyboards } as any,
            { requestContext } as any,
        )
        logTaskSuccess('StoryboardBreakdown', 'saved', { episodeId, count: storyboards.length, toolResult })
        return { success: true, count: storyboards.length, text }
    } catch (e: any) {
        logTaskError('StoryboardBreakdown', 'save-fail', { episodeId, error: e?.message })
        return { success: false, count: 0, text, error: e?.message }
    }
}

/**
 * Start an async storyboard-breakdown task (returns immediately)
 */
export async function startStoryboardBreakdown(episodeId: number, dramaId: number): Promise<boolean> {
    logTaskStart('StoryboardBreakdown', 'async-start', { episodeId, dramaId })

    enqueueGpuWork(`StoryboardBreakdown-ep${episodeId}`, () => directStoryboardBreakdown(episodeId, dramaId))
        .then((result) => {
            if (result.success) {
                logTaskSuccess('StoryboardBreakdown', 'async-done', { episodeId, count: result.count })
            } else {
                logTaskError('StoryboardBreakdown', 'async-fail', { episodeId, error: result.error })
            }
        })
        .catch((err: any) => {
            logTaskError('StoryboardBreakdown', 'async-error', { episodeId, error: err?.message })
        })

    return true
}
