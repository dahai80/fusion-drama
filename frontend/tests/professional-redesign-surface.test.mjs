import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const studioCss = readFileSync(new URL('../app/assets/studio.css', import.meta.url), 'utf8')
const indexPage = readFileSync(new URL('../app/pages/index.vue', import.meta.url), 'utf8')
const defaultLayout = readFileSync(new URL('../app/layouts/default.vue', import.meta.url), 'utf8')
const episodeWorkbench = readFileSync(new URL('../app/pages/drama/[id]/episode/[episodeNumber].vue', import.meta.url), 'utf8')
const dramaDetail = readFileSync(new URL('../app/pages/drama/[id]/index.vue', import.meta.url), 'utf8')
const settingsPage = readFileSync(new URL('../app/pages/settings.vue', import.meta.url), 'utf8')

function cssBlock(source, selector) {
  const start = source.indexOf(selector)
  assert.notEqual(start, -1, `missing selector ${selector}`)
  const open = source.indexOf('{', start)
  assert.notEqual(open, -1, `missing block for ${selector}`)

  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }

  throw new Error(`unterminated block for ${selector}`)
}

test('theme exposes a professional dark material system', () => {
  assert.match(studioCss, /--surface-base:\s*#0f1114/)
  assert.match(studioCss, /--surface-raised:\s*rgba\(22,25,29,0\.94\)/)
  assert.match(studioCss, /--surface-muted:\s*rgba\(31,36,42,0\.72\)/)
  assert.match(studioCss, /--surface-outline:\s*rgba\(242,238,230,0\.08\)/)
  assert.match(studioCss, /--accent:\s*#d96f27/)
})

test('project entry is redesigned as a focused launcher board', () => {
  assert.match(indexPage, /class="launcher launcher-board"/)
  assert.match(indexPage, /class="[^"]*project-slate[^"]*"/)
  assert.match(indexPage, /background:\s*var\(--surface-raised\)/)
  assert.match(indexPage, /box-shadow:\s*var\(--shadow-panel\)/)
})

test('global header uses the same dark console material', () => {
  assert.match(defaultLayout, /background:\s*var\(--surface-raised\)/)
  assert.match(defaultLayout, /border-bottom:\s*1px solid var\(--surface-outline\)/)
})

test('workbench removes legacy light panels from the main production surface', () => {
  assert.match(episodeWorkbench, /background:\s*var\(--surface-raised\)/)
  assert.match(episodeWorkbench, /background:\s*var\(--surface-muted\)/)
  assert.doesNotMatch(episodeWorkbench, /rgba\(255,255,255,0\.(56|66|68|72|74|78|86|90|92|96)\)/)
  assert.doesNotMatch(episodeWorkbench, /rgba\(246,\s*248,\s*252,\s*0\.92\)/)
  assert.doesNotMatch(episodeWorkbench, /rgba\(27,\s*41,\s*64,\s*0\.08\)/)
})

test('settings page removes the legacy quick setup recommendation cards', () => {
  assert.doesNotMatch(settingsPage, /Quick Setup/)
  assert.doesNotMatch(settingsPage, /官方推荐配置/)
  assert.doesNotMatch(settingsPage, /officialPresetCards/)
  assert.doesNotMatch(settingsPage, /\.preset-card\s*\{/)
  assert.doesNotMatch(settingsPage, /background:\s*rgba\(255,255,255,0\.82\)/)
  assert.doesNotMatch(settingsPage, /background:\s*rgba\(244,248,255,0\.72\)/)
  assert.doesNotMatch(settingsPage, /background:\s*rgba\(255,255,255,0\.72\)/)
})

test('project episode dialog follows the dark orange brand system', () => {
  assert.doesNotMatch(dramaDetail, /rgba\(122,167,255/)
  assert.doesNotMatch(dramaDetail, /rgba\(76,125,255/)
  assert.doesNotMatch(dramaDetail, /rgba\(255,255,255,0\.(72|78|98)\)/)
  assert.doesNotMatch(dramaDetail, /rgba\(242,247,255,0\.92\)/)
  assert.doesNotMatch(dramaDetail, /rgba\(244,248,255,0\.96\)/)
})

test('workbench active navigation uses restrained orange accents', () => {
  const pipeActive = cssBlock(episodeWorkbench, '.pipe-item.active')
  const iconActive = cssBlock(episodeWorkbench, '.icon-active')

  assert.doesNotMatch(pipeActive, /var\(--accent-bg\)/)
  assert.doesNotMatch(iconActive, /background:\s*var\(--accent\)/)
  assert.match(pipeActive, /inset 3px 0 0 var\(--accent\)/)
  assert.match(iconActive, /background:\s*var\(--bg-2\)/)
})

test('workbench completed navigation avoids clashing green fills', () => {
  const doneItem = cssBlock(episodeWorkbench, '.pipe-item.done')
  const doneIcon = cssBlock(episodeWorkbench, '.pipe-item.done .pipe-icon')
  const iconDone = cssBlock(episodeWorkbench, '.icon-done')
  const sidebarDoneDot = cssBlock(episodeWorkbench, '.sidebar-jump-dot.done')
  const stageDoneDot = cssBlock(episodeWorkbench, '.stage-subnav-dot')

  assert.doesNotMatch(doneItem, /#9fcaa7|var\(--success\)/)
  assert.doesNotMatch(doneIcon, /background:\s*var\(--success\)/)
  assert.doesNotMatch(doneIcon, /112,183,126|#9fcaa7|var\(--success\)/)
  assert.doesNotMatch(iconDone, /112,183,126|#9fcaa7|var\(--success\)/)
  assert.doesNotMatch(sidebarDoneDot, /112,183,126|var\(--success\)/)
  assert.doesNotMatch(stageDoneDot, /45,\s*122,\s*69|var\(--success\)/)
  assert.match(doneIcon, /background:\s*rgba\(217,111,39,0\.08\)/)
  assert.match(episodeWorkbench, /\.pipe-item\.active\.done \.pipe-icon\s*\{/)
})
