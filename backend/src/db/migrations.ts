/**
 * Schema 迁移器（NFR-OPS-3）— PRAGMA user_version 版本化迁移
 *
 * 取代散落的手工 ALTER：后续加列/加表一律在 MIGRATIONS 数组追加条目，启动时按版本号
 * 顺序执行。每条含 DDL 的迁移执行前自动 VACUUM INTO 备份库文件到 <db目录>/backups/
 * （保留最近 10 份），升级失败或列缺失时可直接回滚恢复。
 */
import fs from 'fs'
import path from 'path'
import type Database from 'better-sqlite3'

export interface Migration {
    version: number
    name: string
    /** 要执行的 SQL（多条按顺序 exec）；纯标记版本可为空数组 */
    statements: string[]
}

export const MIGRATIONS: Migration[] = [
    // v1 基线：历史库的建表一直走 sqlite-schema.ts 幂等重放，此处仅开始记录版本号
    { version: 1, name: 'baseline', statements: [] },

    // v2 FR-BIZ-3 剧本版本保留：覆写前保留历史稿（JSON 数组，最近 5 版）
    { version: 2, name: 'script-history', statements: [
        'ALTER TABLE episodes ADD COLUMN script_history TEXT',
    ] },

    // v3 FR-P1-1 任务事件流（画布乐观锁随画布 UI 立项再做，见 docs/opti-plan-1015.md 决策记录）
    { version: 3, name: 'task-events', statements: [
        `CREATE TABLE IF NOT EXISTS sys_task_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            seq INTEGER NOT NULL,
            type TEXT NOT NULL,
            payload TEXT,
            created_at TEXT NOT NULL
        )`,
        'CREATE INDEX IF NOT EXISTS idx_sys_task_events_task_id ON sys_task_events (task_id, seq)',
    ] },

    // v4 FR-P1-1 补齐：Agent 级事件（thinking/tool_call/tool_result）挂在 episode 维度——
    // Agent 链路（提取/分镜/提示词）没有 sys_task 行，事件以 episodeId 归组回放
    { version: 4, name: 'task-events-episode-dim', statements: [
        'ALTER TABLE sys_task_events ADD COLUMN episode_id INTEGER',
        'CREATE INDEX IF NOT EXISTS idx_sys_task_events_episode_id ON sys_task_events (episode_id, id)',
    ] },

    // v5 PRD §10.2 度量：重试溯源——重发失败任务时带 retry_of（原任务 id），
    // 聚合接口统计「失败后重试成功率」（成功=retry_of 链上出现 completed）
    { version: 5, name: 'task-retry-of', statements: [
        'ALTER TABLE sys_task ADD COLUMN retry_of INTEGER',
    ] },
]

const MAX_BACKUPS = 10

/** 取当前 user_version */
export function currentVersion(sqlite: Database.Database): number {
    return Number(sqlite.pragma('user_version', { simple: true }) ?? 0)
}

function pruneBackups(dir: string) {
    try {
        const files = fs.readdirSync(dir)
            .filter(f => f.startsWith('pre-migration-') && f.endsWith('.sqlite'))
            .sort()
        while (files.length > MAX_BACKUPS) {
            const oldest = files.shift()
            if (oldest) fs.rmSync(path.join(dir, oldest), { force: true })
        }
    } catch { /* 备份清理失败不阻断迁移 */ }
}

/** 执行所有未应用的迁移；返回本次应用的版本名列表（用于日志/健康检查展示） */
export function runMigrations(sqlite: Database.Database, dbPath: string): string[] {
    const applied: string[] = []
    const current = currentVersion(sqlite)
    const pending = MIGRATIONS.filter(m => m.version > current)
    if (pending.length === 0) return applied

    const backupDir = path.join(path.dirname(dbPath), 'backups')
    for (const m of pending) {
        // 含 DDL 的迁移执行前自动备份（VACUUM INTO 要求目标文件不存在）
        if (m.statements.length > 0) {
            fs.mkdirSync(backupDir, { recursive: true })
            const stamp = new Date().toISOString().replace(/[:.]/g, '-')
            const backupFile = path.join(backupDir, `pre-migration-v${m.version}-${stamp}.sqlite`)
            try {
                sqlite.prepare(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`).run()
                console.log(`[migrate] backed up db to ${backupFile}`)
            } catch (err) {
                // 备份失败不阻断迁移（DDL 本身幂等/可重放），但必须大声说
                console.error(`[migrate] backup failed before v${m.version}:`, (err as Error).message)
            }
            pruneBackups(backupDir)
        }
        try {
            for (const stmt of m.statements) sqlite.exec(stmt)
            sqlite.pragma(`user_version = ${m.version}`)
            applied.push(`v${m.version} ${m.name}`)
            console.log(`[migrate] applied v${m.version} ${m.name}`)
        } catch (err) {
            console.error(`[migrate] FAILED v${m.version} ${m.name}:`, (err as Error).message)
            throw err
        }
    }
    return applied
}
