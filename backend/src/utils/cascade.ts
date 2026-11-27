/**
 * FR-BIZ-1 cascade cleanup — collects and cleans DB rows + storage files on drama/episode hard delete.
 *
 * PRD: deletion requires a second confirmation and cascading cleanup of asset files and
 * task records (DB rows + storage files + sys_task); irreversibility after deletion must
 * be stated explicitly. The entry route already performs the confirm check; this module
 * only handles the cascade itself. All file deletions go through deleteStoredFile (jail
 * assertion prevents path escapes); the collection phase returns counts and a file list
 * for response/log auditing.
 */
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { deleteStoredFile } from './storage.js'

export interface CascadeResult {
    rows: Record<string, number>
    files: { deleted: number, kept: number, keptList: string[] }
}

/** Collects artifact paths from rows (null / external http links do not count as local files) */
function localPathsOf(rows: Record<string, any>[], keys: string[]): string[] {
    const out: string[] = []
    for (const r of rows) {
        for (const k of keys) {
            const v = r?.[k]
            if (typeof v === 'string' && v && !v.startsWith('http')) out.push(v)
        }
    }
    return [...new Set(out)]
}

/** Batch file deletion: keeps files still referenced by surviving rows (prevents dangling references to other owners' artifacts), returns delete/keep stats */
async function deleteFiles(paths: string[], keepIfReferencedBy: 'none'): Promise<CascadeResult['files']> {
    // Reference check: if any business table still points at the path (other than rows this cascade will delete), keep it
    const keptList: string[] = []
    let deleted = 0
    for (const p of paths) {
        const refs = await Promise.all([
            db.select({ id: schema.characters.id }).from(schema.characters).where(eq(schema.characters.localPath, p)).limit(1),
            db.select({ id: schema.characters.id }).from(schema.characters).where(eq(schema.characters.imageUrl, p)).limit(1),
            db.select({ id: schema.scenes.id }).from(schema.scenes).where(eq(schema.scenes.localPath, p)).limit(1),
            db.select({ id: schema.scenes.id }).from(schema.scenes).where(eq(schema.scenes.imageUrl, p)).limit(1),
            db.select({ id: schema.props.id }).from(schema.props).where(eq(schema.props.localPath, p)).limit(1),
            db.select({ id: schema.props.id }).from(schema.props).where(eq(schema.props.imageUrl, p)).limit(1),
            db.select({ id: schema.storyboards.id }).from(schema.storyboards).where(inArray(schema.storyboards.composedImage, [p])).limit(1),
            db.select({ id: schema.storyboards.id }).from(schema.storyboards).where(inArray(schema.storyboards.firstFrameImage, [p])).limit(1),
            db.select({ id: schema.storyboards.id }).from(schema.storyboards).where(inArray(schema.storyboards.lastFrameImage, [p])).limit(1),
            db.select({ id: schema.storyboards.id }).from(schema.storyboards).where(inArray(schema.storyboards.videoUrl, [p])).limit(1),
        ])
        if (refs.some(r => r.length > 0)) {
            keptList.push(p)
            continue
        }
        if (deleteStoredFile(p)) deleted++
    }
    return { deleted, kept: keptList.length, keptList: keptList.slice(0, 20) }
}

/**
 * Drama hard-delete cascade: episodes → storyboards → join tables (episode_characters/
 * scenes/props) → this drama's characters/scenes/props → sys_task → video_merges →
 * sys_task_events → storage files.
 * Rows are deleted before files (once rows are gone, the reference check only has the
 * cross-drama reference case left as a keep condition).
 */
