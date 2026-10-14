/**
 * 分镜拆解直接 LLM 提取 — 绕过 Mastra Agent。
 * 4-bit Qwen3.5-4B 跑 storyboard_breaker Agent 不可靠：
 * ① 27 场景剧本 → 50+ 分镜 → 需 7 批 save_storyboards（每批 8）→ 8+ 工具调用 → scheduler 死锁
 * ② 4-bit 模型多步工具循环不可靠（调错工具、散文输出、循环重存）
 * 直接单次 LLM 调用 + JSON 输出 + 一次性 save_storyboards 绕过以上问题。
 */
import { db, schema } from '../db/index.js'
import { eq } from 'drizzle-orm'
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

/**
 * 构建分镜拆解系统提示词 — 压缩 storyboard_breaker.md 关键规则
 */
function buildSystemPrompt(characters: { id: number; name: string }[], scenes: { id: number; location: string; time: string }[], props: { id: number; name: string }[]): string {
    const charList = characters.map(c => `{id:${c.id},name:"${c.name}"}`).join(',')
    const sceneList = scenes.map(s => `{id:${s.id},location:"${s.location}",time:"${s.time}"}`).join(',')
    const propList = props.map(p => `{id:${p.id},name:"${p.name}"}`).join(',')

    return `你是资深影视分镜师，将剧本拆解为分镜段落。每个段落 8-10 秒，对应一个视频生成任务（视频模型单次生成上限 10 秒，duration 超过 10 会被截断）。

规则：
1. 按叙事节拍（开场/触发/高潮/收尾）切段，每个节拍拆为 1-3 个段落
2. 每个段落不跨场景，段落内可切镜（换景别/角度）
3. description 写画面描述：按【镜头1】【镜头2】逐子镜头描述（谁+动作+表情），有台词时写「角色名说：「台词」」，旁白写「旁白：内容」
4. video_prompt 按 3 秒一段、每段一行换行分隔；每段先写画面（谁+动作+景别），再写该段台词；提到场景用 @场景名、角色用 @角色名
5. atmosphere 写氛围、光线、色调
6. scene_id 从场景列表选，character_ids 从角色列表选，prop_ids 从道具列表选（道具被使用/特写/交接时绑定）
7. duration 8-10 秒
8. 台词预算：段内所有台词/旁白总字数 ≤ (duration−2)×4.5 字（TTS 配音约 4.5 字/秒，留 2 秒表演余量）。台词装不下时拆到下一个段落或精简台词——超预算的台词会被配音管线截断丢失

可用场景：[${sceneList}]
可用角色：[${charList}]
可用道具：[${propList}]

只输出 JSON 数组，不要输出任何其他文字：
[{"shot_number":1,"description":"【镜头1】...","video_prompt":"3秒画面...\\n3秒画面...","atmosphere":"...","duration":10,"scene_id":1,"character_ids":[1],"prop_ids":[]}]`
}

/**
 * 直接 LLM 分镜拆解：读剧本 + 资产列表 → 单次 LLM 调用 → JSON 解析 → 一次性保存
 */
export async function directStoryboardBreakdown(episodeId: number, dramaId: number): Promise<StoryboardBreakdownResult> {
    logTaskStart('StoryboardBreakdown', 'direct-llm', { episodeId, dramaId })

    // 1. 读剧本
    const [episode] = await db.select({ scriptContent: schema.episodes.scriptContent })
        .from(schema.episodes)
        .where(eq(schema.episodes.id, episodeId))
        .limit(1)
    if (!episode?.scriptContent) {
        logTaskError('StoryboardBreakdown', 'no-script', { episodeId })
        return { success: false, count: 0, text: 'no script', error: 'no script' }
    }

    // 2. 读角色/场景/道具列表（用于 ID 绑定）
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

    // 3. 构建 prompt + 直接 LLM 调用
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
    })

    if (!resp.ok) {
        const errText = await resp.text().catch(() => '')
        logTaskError('StoryboardBreakdown', 'llm-fail', { episodeId, status: resp.status, errText: errText.slice(0, 200) })
        return { success: false, count: 0, text: `LLM fail ${resp.status}`, error: errText }
    }

    const result: any = await resp.json()
    const text: string = result?.choices?.[0]?.message?.content?.trim() || ''
    logTaskProgress('StoryboardBreakdown', 'llm-response', { episodeId, textLen: text.length, textPreview: text.slice(0, 300) })

    // 4. 解析 JSON
    const storyboards = extractJson(text)
    if (!storyboards || !Array.isArray(storyboards) || storyboards.length === 0) {
        logTaskWarn('StoryboardBreakdown', 'parse-empty', { episodeId, textLen: text.length })
        return { success: false, count: 0, text, error: 'no storyboards parsed' }
    }

    logTaskProgress('StoryboardBreakdown', 'parsed', { episodeId, count: storyboards.length })

    // 5. 一次性保存（replace_existing=true 清空旧分镜）
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
 * 启动异步分镜拆解任务（立即返回）
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
