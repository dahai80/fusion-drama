import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('episode card exposes a delete action', () => {
  const page = read('app/views/drama/detail.vue')
  const useApi = read('app/composables/useApi.ts')

  assert.match(useApi, /episodeAPI = \{[\s\S]*?del: \(id: number\) => api\.del\(`\/episodes\/\$\{id\}\?confirm=true`\)/)
  assert.match(page, /class="btn btn-icon btn-sm ep-delete"/)
  assert.match(page, /@click="episodeToDelete = ep"/)
  assert.match(page, /<ConfirmDialog/)
  assert.match(page, /async function confirmDelEpisode\(\)/)
  assert.match(page, /await episodeAPI\.del\(ep\.id\)/)
  // 不使用浏览器原生确认弹窗
  assert.doesNotMatch(page, /[^D]confirm\(/)
})

test('drama detail hosts the asset library as a main tab', () => {
  const page = read('app/views/drama/detail.vue')

  // 主 Tab：剧集列表 / 素材库（素材库不再是独立路由页）
  assert.match(page, /activeTab === 'assets'/)
  assert.match(page, /function switchToAssets\(\)/)
  assert.match(page, /t\('detail\.tabs\.assets'\)/)
  // 不再跳转独立 assets 路由
  assert.doesNotMatch(page, /\/drama\/\$\{drama\.id\}\/assets/)
})

test('episode status is manually marked, not derived from script content', () => {
  const page = read('app/views/drama/detail.vue')

  // 手动状态：选项 + 下拉标记 + 持久化到 episodes.status
  assert.match(page, /const epStatusOptions = computed\(\(\) => \(\[/)
  assert.match(page, /function epStatus\(ep\) \{ return ep\.status \|\| 'draft' \}/)
  assert.match(page, /async function setEpisodeStatus\(ep, status\)/)
  assert.match(page, /episodeAPI\.update\(ep\.id, \{ status/)
  assert.match(page, /epStatusMenuId/)
  // 自动推算已移除
  assert.doesNotMatch(page, /hasScript/)
  assert.doesNotMatch(page, /已完成剧本/)
  assert.doesNotMatch(page, /待编写/)
})

test('asset library tab lists grouped materials with viewer', () => {
  const page = read('app/views/drama/detail.vue')

  // 数据源：项目详情内嵌资产（drama.characters/scenes/props）按类型分组
  assert.match(page, /for \(const c of d\.characters \|\| \[\]\) list\.push/)
  assert.match(page, /const assetGroups = computed\(\(\) => \{/)
  // 全部 / 角色 / 场景 / 道具 筛选
  assert.match(page, /assetTab = ref\('all'\)/)
  assert.match(page, /const assetTabs = computed\(\(\) => \(\[/)
  // 网格卡片 + 预览
  assert.match(page, /:class="\['card', 'asset-card'/)
  assert.match(page, /openAssetViewer\(m\)/)
})
