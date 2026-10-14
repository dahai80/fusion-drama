import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('../..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const exists = (path) => existsSync(new URL(path, root))

// 2026-10 更新：MiniMax 曾整体移除，后随 MiniMax-H3 时代重新接入为官方
// 视频供应商（云端 H3 API + 本地 H3 走 fusion 供应商，见 fusion-video.ts）。
// 本文件改为断言当前形态：视频面存在、图片面仍缺位。
// （MySQL 启动清理MiniMax 配置的历史断言随 mysql-schema.ts 删除一并作废。）

test('MiniMax is an official video provider with a cloud video adapter', () => {
  const ai = read('backend/src/services/ai.ts')
  const registry = read('backend/src/services/adapters/registry.ts')
  const settings = read('frontend/app/pages/settings.vue')
  const readme = read('README.md')

  // 官方视频供应商清单含 minimax
  assert.match(ai, /video:\s*\[\s*'volcengine',\s*'minimax',\s*'aliyun',\s*'fusion'\s*\]/)
  // 适配器注册表挂载云端 MiniMax 视频适配器（本地 H3 走 fusion 适配器）
  assert.match(registry, /import \{ MiniMaxVideoAdapter \} from '\.\/minimax-video'/)
  assert.match(registry, /minimax: new MiniMaxVideoAdapter\(\)/)
  assert.equal(exists('backend/src/services/adapters/minimax-video.ts'), true)
  // 图片侧未恢复：无 minimax 图片适配器
  assert.equal(exists('backend/src/services/adapters/minimax-image.ts'), false)
  // 前端设置页提供 MiniMax 视频供应商选项；README 有文档
  assert.match(settings, /minimax: \{ label: 'MiniMax H3 官方'/)
  assert.match(readme, /minimax/i)
})
