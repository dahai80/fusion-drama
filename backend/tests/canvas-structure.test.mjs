import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = new URL('..', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')

test('storyboard canvas columns ship in migration v8 and drizzle schema', () => {
    const migrations = read('src/db/migrations.ts')
    assert.match(migrations, /version: 8, name: 'storyboard-canvas'/)
    assert.match(migrations, /ALTER TABLE storyboards ADD COLUMN canvas_x REAL/)
    assert.match(migrations, /ALTER TABLE storyboards ADD COLUMN canvas_y REAL/)

    const schema = read('src/db/schema.ts')
    assert.match(schema, /canvasX: real\('canvas_x'\)/)
    assert.match(schema, /canvasY: real\('canvas_y'\)/)
})

test('storyboards route accepts per-node canvas coords and a bulk layout endpoint', () => {
    const route = read('src/routes/storyboards.ts')
    assert.match(route, /canvas_x: 'canvasX', canvas_y: 'canvasY'/)
    // 批量保存必须注册在 /:id 之前，否则 'layout' 会被当成 id
    const layoutIdx = route.indexOf("app.put('/layout'")
    const idIdx = route.indexOf("app.put('/:id'")
    assert.ok(layoutIdx > -1, 'layout route missing')
    assert.ok(idIdx > layoutIdx, 'layout route must be registered before /:id')
    assert.match(route, /set\(\{ canvasX: x, canvasY: y, updatedAt: ts \}\)/)
})

test('frontend canvas drag persists positions via layout API', () => {
    const api = read('../frontend/app/composables/useApi.ts')
    assert.match(api, /layout: \(items: Array<\{ id: number; canvas_x: number; canvas_y: number \}>\) => api\.put\('\/storyboards\/layout'/)

    // 画布逻辑已抽到 StoryboardCanvas 组件（episode.vue 只保留视图切换状态 + helpers 注入）
    const canvas = read('../frontend/app/components/StoryboardCanvas.vue')
    // 坐标持久化：拖拽松手写库，整理布局批量写库
    assert.match(canvas, /storyboardAPI\.layout\(\[\{ id: drag\.id, canvas_x: drag\.x, canvas_y: drag\.y \}\]\)/)
    assert.match(canvas, /async function tidyCanvasLayout/)
    // 缺失坐标时分镜序号自动布局
    assert.match(canvas, /const CANVAS_COLS = 4/)
    assert.match(canvas, /sb\.canvas_x \?\? sb\.canvasX/)
    // 平移 + 缩放 + 连线
    assert.match(canvas, /function startCanvasPan/)
    assert.match(canvas, /function onCanvasWheel/)
    assert.match(canvas, /const canvasEdges = computed/)

    const page = read('../frontend/app/views/drama/episode.vue')
    // 视图持久化 + 列表/画布切换 + 组件接线
    assert.match(page, /VIDEO_VIEW_STORE_KEY/)
    assert.match(page, /v-else-if="videoViewMode === 'canvas'"/)
    assert.match(page, /<StoryboardCanvas/)
    assert.match(page, /:helpers="canvasHelpers"/)
})

test('canvas i18n keys exist in all four locales', () => {
    for (const lang of ['zh', 'en', 'ja', 'ko']) {
        const locale = JSON.parse(read(`../frontend/app/locales/${lang}.json`))
        const canvas = locale.episode?.canvas
        assert.ok(canvas, `${lang}: episode.canvas missing`)
        for (const key of ['canvasView', 'listView', 'hint', 'tidy', 'fit', 'resetView', 'genVideo', 'regenVideo', 'tidyDone']) {
            assert.ok(canvas[key], `${lang}: episode.canvas.${key} missing`)
        }
    }
})
