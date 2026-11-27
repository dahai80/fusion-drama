/**
 * Schema migrator (NFR-OPS-3) — PRAGMA user_version versioned migrations
 *
 * Replaces scattered manual ALTERs: any future column/table addition appends an entry to the
 * MIGRATIONS array, executed in version order at startup. Each migration containing DDL is
 * preceded by an automatic VACUUM INTO backup of the db file to <db dir>/backups/ (last 10
 * kept), so a failed upgrade or missing column can be rolled back directly.
 */
import fs from 'fs'
import path from 'path'
import type Database from 'better-sqlite3'

export interface Migration {
    version: number
    name: string
    /** SQL to execute (multiple statements exec in order); marker-only versions may use an empty array */
    statements: string[]
}

export const MIGRATIONS: Migration[] = [
    // v1 baseline: legacy DBs always created tables via sqlite-schema.ts idempotent replay; this only starts version tracking
    { version: 1, name: 'baseline', statements: [] },

    // v2 FR-BIZ-3 script version history: keep prior drafts before overwriting (JSON array, last 5 versions)
    { version: 2, name: 'script-history', statements: [
        'ALTER TABLE episodes ADD COLUMN script_history TEXT',
    ] },

    // v3 FR-P1-1 task event stream (canvas optimistic locking deferred until the canvas UI is scoped; see docs/opti-plan-1015.md decision record)
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

    // v4 FR-P1-1 follow-up: agent-level events (thinking/tool_call/tool_result) hang off the episode
    // dimension — agent chains (extraction/storyboard/prompt) have no sys_task row, events replay
    // grouped by episodeId
    { version: 4, name: 'task-events-episode-dim', statements: [
        'ALTER TABLE sys_task_events ADD COLUMN episode_id INTEGER',
        'CREATE INDEX IF NOT EXISTS idx_sys_task_events_episode_id ON sys_task_events (episode_id, id)',
    ] },

    // v5 PRD §10.2 metric: retry provenance — re-submitting a failed task carries retry_of (original task id);
    // the aggregate endpoint computes the "post-failure retry success rate" (success = a completed on the retry_of chain)
    { version: 5, name: 'task-retry-of', statements: [
        'ALTER TABLE sys_task ADD COLUMN retry_of INTEGER',
    ] },

    // v6 programmable providers: user-defined image/video adapters (JS code stored in DB, hot-registered in a node:vm sandbox)
    { version: 6, name: 'custom-providers', statements: [
        `CREATE TABLE IF NOT EXISTS custom_providers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL,
            code TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )`,
    ] },

    // v7 ONNX RAG: vectorized index over scripts/characters/scenes/props (bge-small-zh CPU embeddings, top-k injected into agents)
    { version: 7, name: 'rag-chunks', statements: [
        `CREATE TABLE IF NOT EXISTS rag_chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            drama_id INTEGER NOT NULL,
            kind TEXT NOT NULL,
            title TEXT,
            content TEXT NOT NULL,
            embedding TEXT NOT NULL,
            created_at TEXT NOT NULL
        )`,
        'CREATE INDEX IF NOT EXISTS idx_rag_chunks_drama_id ON rag_chunks (drama_id)',
    ] },

    // v8 infinite canvas: storyboard node coordinates on the canvas (NULL = not placed; frontend auto-lays out by storyboard number)
    { version: 8, name: 'storyboard-canvas', statements: [
        'ALTER TABLE storyboards ADD COLUMN canvas_x REAL',
        'ALTER TABLE storyboards ADD COLUMN canvas_y REAL',
    ] },
]

const MAX_BACKUPS = 10

/** Read the current user_version */
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
    } catch { /* backup pruning failure must not block migrations */ }
}

/** Run all unapplied migrations; returns the version names applied this run (for logs/health-check display) */
export function runMigrations(sqlite: Database.Database, dbPath: string): string[] {
    const applied: string[] = []
    const current = currentVersion(sqlite)
    const pending = MIGRATIONS.filter(m => m.version > current)
    if (pending.length === 0) return applied

    const backupDir = path.join(path.dirname(dbPath), 'backups')
    for (const m of pending) {
        // Auto-backup before migrations containing DDL (VACUUM INTO requires the target file not to exist)
        if (m.statements.length > 0) {
            fs.mkdirSync(backupDir, { recursive: true })
            const stamp = new Date().toISOString().replace(/[:.]/g, '-')
            const backupFile = path.join(backupDir, `pre-migration-v${m.version}-${stamp}.sqlite`)
            try {
                sqlite.prepare(`VACUUM INTO '${backupFile.replace(/'/g, "''")}'`).run()
                console.log(`[migrate] backed up db to ${backupFile}`)
            } catch (err) {
                // Backup failure does not block migration (DDL is idempotent/replayable), but it must be loud
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
