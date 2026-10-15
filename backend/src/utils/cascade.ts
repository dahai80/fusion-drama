/**
 * FR-BIZ-1 级联清理 — drama/episode 硬删除时收集并清理 DB 行 + storage 文件。
 *
 * PRD：删除需二次确认并级联清理资产文件与任务记录（DB 行+storage 文件+
 * sys_task），删除后不可恢复要明示。入口路由已做 confirm 校验，这里只管
 * 级联本身。文件删除全部走 deleteStoredFile（jail 断言防越界），收集阶段
 * 返回计数与文件清单供响应/日志审计。
 */
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db, schema } from '../db/index.js'
import { deleteStoredFile } from './storage.js'

export interface CascadeResult {
    rows: Record<string, number>
    files: { deleted: number, kept: number, keptList: string[] }
}

/** 收集行内的产物路径（null/外链 http 不算本地文件） */
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

/** 批量删文件：仍被未删行引用的保留（防悬空引用他人产物），返回删除/保留统计 */
async function deleteFiles(paths: string[], keepIfReferencedBy: 'none'): Promise<CascadeResult['files']> {
    // 引用检查：除本次级联将删的行外，任何业务表仍指向该路径则保留
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
 * Drama 硬删除级联：episodes → storyboards → 关联表（episode_characters/
 * scenes/props）→ 该 drama 的 characters/scenes/props → sys_task →
 * video_merges → sys_task_events → storage 文件。
 * 先删行后删文件（行删完后引用检查只剩跨 drama 引用这一种保留情形）。
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

    // 文件清单（删行前收集）
    const files = [
        ...localPathsOf(chars, ['imageUrl', 'localPath']),
        ...localPathsOf(scenes, ['imageUrl', 'localPath']),
        ...localPathsOf(props, ['imageUrl', 'localPath']),
        ...localPathsOf(sbs, ['composedImage', 'firstFrameImage', 'lastFrameImage', 'videoUrl']),
        ...localPathsOf(merges, ['mergedUrl', 'localPath']),
        ...localPathsOf(eps, ['videoUrl']),
    ]

    // DB 行删除（子表先删）
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
    rows.dramas = (await db.delete(schema.dramas).where(eq(schema.dramas.id, dramaId))).changes ?? 0

    const filesResult = await deleteFiles(files, 'none')
    console.log(`[cascade] drama ${dramaId} hard-deleted:`, JSON.stringify({ rows, files: { deleted: filesResult.deleted, kept: filesResult.kept } }))
    return { rows, files: filesResult }
}

/**
 * Episode 硬删除级联：storyboards + 关联表 + 该集 sys_task/video_merges +
 * 产物文件。drama 级资产（characters/scenes/props）不动——归剧集所有。
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
    rows.episodes = (await db.delete(schema.episodes).where(eq(schema.episodes.id, episodeId))).changes ?? 0

    const filesResult = await deleteFiles(files, 'none')
    console.log(`[cascade] episode ${episodeId} hard-deleted:`, JSON.stringify({ rows, files: { deleted: filesResult.deleted, kept: filesResult.kept } }))
    return { rows, files: filesResult }
}
