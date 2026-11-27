/**
 * Final prompt service
 * Before image generation, ensures characters/scenes/props already have a "final prompt":
 * - Character → four views (character turnaround: front / 45-degree side / 90-degree side / back)
 * - Scene → fixed viewpoint + foreground/midground/background
 * - Prop → single product shot on a pure white background
 * Runs the prompt_generator Agent to create and save it when missing; returns '' on failure so the caller falls back to locally assembled prompts
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { mastra } from '../mastra/index.js'
import { buildAgentRequestContext } from '../agents/context.js'
import { logTaskError, logTaskProgress } from '../utils/task-logger.js'

type CharacterRow = typeof schema.characters.$inferSelect
type SceneRow = typeof schema.scenes.$inferSelect
type PropRow = typeof schema.props.$inferSelect

/** Text model/config override selected in the top bar (unset follows the Agent and text config defaults) */
export interface PromptAgentOptions { model?: string; configId?: number }

async function runPromptAgent(episodeId: number, dramaId: number, message: string, opts?: PromptAgentOptions) {
  const agent = mastra.getAgent('prompt_generator')
  if (!agent) throw new Error('Image prompt Agent unavailable')
  const requestContext = buildAgentRequestContext({
    episodeId,
    dramaId,
    modelOverride: opts?.model || undefined,
    textConfigId: opts?.configId || undefined,
  })
  await agent.generate([{ role: 'user', content: message }], { maxSteps: 12, requestContext })
}

/** Ensures the character has a four-view final prompt and returns it ('' on failure); force ignores any existing prompt and regenerates */
export async function ensureCharacterFinalPrompt(char: CharacterRow, episodeId: number, force = false, opts?: PromptAgentOptions): Promise<string> {
  if (char.finalPrompt && !force) return char.finalPrompt
  try {
    logTaskProgress('FinalPrompt', 'character-generate', { characterId: char.id, episodeId })
    await runPromptAgent(episodeId, char.dramaId,
      `为角色「${char.name}」(character_id=${char.id}) 生成四视图最终提示词，并调用 save_character_final_prompt 保存。`, opts) // i18n: user-facing
    const [fresh] = await db.select().from(schema.characters).where(eq(schema.characters.id, char.id))
    return fresh?.finalPrompt || ''
  } catch (err: any) {
    logTaskError('FinalPrompt', 'character-generate', { characterId: char.id, error: err.message })
    return ''
  }
}

/** Ensures the scene has a fixed-viewpoint (foreground/midground/background) final prompt and returns it ('' on failure); force ignores any existing prompt and regenerates */
export async function ensureSceneFinalPrompt(scene: SceneRow, episodeId: number, force = false, opts?: PromptAgentOptions): Promise<string> {
  if (scene.finalPrompt && !force) return scene.finalPrompt
  try {
    logTaskProgress('FinalPrompt', 'scene-generate', { sceneId: scene.id, episodeId })
    await runPromptAgent(episodeId, scene.dramaId,
      `为场景「${scene.location}」(scene_id=${scene.id}) 生成固定视角（前景/中景/后景）最终提示词，并调用 save_scene_final_prompt 保存。注意：这是无人物空镜——场景图中不能出现任何的人（含背影、剪影、倒影、照片里的人），即使场景描述提到人物活动也必须剔除，只保留场景本身。`, opts) // i18n: user-facing
    const [fresh] = await db.select().from(schema.scenes).where(eq(schema.scenes.id, scene.id))
    return fresh?.finalPrompt || ''
  } catch (err: any) {
    logTaskError('FinalPrompt', 'scene-generate', { sceneId: scene.id, error: err.message })
    return ''
  }
}

/** Ensures the prop has a white-background single-product final prompt and returns it ('' on failure); force ignores any existing prompt and regenerates */
export async function ensurePropFinalPrompt(prop: PropRow, episodeId: number, force = false, opts?: PromptAgentOptions): Promise<string> {
  if (prop.finalPrompt && !force) return prop.finalPrompt
  try {
    logTaskProgress('FinalPrompt', 'prop-generate', { propId: prop.id, episodeId })
    await runPromptAgent(episodeId, prop.dramaId,
      `为道具「${prop.name}」(prop_id=${prop.id}) 生成白底单品最终提示词，并调用 save_prop_final_prompt 保存。`, opts) // i18n: user-facing
    const [fresh] = await db.select().from(schema.props).where(eq(schema.props.id, prop.id))
    return fresh?.finalPrompt || ''
  } catch (err: any) {
    logTaskError('FinalPrompt', 'prop-generate', { propId: prop.id, error: err.message })
    return ''
  }
}
