/**
 * Agent supervisor layer — after Agent output is executed, the supervisor prompt reviews it once more
 * (the supervision loop of the decision/execution/supervision three layers: execution Agent generates → review Agent judges quality).
 * Review uses the same text model + the workspace/prompts/supervisor.md prompt (4 languages),
 * and returns a structured verdict { pass, issues[], summary }; any failure degrades to pass-through without blocking the main flow.
 */
import { loadAgentPromptFile } from '../agents/prompts.js'
import { getContentLanguage } from './app-settings.js'
import { getActiveConfig, getTextProviderBaseUrl } from './ai.js'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'

export interface ReviewVerdict {
    pass: boolean
    issues: string[]
    summary: string
    /** true = the review chain itself failed (no config/model error/parse failure); degrades to pass-through */
    degraded: boolean
}

const DEGRADED: ReviewVerdict = { pass: true, issues: [], summary: '', degraded: true }

// Small models emit unstable JSON: strip json code fences first, then take the first { to the last }
function extractVerdictJson(text: string): any | null {
    const stripped = text.replace(/```(?:json)?/g, '').trim()
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try { return JSON.parse(stripped.slice(start, end + 1)) } catch { return null }
}

/**
 * Reviews Agent output. Callers should place this inside the GPU serial queue (text model decode is mutually exclusive with image/video generation).
 * agentType aligns the review focus by Agent type in the review prompt.
 */
export async function reviewAgentOutput(agentType: string, userMessage: string, agentOutput: string): Promise<ReviewVerdict> {
    if (!agentOutput.trim()) return DEGRADED
    const config = await getActiveConfig('text')
    if (!config) {
        logTaskWarn('Supervisor', 'no-text-config', { agentType })
        return DEGRADED
    }
    const lang = getContentLanguage()
    const promptFile = await loadAgentPromptFile('supervisor', lang)
    const systemPrompt = promptFile?.instructions
        // i18n: user-facing
        || '你是创作质量监督员。复审 Agent 输出，只回复 JSON：{"pass": true/false, "issues": ["问题"], "summary": "一句话结论"}'

    const userPayload = [
        `Agent 类型：${agentType}`, // i18n: user-facing
        `用户要求：${userMessage.slice(0, 2000)}`, // i18n: user-facing
        'Agent 输出：', // i18n: user-facing
        agentOutput.slice(0, 8000),
    ].join('\n')

    logTaskProgress('Supervisor', 'review-start', { agentType, model: config.model, outputLen: agentOutput.length })

    try {
        const resp = await fetch(`${getTextProviderBaseUrl(config)}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPayload },
                ],
                max_tokens: 1024,
                temperature: 0.1,
            }),
            signal: AbortSignal.timeout(120000),
        })
        if (!resp.ok) {
            logTaskWarn('Supervisor', 'llm-fail', { agentType, status: resp.status, body: (await resp.text().catch(() => '')).slice(0, 200) })
            return DEGRADED
        }
        const result: any = await resp.json()
        const text: string = result?.choices?.[0]?.message?.content?.trim() || ''
        const parsed = extractVerdictJson(text)
        if (!parsed || typeof parsed.pass !== 'boolean') {
            logTaskWarn('Supervisor', 'parse-fail', { agentType, textPreview: text.slice(0, 200) })
            return DEGRADED
        }
        const verdict: ReviewVerdict = {
            pass: parsed.pass,
            issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 10) : [],
            summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : '',
            degraded: false,
        }
        logTaskProgress('Supervisor', 'verdict', { agentType, pass: verdict.pass, issueCount: verdict.issues.length, summary: verdict.summary })
        return verdict
    } catch (e: any) {
        logTaskWarn('Supervisor', 'review-error', { agentType, error: e?.message })
        return DEGRADED
    }
}
