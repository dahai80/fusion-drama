import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const page = readFileSync(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
const studioCss = readFileSync(new URL('../app/assets/studio.css', import.meta.url), 'utf8')

test('project list is a launcher that opens the workbench directly', () => {
  assert.match(page, /项目启动台/)
  assert.match(page, /openWorkbench/)
  assert.match(page, /getWorkbenchPath/)
  assert.match(page, /进入工作台/)
  assert.doesNotMatch(page, /@click="navigateTo\(`\/drama\/\$\{d\.id\}`\)"/)
  assert.doesNotMatch(page, /navigateTo\(`\/drama\/\$\{d\.id\}`\)/)
})

test('project launcher keeps controls simple', () => {
  assert.match(page, /搜索项目/)
  assert.match(page, /新建项目/)
  assert.doesNotMatch(page, /剧集列表/)
  assert.doesNotMatch(page, /制作队列/)
  assert.doesNotMatch(page, /最近活动/)
})

test('global buttons use the revised restrained action palette', () => {
  assert.match(studioCss, /--action-primary:\s*#d96f27/)
  assert.match(studioCss, /--action-secondary:\s*#2b3138/)
  assert.match(studioCss, /--action-danger:\s*#d56f6f/)
  assert.match(studioCss, /\.btn-primary\s*\{/)
})
