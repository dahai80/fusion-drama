import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('add episode dialog asks for a title and a fixed video resolution', () => {
  const page = read('app/views/drama/detail.vue')
  const zh = read('app/locales/zh.json')

  // image/video service selection UI was removed
  // i18n: user-facing — asserts the zh copy is absent from the page
  assert.doesNotMatch(page, /图片生成服务/)
  // i18n: user-facing
assert.doesNotMatch(page, /视频生成服务/)
  assert.doesNotMatch(page, /svc-card/)
  assert.doesNotMatch(page, /svc-pick/)
  assert.doesNotMatch(page, /imageConfigs|videoConfigs/)
  // i18n: user-facing — asserts the zh copy is absent from the page
  assert.doesNotMatch(page, /配置将锁定/)
  // i18n: user-facing
assert.doesNotMatch(page, /创建并锁定配置/)

  // title input and submit kept (copy in i18n: detail.epCreate.*)
  assert.match(page, /v-model="newEpisodeTitle"/)
  assert.match(page, /:placeholder="t\('detail\.epCreate\.titlePlaceholder'\)"/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"titlePlaceholder": "默认按集数自动命名"/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"titleHint": "留空时会自动按集数命名/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"lockCopy": "创建后自动锁定当前启用的图片与视频生成能力。"/)
  assert.match(page, /creatingEpisode \? t\('detail\.epCreate\.creating'\) : t\('detail\.epCreate\.create'\)/)

  // video resolution: fixed at episode creation (480p/720p, default 720p)
  assert.match(page, /t\('detail\.epCreate\.resolution'\)/)
  assert.match(page, /v-model="newEpisodeResolution"/)
  assert.match(page, /const resolutionOptions = computed\(\(\) => \(\[/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"res720": "720p · 高清"/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /"res480": "480p · 流畅"/)
  assert.match(page, /newEpisodeResolution = ref\('720p'\)/)
  // i18n: user-facing — asserts the zh locale value
  assert.match(zh, /之后仍可在集卡片上修改/)
})

test('addEpisode posts drama_id, title and resolution', () => {
  const page = read('app/views/drama/detail.vue')

  const addEpisodeBody = page.slice(page.indexOf('async function addEpisode'), page.indexOf('onMounted(load)'))
  assert.match(addEpisodeBody, /drama_id: dramaId/)
  assert.match(addEpisodeBody, /title: newEpisodeTitle\.value/)
  assert.match(addEpisodeBody, /resolution: newEpisodeResolution\.value/)
  assert.doesNotMatch(addEpisodeBody, /image_config_id/)
  assert.doesNotMatch(addEpisodeBody, /video_config_id/)
  assert.doesNotMatch(addEpisodeBody, /aiConfigAPI/)
})

test('episode card resolution is editable via a dropdown persisted to episodes.resolution', () => {
  const page = read('app/views/drama/detail.vue')

  // resolution label on the card + dropdown editing (hint copy lives in i18n)
  assert.match(page, /epResMenuId/)
  assert.match(page, /function epResolution\(ep\) \{ return ep\.resolution === '480p' \? '480p' : '720p' \}/)
  assert.match(page, /async function setEpisodeResolution\(ep, resolution\)/)
  assert.match(page, /episodeAPI\.update\(ep\.id, \{ resolution \}\)/)
})

test('add episode dialog does not preload config lists', () => {
  const page = read('app/views/drama/detail.vue')

  assert.doesNotMatch(page, /loadConfigs/)
  assert.doesNotMatch(page, /aiConfigAPI\.list/)
  assert.doesNotMatch(page, /canCreateEpisode/)
})
