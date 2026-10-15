import { readFileSync, existsSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')

/**
 * Issue #8 护城河守卫：ffmpeg 拼接导出与本地三模型路由（LTX-2.5/H3/Wan2.2）
 * 是本项目相对纯云端方案的核心差异点。任何「对齐云端工具」的重构想移除/替换
 * 这两块时，此测试先红——商业叙事（本地优先 + 完整导出管线）不被无声稀释。
 * 若确需变更，必须显式改这里并在 PR 里说明理由。
 */
test('guard moat: local video model routing stays in fusion-video adapter', () => {
  const adapter = read('src/services/adapters/fusion-video.ts')
  const generation = read('src/services/generation.ts')
  const registry = read('src/services/adapters/registry.ts')

  // 三模型路由判定必须保留
  assert.match(adapter, /export function isMiniMaxH3/, 'H3 路由判定缺失')
  assert.match(adapter, /isWan22Ti2v5b|Wan22Ti2v5b/, 'Wan2.2 路由判定缺失')
  assert.match(adapter, /ltx-2\.5|isLtx/, 'LTX-2.5 路由缺失')
  // H3 专属参数：量化（33B 必须 dit8_te4 才能进 128GB）+ turbo LoRA
  assert.match(adapter, /dit8_te4/, 'H3 quantize 参数缺失')
  assert.match(adapter, /turbo/, 'H3 turbo LoRA 开关缺失')
  // 分辨率底座常量（短边锁）必须存在
  assert.match(adapter, /SHORT_EDGE/, '短边分辨率常量缺失')
  // generation.ts 跳翻译判定（H3/Wan2.2 中文直发）依赖这些导出
  assert.match(generation, /isMiniMaxH3/, 'generation 未消费 H3 判定（跳翻译链路）')
  // fusion 本地 provider 必须注册在适配器注册表
  assert.match(registry, /fusion/, 'fusion provider 未注册')
})

test('guard moat: ffmpeg merge/export pipeline stays in-tree', () => {
  assert.ok(existsSync(new URL('src/services/ffmpeg-merge.ts', root)), 'ffmpeg-merge.ts 不存在')
  const merge = read('src/services/ffmpeg-merge.ts')

  // 拼接核心：ffmpeg-static 内置二进制 + concat 协议 + 编码参数
  assert.match(merge, /ffmpeg-static|FFMPEG_BIN/, 'ffmpeg 二进制解析缺失')
  assert.match(merge, /concat/, 'concat 拼接协议缺失')
  assert.match(merge, /h264|libx264/, 'h264 编码缺失')
  assert.match(merge, /aac/, 'aac 音轨缺失')
})

test('guard moat: local-first story documented in README', () => {
  const readme = read('../README.md')
  assert.match(readme, /local-first|local model|offline/i, 'README 本地优先叙事缺失')
})
