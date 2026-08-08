/**
 * 导出初始化 SQL — 把 src/db/mysql-schema.ts 中的内嵌 DDL/DML 生成为独立 init.sql
 *
 * 用法: npx tsx scripts/export-init-sql.ts [输出路径]
 * 默认输出: <repo>/docker/init.sql
 *
 * 说明:
 * - 应用启动时本就会自动执行同样的初始化(initMySqlSchema),该文件是可选产物,
 *   用于 DBA 审核、预建表或挂到 MySQL 容器的 /docker-entrypoint-initdb.d/
 * - 列补齐(backfill)语句在代码里是幂等的(SHOW COLUMNS 检查后才 ALTER),
 *   MySQL 不支持 ADD COLUMN IF NOT EXISTS,且新建表已包含全部列,故仅以注释形式导出
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  mysqlSchemaStatements,
  mysqlColumnBackfillStatements,
  mysqlDropTableStatements,
  mysqlDataCleanupStatements,
  mysqlDataSeedStatements,
} from '../src/db/mysql-schema.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outPath = path.resolve(process.argv[2] || path.join(__dirname, '../../docker/init.sql'))

/** 把 ? 占位符内联为 SQL 字面量(导出静态文件,不走参数化) */
function inlineParams(sql: string, params: unknown[]): string {
  let i = 0
  const inlined = sql.replace(/\?/g, () => {
    const v = params[i++]
    if (v === null || v === undefined) return 'NULL'
    if (typeof v === 'number') return String(v)
    return `'${String(v).replace(/'/g, "''")}'`
  })
  if (i !== params.length) throw new Error(`参数数量与占位符不匹配: ${sql}`)
  return inlined
}

const sections: string[] = []

sections.push(`-- ============================================================================
-- Huobao Drama 初始化 SQL
-- 由 backend/scripts/export-init-sql.ts 从 backend/src/db/mysql-schema.ts 生成
-- 生成时间: ${new Date().toISOString()}
--
-- 注意: 应用启动时会自动执行同等初始化(幂等),本文件不是部署必需,
--       仅供 DBA 审核或在应用外预建表使用
-- ============================================================================

SET NAMES utf8mb4;
`)

sections.push(`-- ----------------------------------------------------------------------------
-- 1. 建表(${mysqlSchemaStatements.length} 张)
-- ----------------------------------------------------------------------------
${mysqlSchemaStatements.map(s => `${s};`).join('\n\n')}
`)

sections.push(`-- ----------------------------------------------------------------------------
-- 2. 废弃表清理
-- ----------------------------------------------------------------------------
${mysqlDropTableStatements.map(s => `${s};`).join('\n')}
`)

sections.push(`-- ----------------------------------------------------------------------------
-- 3. 历史数据迁移清理(对全新数据库为 no-op,与应用启动行为保持一致)
-- ----------------------------------------------------------------------------
${mysqlDataCleanupStatements.map(s => `${inlineParams(s.sql, s.params)};`).join('\n')}
`)

sections.push(`-- ----------------------------------------------------------------------------
-- 4. 种子数据: 风格预设(幂等,只补缺失行)
-- ----------------------------------------------------------------------------
${mysqlDataSeedStatements.map(s => `${inlineParams(s.sql, s.params)};`).join('\n')}
`)

sections.push(`-- ----------------------------------------------------------------------------
-- 附: 列补齐语句(仅用于老库升级;新建表已包含全部列,无需执行)
-- 代码中通过 SHOW COLUMNS 检查后按需执行,MySQL 不支持 ADD COLUMN IF NOT EXISTS
-- ----------------------------------------------------------------------------
${mysqlColumnBackfillStatements.map(s => `-- ${s.sql};`).join('\n')}
`)

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, sections.join('\n'), 'utf8')
console.log(`✅ 已导出: ${outPath}`)
console.log(`   建表 ${mysqlSchemaStatements.length} 条, 清理 ${mysqlDataCleanupStatements.length} 条, 种子 ${mysqlDataSeedStatements.length} 条`)
