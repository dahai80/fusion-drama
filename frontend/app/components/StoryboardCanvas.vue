<template>
  <div class="sb-canvas-wrap">
    <div class="sb-canvas-toolbar">
      <span class="dim">{{ t('episode.canvas.hint') }}</span>
      <div class="ml-auto flex gap-1">
        <button class="btn btn-sm" @click="tidyCanvasLayout">
          <Grid :size="11" />
          {{ t('episode.canvas.tidy') }}
        </button>
        <button class="btn btn-sm" @click="fitCanvasView">
          <Maximize2 :size="11" />
          {{ t('episode.canvas.fit') }}
        </button>
        <button class="btn btn-sm" @click="resetCanvasView">{{ t('episode.canvas.resetView') }}</button>
        <span class="tag mono sb-canvas-zoom">{{ canvasZoomLabel }}</span>
      </div>
    </div>
    <div
      ref="canvasStageEl"
      class="sb-canvas-stage"
      @pointerdown.self="startCanvasPan"
      @wheel.prevent="onCanvasWheel"
    >
      <div class="sb-canvas-world" :style="canvasWorldStyle">
        <svg class="sb-canvas-edges">
          <path v-for="edge in canvasEdges" :key="edge.key" :d="edge.d" />
        </svg>
        <div
          v-for="node in canvasNodes"
          :key="node.sb.id"
          :class="['sb-canvas-node', {
            selected: selectedId === node.sb.id,
            'is-done': helpers.videoTaskState(node.sb) === 'done',
            'is-pending': helpers.videoTaskState(node.sb) === 'pending',
            'is-failed': helpers.videoTaskState(node.sb) === 'failed',
          }]"
          :style="{ left: node.x + 'px', top: node.y + 'px', width: CANVAS_CARD_W + 'px' }"
          @pointerdown.stop="startNodeDrag(node, $event)"
          @click="selectCanvasNode(node)"
        >
          <div class="sb-canvas-node-head">
            <span class="sb-canvas-node-idx">#{{ String(node.index + 1).padStart(2, '0') }}</span>
            <span class="sb-canvas-node-title">{{ node.sb.title || t('episode.canvas.untitled', { n: node.index + 1 }) }}</span>
            <span class="sb-canvas-node-dur">{{ node.sb.duration || 5 }}s</span>
          </div>
          <div class="sb-canvas-node-media">
            <video
              v-if="helpers.hasVid(node.sb)"
              :src="'/' + helpers.getVideoUrl(node.sb)"
              :poster="helpers.posterOf('/' + helpers.getVideoUrl(node.sb)) || undefined"
              preload="none"
              muted
              playsinline
            />
            <img
              v-else-if="helpers.getSbImage(node.sb)"
              :src="helpers.thumbOf('/' + helpers.getSbImage(node.sb))"
              loading="lazy"
              @error="helpers.thumbFallback($event, '/' + helpers.getSbImage(node.sb))"
            />
            <div v-else class="sb-canvas-node-empty">
              <Clapperboard :size="18" />
            </div>
            <span :class="['sb-canvas-node-badge', 'is-' + helpers.videoTaskState(node.sb)]">{{ helpers.videoTaskStatusLabel(node.sb) }}</span>
          </div>
          <div class="sb-canvas-node-meta">
            <span class="truncate">{{ node.sb.location || node.sb.shot_type || node.sb.shotType || '—' }}</span>
          </div>
          <div class="sb-canvas-node-actions" @pointerdown.stop @click.stop>
            <button
              class="btn btn-sm"
              :disabled="helpers.isPendingSbImage(node.sb.id)"
              @click="emit('gen-image', node.sb)"
            >
              <Loader2 v-if="helpers.isPendingSbImage(node.sb.id)" :size="10" class="animate-spin" />
              {{ helpers.getSbImage(node.sb) ? t('episode.sb.regenImage') : t('episode.sb.genImage') }}
            </button>
            <button
              class="btn btn-sm"
              :disabled="helpers.isPendingVideo(node.sb.id)"
              @click="emit('gen-video', node.sb)"
            >
              <Loader2 v-if="helpers.isPendingVideo(node.sb.id)" :size="10" class="animate-spin" />
              {{ helpers.hasVid(node.sb) ? t('episode.canvas.regenVideo') : t('episode.canvas.genVideo') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Clapperboard, Grid, Loader2, Maximize2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { storyboardAPI } from '~/composables/useApi'
import { toastError } from '~/composables/useToast'

const props = defineProps({
  // 分镜列表（与父组件同一批对象引用：拖拽落点直接回写 sb.canvas_x/canvas_y）
  sbs: { type: Array, default: () => [] },
  selectedId: { type: Number, default: null },
  // 父组件持有的展示/状态判定函数（视频地址、缩略图、任务状态等，与列表视图共用）
  helpers: { type: Object, required: true },
})

const emit = defineEmits(['select', 'gen-image', 'gen-video'])
const { t } = useI18n()

const CANVAS_CARD_W = 236
const CANVAS_CARD_H = 252
const CANVAS_STEP_X = 296
const CANVAS_STEP_Y = 300
const CANVAS_COLS = 4
const CANVAS_MARGIN = 48
const CANVAS_MIN_K = 0.25
const CANVAS_MAX_K = 2
const canvasView = ref({ x: 24, y: 24, k: 1 })
const canvasStageEl = ref(null)
// 拖拽中的临时坐标（松手才写库，避免拖拽过程刷接口）
const canvasDrag = ref(null)

function canvasShotNumber(sb) {
  return Number(sb?.storyboard_number ?? sb?.storyboardNumber ?? 0) || 0
}

const canvasNodes = computed(() => {
  const ordered = [...props.sbs].sort((a, b) => canvasShotNumber(a) - canvasShotNumber(b))
  const drag = canvasDrag.value
  return ordered.map((sb, i) => {
    const autoX = CANVAS_MARGIN + (i % CANVAS_COLS) * CANVAS_STEP_X
    const autoY = CANVAS_MARGIN + Math.floor(i / CANVAS_COLS) * CANVAS_STEP_Y
    const rawX = sb.canvas_x ?? sb.canvasX
    const rawY = sb.canvas_y ?? sb.canvasY
    let x = rawX === null || rawX === undefined || rawX === '' ? autoX : Number(rawX)
    let y = rawY === null || rawY === undefined || rawY === '' ? autoY : Number(rawY)
    if (!Number.isFinite(x)) x = autoX
    if (!Number.isFinite(y)) y = autoY
    if (drag && drag.id === sb.id) { x = drag.x; y = drag.y }
    return { sb, index: i, x, y }
  })
})

const canvasEdges = computed(() => {
  const nodes = canvasNodes.value
  const paths = []
  for (let i = 0; i < nodes.length - 1; i += 1) {
    const a = nodes[i]
    const b = nodes[i + 1]
    const x1 = a.x + CANVAS_CARD_W
    const y1 = a.y + 96
    const x2 = b.x
    const y2 = b.y + 96
    const dx = Math.max(40, Math.abs(x2 - x1) * 0.45)
    paths.push({ key: `${a.sb.id}-${b.sb.id}`, d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}` })
  }
  return paths
})

const canvasWorldStyle = computed(() => ({
  transform: `translate(${canvasView.value.x}px, ${canvasView.value.y}px) scale(${canvasView.value.k})`,
  transformOrigin: '0 0',
}))

const canvasZoomLabel = computed(() => `${Math.round(canvasView.value.k * 100)}%`)

function selectCanvasNode(node) {
  emit('select', node.sb)
}

function onCanvasWheel(e) {
  const rect = canvasStageEl.value?.getBoundingClientRect()
  if (!rect) return
  const mx = e.clientX - rect.left
  const my = e.clientY - rect.top
  const k0 = canvasView.value.k
  const k = Math.min(CANVAS_MAX_K, Math.max(CANVAS_MIN_K, k0 * Math.exp(-e.deltaY * 0.0015)))
  if (k === k0) return
  canvasView.value = {
    x: mx - (mx - canvasView.value.x) * (k / k0),
    y: my - (my - canvasView.value.y) * (k / k0),
    k,
  }
}

function startCanvasPan(e) {
  if (e.button !== 0) return
  const startX = e.clientX
  const startY = e.clientY
  const origin = { x: canvasView.value.x, y: canvasView.value.y }
  const onMove = (ev) => {
    canvasView.value = { ...canvasView.value, x: origin.x + (ev.clientX - startX), y: origin.y + (ev.clientY - startY) }
  }
  const onUp = () => {
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
    document.body.classList.remove('is-canvas-panning')
  }
  document.body.classList.add('is-canvas-panning')
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)
}

function startNodeDrag(node, e) {
  if (e.button !== 0) return
  e.preventDefault()
  selectCanvasNode(node)
  const startX = e.clientX
  const startY = e.clientY
  const origin = { x: node.x, y: node.y }
  let moved = false
  const onMove = (ev) => {
    const k = canvasView.value.k || 1
    const dx = (ev.clientX - startX) / k
    const dy = (ev.clientY - startY) / k
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true
    canvasDrag.value = { id: node.sb.id, x: Math.round(origin.x + dx), y: Math.round(origin.y + dy) }
  }
  const onUp = async () => {
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
    document.body.classList.remove('is-canvas-dragging')
    const drag = canvasDrag.value
    canvasDrag.value = null
    if (!moved || !drag) return
    const sb = props.sbs.find(s => s.id === drag.id)
    if (!sb) return
    sb.canvas_x = drag.x
    sb.canvas_y = drag.y
    sb.canvasX = drag.x
    sb.canvasY = drag.y
    try {
      await storyboardAPI.layout([{ id: drag.id, canvas_x: drag.x, canvas_y: drag.y }])
    } catch (err) {
      console.error('[canvas] persist layout failed:', err?.message)
      toastError(err)
    }
  }
  document.body.classList.add('is-canvas-dragging')
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)
}

async function tidyCanvasLayout() {
  const items = canvasNodes.value.map((node, i) => ({
    id: node.sb.id,
    canvas_x: CANVAS_MARGIN + (i % CANVAS_COLS) * CANVAS_STEP_X,
    canvas_y: CANVAS_MARGIN + Math.floor(i / CANVAS_COLS) * CANVAS_STEP_Y,
  }))
  if (!items.length) return
  try {
    await storyboardAPI.layout(items)
    const byId = new Map(items.map(item => [item.id, item]))
    for (const sb of props.sbs) {
      const item = byId.get(sb.id)
      if (!item) continue
      sb.canvas_x = item.canvas_x
      sb.canvas_y = item.canvas_y
      sb.canvasX = item.canvas_x
      sb.canvasY = item.canvas_y
    }
    toast.success(t('episode.canvas.tidyDone'))
    nextTick(() => fitCanvasView())
  } catch (err) {
    console.error('[canvas] tidy failed:', err?.message)
    toastError(err)
  }
}

function fitCanvasView() {
  const nodes = canvasNodes.value
  const el = canvasStageEl.value
  if (!nodes.length || !el) return
  const w = el.clientWidth || 800
  const h = el.clientHeight || 600
  const minX = Math.min(...nodes.map(n => n.x))
  const minY = Math.min(...nodes.map(n => n.y))
  const maxX = Math.max(...nodes.map(n => n.x + CANVAS_CARD_W))
  const maxY = Math.max(...nodes.map(n => n.y + CANVAS_CARD_H))
  const pad = 32
  const k = Math.min(1, Math.min((w - pad * 2) / Math.max(1, maxX - minX), (h - pad * 2) / Math.max(1, maxY - minY)))
  canvasView.value = {
    x: (w - (maxX - minX) * k) / 2 - minX * k,
    y: (h - (maxY - minY) * k) / 2 - minY * k,
    k,
  }
}

function resetCanvasView() {
  canvasView.value = { x: 24, y: 24, k: 1 }
}

// 进入画布视图（组件挂载）时自动铺满可视区；父级 v-else-if 每次切入重建组件
onMounted(async () => {
  await nextTick()
  fitCanvasView()
})
</script>

<style scoped>
.sb-canvas-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  overflow: hidden;
}
.sb-canvas-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
}
.sb-canvas-zoom { min-width: 48px; text-align: center; }
.sb-canvas-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  background-color: var(--surface-muted);
  background-image: radial-gradient(var(--border) 1px, transparent 1px);
  background-size: 24px 24px;
}
:global(body.is-canvas-panning),
:global(body.is-canvas-dragging) { cursor: grabbing; user-select: none; }
.sb-canvas-world { position: absolute; top: 0; left: 0; }
.sb-canvas-edges {
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  overflow: visible;
  pointer-events: none;
}
.sb-canvas-edges path {
  fill: none;
  stroke: var(--accent);
  stroke-opacity: 0.45;
  stroke-width: 2;
  stroke-dasharray: 6 5;
}
.sb-canvas-node {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow-card);
  cursor: grab;
  user-select: none;
}
.sb-canvas-node.selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-glow);
}
.sb-canvas-node.is-pending { border-style: dashed; }
.sb-canvas-node.is-failed { border-color: var(--error); }
.sb-canvas-node-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.sb-canvas-node-idx { font-family: var(--font-mono); color: var(--accent); }
.sb-canvas-node-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.sb-canvas-node-dur { color: var(--text-3); font-size: 11px; }
.sb-canvas-node-media {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg-3);
  display: flex;
  align-items: center;
  justify-content: center;
}
.sb-canvas-node-media img,
.sb-canvas-node-media video { width: 100%; height: 100%; object-fit: cover; }
.sb-canvas-node-empty { color: var(--text-3); }
.sb-canvas-node-badge {
  position: absolute;
  left: 6px;
  bottom: 6px;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: var(--scrim);
  color: var(--on-media);
}
.sb-canvas-node-badge.is-failed { color: var(--error); }
.sb-canvas-node-meta { font-size: 11px; color: var(--text-3); }
.sb-canvas-node-actions { display: flex; gap: 4px; }
.sb-canvas-node-actions .btn {
  flex: 1;
  justify-content: center;
  font-size: 11px;
  padding: 3px 4px;
}
</style>
