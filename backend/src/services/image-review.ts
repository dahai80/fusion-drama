/**
 * Image review gate — checklist 1107 #4 (absorbed from prompt-optimizer eval loop)
 *
 * After a local (fusion) image generation completes, a VLM scores the image on
 * three dims against the prompt: consistency / quality / artifacts (0-10 each).
 * Low score -> generation.ts fires ONE corrective retry (appended avoid-list);
 * retries skip review to prevent loops.
 *
 * Scope: fusion (local) provider only by default — zero marginal API cost.
 * Cloud providers opt-in via FUSION_IMAGE_REVIEW=1.
 */
import fs from 'fs'
import { getActiveConfig, getTextProviderBaseUrl } from './ai.js'
import { logTaskProgress, logTaskWarn } from '../utils/task-logger.js'
import { getContainedAbsolutePath } from '../utils/storage.js'

export interface ImageReview {
    score: number
    consistency: number
    quality: number
    artifacts: number
    issues: string
}

const REVIEW_SYSTEM_PROMPT = `You are an image QA engine for a drama production pipeline. Compare the generated image against the image-generation prompt. Score three dimensions 0-10 (integer). All dimensions are "higher is better":
- consistency: 10 = image matches the prompt exactly; 0 = completely different subject/composition.
- quality: 10 = technically perfect (sharp, correct anatomy and proportions); 0 = unusable.
- artifacts: 10 = completely clean (no gibberish text/watermarks, no duplicated limbs, no glitches); 0 = full of such defects.
Respond with ONLY this JSON, no other text:
{"consistency":0,"quality":0,"artifacts":0,"issues":"one short sentence naming the worst defect, empty string if none"}`

/** extract first JSON object from raw model output (truncation/ Fence tolerant) */
function parseReviewJson(raw: string): ImageReview | null {
    const start = raw.indexOf('{')
    if (start < 0) return null
    let depth = 0
    let inStr = false
    let esc = false
    for (let i = start; i < raw.length; i++) {
        const ch = raw[i]
        if (esc) { esc = false; continue }
        if (ch === '\\') { esc = true; continue }
        if (ch === '"') { inStr = !inStr; continue }
        if (inStr) continue
        if (ch === '{') depth++
        else if (ch === '}') {
            depth--
            if (depth === 0) {
                try {
                    const j = JSON.parse(raw.slice(start, i + 1))
                    const c = Math.max(0, Math.min(10, Number(j.consistency) || 0))
                    const q = Math.max(0, Math.min(10, Number(j.quality) || 0))
                    let a = Math.max(0, Math.min(10, Number(j.artifacts) || 0))
                    // Qwen2.5-VL bias (E2E 1107): clean images get artifacts=0 with
                    // empty issues; defective ones get a low score WITH issue text.
                    // Re-map the "0 + no issues" case to clean instead of worst.
                    const issues = String(j.issues || '').trim()
                    if (a === 0 && !issues) a = 10
                    return { score: (c + q + a) / 3, consistency: c, quality: q, artifacts: a, issues: issues.slice(0, 300) }
                } catch { return null }
            }
        }
    }
    return null
}

/** review gate enabled: fusion local provider by default, cloud via env opt-in */
export function imageReviewEnabled(provider: string | undefined | null): boolean {
    const flag = (process.env.FUSION_IMAGE_REVIEW || '').toLowerCase()
    if (flag === '1' || flag === 'true') return true
    if (flag === '0' || flag === 'false') return false
    return provider === 'fusion'
}

/** Vision model used for review: env override, else the local 7B VL default */
function reviewModelName(): string {
    return process.env.FUSION_IMAGE_REVIEW_MODEL || 'mlx-community--Qwen2.5-VL-7B-Instruct-4bit'
}

/**
 * Score a generated image against its prompt. Returns null when the gate is
 * disabled, the config is missing, or the review call fails (review is
 * best-effort — never blocks or fails the image task itself).
 */
export async function reviewGeneratedImage(
    localPath: string,
    prompt: string,
    provider: string | undefined | null,
    taskLabel: string,
    taskId: number,
): Promise<ImageReview | null> {
    if (!imageReviewEnabled(provider)) return null
    try {
        const cfg = await getActiveConfig('text')
        if (!cfg?.baseUrl) return null
        const abs = getContainedAbsolutePath(localPath)
        if (!fs.existsSync(abs)) return null
        const b64 = fs.readFileSync(abs).toString('base64')
        const dataUrl = `data:image/png;base64,${b64}`
        const started = Date.now()
        logTaskProgress(taskLabel, 'image-review-start', { id: taskId, model: reviewModelName() })
        const resp = await fetch(`${getTextProviderBaseUrl(cfg).replace(/\/$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${cfg.apiKey}`,
            },
            body: JSON.stringify({
                model: reviewModelName(),
                messages: [
                    { role: 'system', content: REVIEW_SYSTEM_PROMPT },
                    { role: 'user', content: [
                        { type: 'text', text: `Prompt:\n${prompt.slice(0, 4000)}` },
                        { type: 'image_url', image_url: { url: dataUrl } },
                    ] },
                ],
                max_tokens: 300,
                temperature: 0.1,
            }),
            signal: AbortSignal.timeout(300_000),
        })
        if (!resp.ok) throw new Error(`review API ${resp.status}`)
        const result: any = await resp.json()
        const review = parseReviewJson(String(result?.choices?.[0]?.message?.content || ''))
        if (!review) throw new Error('review response not parseable JSON')
        logTaskProgress(taskLabel, 'image-review-done', { id: taskId, ms: Date.now() - started, ...review })
        return review
    } catch (err: any) {
        logTaskWarn(taskLabel, 'image-review-failed', { id: taskId, error: err?.message })
        return null
    }
}

/** retry threshold: any dimension <= 4 or weighted average < 6.5 */
export function reviewNeedsRetry(review: ImageReview): boolean {
    if (review.consistency <= 4 || review.quality <= 4 || review.artifacts <= 4) return true
    return review.score < 6.5
}

/** corrective suffix appended to the prompt on the single retry */
export function reviewRetryPrompt(originalPrompt: string, review: ImageReview): string {
    const avoid = review.issues || 'artifacts, malformed anatomy, watermark-like text'
    return `${originalPrompt}\n\navoid: ${avoid}`
}
