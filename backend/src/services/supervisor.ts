/**
 * Agent 监督层 — 执行 Agent 产出后由 supervisor prompt 复审一遍
 * （决策/执行/监督三层中的监督环：执行 Agent 生成 → 审阅 Agent 判定质量）。
 * 审阅用同一文本模型 + workspace/prompts/supervisor.md 提示词（4 语言），
 * 返回结构化判定 { pass, issues[], summary }；任何失败降级 pass-through 不阻断主流程。
 */
import { loadAgentPromptFile } from '../agents/prompts.js'
import { getContentLanguage } from './app-settings.js'
import { getActiveConfig, getTextProviderBaseUrl } from './ai.js'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'

export interface ReviewVerdict {
    pass: boolean
    issues: string[]
    summary: string
    /** true = 审阅链路本身失败（无配置/模型报错/解析失败），降级放行 */
    degraded: boolean
}

const DEGRADED: ReviewVerdict = { pass: true, issues: [], summary: '', degraded: true }

// 小模型输出 JSON 稳定性差：先剥 ```json 围栏再找首个 { 到最后一个 }
function extractVerdictJson(text: string): any | null {
    const stripped = text.replace(/```(?:json)?/g, '').trim()
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start < 0 || end <= start) return null
    try { return JSON.parse(stripped.slice(start, end + 1)) } catch { return null }
}

/**
 * 复审 Agent 产出。调用方应置于 GPU 串行队列内（文本模型 decode 与生图/生视频互斥）。
 * agentType 用于审阅提示词里按 Agent 类型对齐检查重点。
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
        || '你是创作质量监督员。复审 Agent 输出，只回复 JSON：{"pass": true/false, "issues": ["问题"], "summary": "一句话结论"}'

    const userPayload = [
        `Agent 类型：${agentType}`,
        `用户要求：${userMessage.slice(0, 2000)}`,
        'Agent 输出：',
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
