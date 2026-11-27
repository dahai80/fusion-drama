import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const page = readFileSync(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
const zh = readFileSync(new URL('../app/locales/zh.json', import.meta.url), 'utf8')
const studioCss = readFileSync(new URL('../app/assets/studio.css', import.meta.url), 'utf8')

test('project list opens project detail before choosing an episode', () => {
  // copy lives in i18n: index.openProject
  assert.match(page, /openDrama/)
  assert.match(page, /getDramaPath/)
  assert.match(page, /function openDrama\(d\) \{/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"openProject": "打开项目"/)
  assert.doesNotMatch(page, /openWorkbench/)
})

test('project status is manually marked, not derived from content', () => {
  // manual status: options + dropdown marker + persisted to dramas.status (copy in i18n)
  assert.match(page, /const statusOptions = computed\(\(\) => \(\[/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"draft": "待开始"/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"active": "进行中"/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"completed": "已完成"/)
  assert.match(page, /function currentStatus\(d\) \{ return d\.status \|\| 'draft' \}/)
  assert.match(page, /function setDramaStatus/)
  assert.match(page, /dramaAPI\.update\(d\.id, \{ status \}\)/)
  assert.match(page, /statusMenuId/)
  // filtering and counting are based on the manual status
  assert.match(page, /currentStatus\(d\) === statusFilter\.value/)
  assert.match(page, /currentStatus\(d\) === 'active'/)
  // auto-derived status was removed: no progress-bar derivation
  assert.doesNotMatch(page, /getProgress/)
})

test('project launcher keeps controls simple', () => {
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"searchPlaceholder": "搜索项目"/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"title": "新建项目"/)
  // i18n: user-facing — asserts the zh locale copy is absent from the page
  assert.doesNotMatch(page, /剧集列表/)
  // i18n: user-facing
  assert.doesNotMatch(page, /制作队列/)
  // i18n: user-facing
  assert.doesNotMatch(page, /最近活动/)
})

test('create dialog fixes aspect ratio at project creation', () => {
  // copy lives in i18n: index.createDialog.aspectRatio / index.ratio.*
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"aspectRatio": "画面比例"/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"aspectRatioHint": "创建后固定/)
  assert.match(page, /v-model="form\.aspect_ratio"/)
  assert.match(page, /aspectRatioOptions/)
  assert.match(page, /aspect_ratio: '16:9'/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"landscape": "16:9 · 横屏"/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"portrait": "9:16 · 竖屏"/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"square": "1:1 · 方形"/)
  // i18n: user-facing — asserts the zh locale copy is absent from the page
  assert.doesNotMatch(page, /计划集数/)
})

test('global buttons use the brand action palette', () => {
  assert.match(studioCss, /--action-primary:\s*#f97316/)
  assert.match(studioCss, /--action-secondary:\s*#e8eaee/)
  assert.match(studioCss, /--action-danger:\s*#dc2626/)
  assert.match(studioCss, /\.btn-primary\s*\{/)
})
