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
  // The native browser confirm dialog is not used
  assert.doesNotMatch(page, /[^D]confirm\(/)
})

test('drama detail hosts the asset library as a main tab', () => {
  const page = read('app/views/drama/detail.vue')

  // Main tabs: episode list / asset library (the asset library is no longer a standalone route page)
  assert.match(page, /activeTab === 'assets'/)
  assert.match(page, /function switchToAssets\(\)/)
  assert.match(page, /t\('detail\.tabs\.assets'\)/)
  // No longer navigates to a standalone assets route
  assert.doesNotMatch(page, /\/drama\/\$\{drama\.id\}\/assets/)
})

test('episode status is manually marked, not derived from script content', () => {
  const page = read('app/views/drama/detail.vue')

  // Manual status: options + dropdown marker + persistence into episodes.status
  assert.match(page, /const epStatusOptions = computed\(\(\) => \(\[/)
  assert.match(page, /function epStatus\(ep\) \{ return ep\.status \|\| 'draft' \}/)
  assert.match(page, /async function setEpisodeStatus\(ep, status\)/)
  assert.match(page, /episodeAPI\.update\(ep\.id, \{ status/)
  assert.match(page, /epStatusMenuId/)
  // Derived status removed
  assert.doesNotMatch(page, /hasScript/)
  assert.doesNotMatch(page, /已完成剧本/) // i18n: user-facing (removed-template guard)
  assert.doesNotMatch(page, /待编写/) // i18n: user-facing (removed-template guard)
})

test('asset library tab lists grouped materials with viewer', () => {
  const page = read('app/views/drama/detail.vue')

  // Data source: assets embedded in the drama detail (drama.characters/scenes/props), grouped by type
  assert.match(page, /for \(const c of d\.characters \|\| \[\]\) list\.push/)
  assert.match(page, /const assetGroups = computed\(\(\) => \{/)
  // All / characters / scenes / props filters
  assert.match(page, /assetTab = ref\('all'\)/)
  assert.match(page, /const assetTabs = computed\(\(\) => \(\[/)
  // Grid cards + preview
  assert.match(page, /:class="\['card', 'asset-card'/)
  assert.match(page, /openAssetViewer\(m\)/)
})
