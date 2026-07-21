import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const page = readFileSync(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
const studioCss = readFileSync(new URL('../app/assets/studio.css', import.meta.url), 'utf8')

test('project list opens project detail before choosing an episode', () => {
  assert.match(page, /项目启动台/)
  assert.match(page, /openDrama/)
  assert.match(page, /getDramaPath/)
  assert.match(page, /打开项目/)
  assert.match(page, /navigateTo\(getDramaPath\(d\)\)/)
  assert.doesNotMatch(page, /openWorkbench/)
})

test('project launcher keeps controls simple', () => {
  assert.match(page, /搜索项目/)
  assert.match(page, /新建项目/)
  assert.doesNotMatch(page, /剧集列表/)
  assert.doesNotMatch(page, /制作队列/)
  assert.doesNotMatch(page, /最近活动/)
})

test('global buttons use the revised restrained action palette', () => {
  assert.match(studioCss, /--action-primary:\s*#4c8dff/)
  assert.match(studioCss, /--action-secondary:\s*#24282d/)
  assert.match(studioCss, /--action-danger:\s*#c96b6b/)
  assert.match(studioCss, /\.btn-primary\s*\{/)
})
