import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const studioCss = readFileSync(new URL('../app/assets/studio.css', import.meta.url), 'utf8')
const indexPage = readFileSync(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
const defaultLayout = readFileSync(new URL('../app/layouts/default.vue', import.meta.url), 'utf8')
const baseSelect = readFileSync(new URL('../app/components/BaseSelect.vue', import.meta.url), 'utf8')
const dramaDetail = readFileSync(new URL('../app/pages/drama/[id]/index.vue', import.meta.url), 'utf8')
const episodeWorkbench = readFileSync(new URL('../app/pages/drama/[id]/episode/[episodeNumber].vue', import.meta.url), 'utf8')

test('global button system exposes complete button tokens and states', () => {
  assert.match(studioCss, /--button-height:\s*36px/)
  assert.match(studioCss, /--button-height-sm:\s*30px/)
  assert.match(studioCss, /--button-height-icon:\s*32px/)
  assert.match(studioCss, /--button-border:\s*rgba\(242,238,230,0\.10\)/)
  assert.match(studioCss, /--button-focus:\s*rgba\(217,111,39,0\.24\)/)
  assert.match(studioCss, /\.btn:focus-visible\s*\{/)
  assert.match(studioCss, /\.btn-danger\s*\{/)
  assert.match(studioCss, /\.btn-danger:hover\s*\{/)
})

test('button-like controls share focus-visible and active hooks', () => {
  assert.match(indexPage, /\.filter-chip:focus-visible\s*\{/)
  assert.match(indexPage, /\.menu-item:focus-visible\s*\{/)
  assert.match(defaultLayout, /\.nav-link:focus-visible\s*\{/)
  assert.match(defaultLayout, /\.brand:focus-visible\s*\{/)
  assert.match(baseSelect, /\.base-select-trigger:focus-visible\s*\{/)
  assert.match(baseSelect, /\.base-select-option:focus-visible\s*\{/)
})

test('custom return buttons use the unified button token surface', () => {
  assert.match(dramaDetail, /background:\s*var\(--button-bg\)/)
  assert.match(dramaDetail, /box-shadow:\s*var\(--button-shadow\)/)
  assert.match(dramaDetail, /\.back-btn:focus-visible\s*\{/)
  assert.match(episodeWorkbench, /background:\s*var\(--button-bg\)/)
  assert.match(episodeWorkbench, /box-shadow:\s*var\(--button-shadow\)/)
  assert.match(episodeWorkbench, /\.back-btn:focus-visible\s*\{/)
})
