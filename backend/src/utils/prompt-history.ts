/**
 * Prompt history recorder — checklist 1107 #3
 *
 * Append-only archive of every saved final prompt. Never blocks the save:
 * failure logs a warning and moves on (history is an audit trail, not truth).
 */
import { db, schema } from '../db/index.js'
import { now } from './response.js'

export type PromptHistoryTarget = 'character' | 'scene' | 'prop' | 'storyboard_image' | 'storyboard_video'

export async function recordPromptHistory(
    dramaId: number,
    targetType: PromptHistoryTarget,
    targetId: number,
    prompt: string,
): Promise<void> {
    if (!prompt || !prompt.trim()) return
    try {
        await db.insert(schema.promptHistory).values({
            dramaId,
            targetType,
            targetId,
            prompt,
            createdAt: now(),
        })
    } catch (err: any) {
        console.warn(`[prompt-history] append failed target=${targetType}:${targetId}:`, err?.message)
    }
}
