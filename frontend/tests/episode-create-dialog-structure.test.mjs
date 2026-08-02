import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('add episode dialog only asks for a title', () => {
  const page = read('app/pages/drama/[id]/index.vue')

  // 删除图片/视频服务选择 UI
  assert.doesNotMatch(page, /图片生成服务/)
  assert.doesNotMatch(page, /视频生成服务/)
  assert.doesNotMatch(page, /svc-card/)
  assert.doesNotMatch(page, /svc-pick/)
  assert.doesNotMatch(page, /imageConfigs|videoConfigs/)
  assert.doesNotMatch(page, /配置将锁定/)
  assert.doesNotMatch(page, /创建并锁定配置/)

  // 保留标题输入与提交
  assert.match(page, /v-model="newEpisodeTitle"/)
  assert.match(page, /placeholder="默认按集数自动命名"/)
  assert.match(page, /留空时会自动按集数命名/)
  assert.match(page, /创建后自动锁定当前启用的图片与视频生成能力/)
  assert.match(page, /creatingEpisode \? '创建中\.\.\.' : '创建'/)
})

test('addEpisode posts only drama_id and title', () => {
  const page = read('app/pages/drama/[id]/index.vue')

  const addEpisodeBody = page.slice(page.indexOf('async function addEpisode'), page.indexOf('onMounted(load)'))
  assert.match(addEpisodeBody, /drama_id: dramaId/)
  assert.match(addEpisodeBody, /title: newEpisodeTitle\.value/)
  assert.doesNotMatch(addEpisodeBody, /image_config_id/)
  assert.doesNotMatch(addEpisodeBody, /video_config_id/)
  assert.doesNotMatch(addEpisodeBody, /aiConfigAPI/)
})

test('add episode dialog does not preload config lists', () => {
  const page = read('app/pages/drama/[id]/index.vue')

  assert.doesNotMatch(page, /loadConfigs/)
  assert.doesNotMatch(page, /aiConfigAPI\.list/)
  assert.doesNotMatch(page, /canCreateEpisode/)
})