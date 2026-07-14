import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const settingsPage = readFileSync(new URL('../app/pages/settings.vue', import.meta.url), 'utf8')
const useApi = readFileSync(new URL('../app/composables/useApi.ts', import.meta.url), 'utf8')

function providerPresetBlock(serviceType) {
  const presetsStart = settingsPage.indexOf('const providerPresets = {')
  assert.notEqual(presetsStart, -1, 'missing providerPresets')
  const marker = `  ${serviceType}: {`
  const start = settingsPage.indexOf(marker, presetsStart)
  assert.notEqual(start, -1, `missing ${serviceType} provider presets`)
  const end = settingsPage.indexOf('\n  },', start)
  assert.notEqual(end, -1, `unterminated ${serviceType} provider presets`)
  return settingsPage.slice(start, end)
}

test('settings page exposes official provider templates only', () => {
  assert.doesNotMatch(settingsPage, /provider:\s*'chatfire'/i)
  assert.doesNotMatch(settingsPage, /openrouter/i)
  assert.doesNotMatch(settingsPage, /huobaoPreset/i)
  assert.doesNotMatch(settingsPage, /applyHuobaoPreset/i)
  assert.doesNotMatch(settingsPage, /\/huobao-preset/)
  assert.doesNotMatch(useApi, /api\.chatfire\.site/i)
  assert.doesNotMatch(useApi, /applyHuobaoPreset/i)
  assert.doesNotMatch(useApi, /openrouter/i)
  assert.doesNotMatch(useApi, /huobaoPreset/i)
  assert.doesNotMatch(useApi, /\/huobao-preset/)

  assert.match(settingsPage, /const providers = \['ali', 'deepseek', 'gemini', 'openai', 'vidu', 'volcengine'\]/)
  assert.match(settingsPage, /https:\/\/generativelanguage\.googleapis\.com/)
  assert.match(settingsPage, /https:\/\/api\.openai\.com/)
  assert.match(settingsPage, /https:\/\/api\.deepseek\.com/)
  assert.match(settingsPage, /https:\/\/ark\.cn-beijing\.volces\.com/)
  assert.match(settingsPage, /https:\/\/dashscope\.aliyuncs\.com/)
  assert.match(settingsPage, /https:\/\/api\.vidu\.com/)
  assert.match(settingsPage, /火宝快捷配置/)
  assert.match(settingsPage, /https:\/\/api\.chatfire\.site/)
  assert.match(settingsPage, /applyHuobaoQuickConfig/)
  assert.doesNotMatch(settingsPage, /https:\/\/api\.minimax\.io/)
})

test('settings page offers official default model IDs', () => {
  assert.match(settingsPage, /gemini-3\.1-pro-preview/)
  assert.match(settingsPage, /gpt-5\.4/)
  assert.match(settingsPage, /deepseek-v4-pro/)
  assert.match(settingsPage, /gemini-3-pro-image-preview/)
  assert.match(settingsPage, /gemini-3\.1-flash-image-preview/)
  assert.match(settingsPage, /gpt-image-2/)
  assert.match(settingsPage, /doubao-seedream-5-0-260128/)
  assert.match(settingsPage, /wan2\.6-t2i/)
  assert.match(settingsPage, /doubao-seedance-2-0-260128/)
  assert.match(settingsPage, /doubao-seedance-2-0-fast-260128/)
  assert.match(settingsPage, /doubao-seedance-2-0-mini-260615/)
  assert.match(settingsPage, /wan2\.6-i2v-flash/)
  assert.match(settingsPage, /viduq3-turbo/)
  assert.match(settingsPage, /viduq3-pro/)
  assert.doesNotMatch(settingsPage, /gemini-2\.5-flash/)
  assert.doesNotMatch(settingsPage, /gpt-4\.1-mini/)
  assert.doesNotMatch(settingsPage, /gpt-image-1/)
  assert.doesNotMatch(settingsPage, /doubao-seedream-5-0-lite/)
  assert.doesNotMatch(settingsPage, /speech-2\.8-hd/)
})

test('settings page does not offer MiniMax image or video presets', () => {
  assert.doesNotMatch(providerPresetBlock('image'), /minimax/i)
  assert.doesNotMatch(providerPresetBlock('video'), /minimax/i)
  assert.doesNotMatch(settingsPage, /audio:\s*\{/)
})