export async function cascadeDeleteDrama(dramaId: number): Promise<CascadeResult> {
    const eps = await db.select().from(schema.episodes).where(eq(schema.episodes.dramaId, dramaId))
    const epIds = eps.map(e => e.id)

    const sbs = epIds.length
        ? await db.select().from(schema.storyboards).where(inArray(schema.storyboards.episodeId, epIds))
        : []
    const sbIds = sbs.map(s => s.id)

    const chars = await db.select().from(schema.characters).where(eq(schema.characters.dramaId, dramaId))
    const scenes = await db.select().from(schema.scenes).where(eq(schema.scenes.dramaId, dramaId))
    const props = await db.select().from(schema.props).where(eq(schema.props.dramaId, dramaId))
    const assetIds = {
        character: chars.map(c => c.id),
        scene: scenes.map(s => s.id),
        prop: props.map(p => p.id),
    }

    const tasks = await db.select().from(schema.sysTask).where(eq(schema.sysTask.dramaId, dramaId))
    const merges = await db.select().from(schema.videoMerges).where(eq(schema.videoMerges.dramaId, dramaId))

    // File list (collected before deleting rows)
    const files = [
        ...localPathsOf(chars, ['imageUrl', 'localPath']),
        ...localPathsOf(scenes, ['imageUrl', 'localPath']),
        ...localPathsOf(props, ['imageUrl', 'localPath']),
        ...localPathsOf(sbs, ['composedImage', 'firstFrameImage', 'lastFrameImage', 'videoUrl']),
        ...localPathsOf(merges, ['mergedUrl', 'localPath']),
        ...localPathsOf(eps, ['videoUrl']),
    ]

    // DB row deletion (child tables first)
    const rows: Record<string, number> = {}
    if (sbIds.length) rows.storyboards = (await db.delete(schema.storyboards).where(inArray(schema.storyboards.id, sbIds))).changes ?? 0
    if (epIds.length) {
        rows.episode_characters = (await db.delete(schema.episodeCharacters).where(inArray(schema.episodeCharacters.episodeId, epIds))).changes ?? 0
        rows.episode_scenes = (await db.delete(schema.episodeScenes).where(inArray(schema.episodeScenes.episodeId, epIds))).changes ?? 0
        rows.episode_props = (await db.delete(schema.episodeProps).where(inArray(schema.episodeProps.episodeId, epIds))).changes ?? 0
        rows.episodes = (await db.delete(schema.episodes).where(inArray(schema.episodes.id, epIds))).changes ?? 0
    }
    if (assetIds.character.length) rows.characters = (await db.delete(schema.characters).where(inArray(schema.characters.id, assetIds.character))).changes ?? 0
    if (assetIds.scene.length) rows.scenes = (await db.delete(schema.scenes).where(inArray(schema.scenes.id, assetIds.scene))).changes ?? 0
    if (assetIds.prop.length) rows.props = (await db.delete(schema.props).where(inArray(schema.props.id, assetIds.prop))).changes ?? 0
    if (tasks.length) rows.sys_tasks = (await db.delete(schema.sysTask).where(eq(schema.sysTask.dramaId, dramaId))).changes ?? 0
    if (merges.length) rows.video_merges = (await db.delete(schema.videoMerges).where(eq(schema.videoMerges.dramaId, dramaId))).changes ?? 0
    // Audit 1107 F-6: task events were never cleaned (comment claimed otherwise) —
    // delete by collected task ids plus agent-level events anchored on episodes
    rows.sys_task_events = (await db.delete(schema.sysTaskEvents).where(
        tasks.length || epIds.length
            ? or(
                tasks.length ? inArray(schema.sysTaskEvents.taskId, tasks.map(t => t.id)) : undefined,
                epIds.length ? inArray(schema.sysTaskEvents.episodeId, epIds) : undefined,
              )
            : eq(schema.sysTaskEvents.id, -1),
    )).changes ?? 0
    // RAG chunks are drama-anchored knowledge base rows
    rows.rag_chunks = (await db.delete(schema.ragChunks).where(eq(schema.ragChunks.dramaId, dramaId))).changes ?? 0
    // Novel import pipeline artifacts are cleaned with the drama (novel_segments / novel_episode_plans are both anchored by drama_id)
    rows.novel_segments = (await db.delete(schema.novelSegments).where(eq(schema.novelSegments.dramaId, dramaId))).changes ?? 0
    rows.novel_episode_plans = (await db.delete(schema.novelEpisodePlans).where(eq(schema.novelEpisodePlans.dramaId, dramaId))).changes ?? 0
    rows.prompt_history = (await db.delete(schema.promptHistory).where(eq(schema.promptHistory.dramaId, dramaId))).changes ?? 0
    rows.dramas = (await db.delete(schema.dramas).where(eq(schema.dramas.id, dramaId))).changes ?? 0

    const filesResult = await deleteFiles(files, 'none')
    console.log(`[cascade] drama ${dramaId} hard-deleted:`, JSON.stringify({ rows, files: { deleted: filesResult.deleted, kept: filesResult.kept } }))
    return { rows, files: filesResult }
}

/**
 * Episode hard-delete cascade: storyboards + join tables + the episode's sys_task/video_merges
 * + artifact files. Drama-level assets (characters/scenes/props) are untouched — they belong
 * to the drama, not the episode.
 */
export async function cascadeDeleteEpisode(episodeId: number): Promise<CascadeResult> {
    const [ep] = await db.select().from(schema.episodes).where(eq(schema.episodes.id, episodeId))
    if (!ep) return { rows: {}, files: { deleted: 0, kept: 0, keptList: [] } }

    const sbs = await db.select().from(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))
    const tasks = await db.select().from(schema.sysTask).where(eq(schema.sysTask.episodeId, episodeId))
    const merges = await db.select().from(schema.videoMerges).where(eq(schema.videoMerges.episodeId, episodeId))

    const files = [
        ...localPathsOf(sbs, ['composedImage', 'firstFrameImage', 'lastFrameImage', 'videoUrl']),
        ...localPathsOf(merges, ['mergedUrl', 'localPath']),
        ...localPathsOf([ep], ['videoUrl']),
    ]

    const rows: Record<string, number> = {}
    rows.storyboards = (await db.delete(schema.storyboards).where(eq(schema.storyboards.episodeId, episodeId))).changes ?? 0
    rows.episode_characters = (await db.delete(schema.episodeCharacters).where(eq(schema.episodeCharacters.episodeId, episodeId))).changes ?? 0
    rows.episode_scenes = (await db.delete(schema.episodeScenes).where(eq(schema.episodeScenes.episodeId, episodeId))).changes ?? 0
    rows.episode_props = (await db.delete(schema.episodeProps).where(eq(schema.episodeProps.episodeId, episodeId))).changes ?? 0
    if (tasks.length) rows.sys_tasks = (await db.delete(schema.sysTask).where(eq(schema.sysTask.episodeId, episodeId))).changes ?? 0
    if (merges.length) rows.video_merges = (await db.delete(schema.videoMerges).where(eq(schema.videoMerges.episodeId, episodeId))).changes ?? 0
    // Audit 1107 F-6: task events + agent-level events anchored on this episode
    rows.sys_task_events = (await db.delete(schema.sysTaskEvents).where(
        tasks.length
            ? or(eq(schema.sysTaskEvents.episodeId, episodeId), inArray(schema.sysTaskEvents.taskId, tasks.map(t => t.id)))
            : eq(schema.sysTaskEvents.episodeId, episodeId),
    )).changes ?? 0
    rows.episodes = (await db.delete(schema.episodes).where(eq(schema.episodes.id, episodeId))).changes ?? 0

    const filesResult = await deleteFiles(files, 'none')
    console.log(`[cascade] episode ${episodeId} hard-deleted:`, JSON.stringify({ rows, files: { deleted: filesResult.deleted, kept: filesResult.kept } }))
    return { rows, files: filesResult }
}
