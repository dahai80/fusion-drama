import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

// FR-BIZ-1（2026-10-16 补齐）：删除改硬删除（confirm 二次确认 + utils/cascade.ts
// 级联清理 DB 行与 storage 文件），旧的软删语义由本测试随源码演进同步更新
test('episodes route hard delete requires confirm + cascade', () => {
  const route = read('src/routes/episodes.ts')

  assert.match(route, /app\.delete\('\/:id'/)
  assert.match(route, /query\('confirm'\) !== 'true' && !bodyConfirm/)
  assert.match(route, /cascadeDeleteEpisode\(id\)/)
  assert.match(route, /剧集不存在/)
})

test('drama queries exclude soft-deleted episodes', () => {
  const dramas = read('src/routes/dramas.ts')

  // 列表聚合与详情都过滤 deletedAt（历史软删行可能存在，查询侧过滤保留）
  const matches = dramas.match(/isNull\(schema\.episodes\.deletedAt\)/g) || []
  assert.ok(matches.length >= 2, `expected >=2 deletedAt filters, got ${matches.length}`)
})
