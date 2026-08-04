<template>
  <div class="page">
    <!-- Header -->
    <div class="page-head card">
      <button class="back-btn" title="返回项目" @click="navigateTo(`/drama/${dramaId}`)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <div class="head-info">
        <div class="head-title-row">
          <h1 class="page-title">素材库</h1>
          <span v-if="drama?.style" class="tag tag-accent">{{ drama.style }}</span>
        </div>
        <div class="page-meta">
          <span class="meta-item">{{ drama?.title || '' }}</span>
          <span class="meta-item">{{ characterAssets.length }} 角色图 · {{ sceneAssets.length }} 场景图</span>
        </div>
      </div>
      <div class="seg asset-filter">
        <button
          v-for="t in tabs"
          :key="t.value"
          type="button"
          class="seg-item"
          :class="{ on: tab === t.value }"
          @click="tab = t.value"
        >{{ t.label }}</button>
      </div>
    </div>

    <!-- Asset Grid -->
    <div v-if="loading" class="asset-grid">
      <div v-for="i in 8" :key="i" class="card asset-card skeleton-card">
        <div class="skeleton-cover"></div>
        <div class="skeleton-body"><div class="skeleton-line w-60"></div></div>
      </div>
    </div>

    <div v-else-if="visibleAssets.length" class="asset-grid">
      <button
        v-for="asset in visibleAssets"
        :key="asset.id"
        type="button"
        class="card asset-card"
        @click="openViewer(asset)"
      >
        <div class="asset-thumb">
          <img :src="asset.src" :alt="asset.name" loading="lazy" />
          <span class="asset-type-tag" :class="asset.kind === '角色' ? 'is-character' : 'is-scene'">{{ asset.kind }}</span>
        </div>
        <div class="asset-body">
          <span class="asset-name truncate">{{ asset.name }}</span>
          <span class="asset-date">{{ fmtDate(asset.createdAt) }}</span>
        </div>
      </button>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
        </svg>
      </div>
      <p class="empty-title">暂无{{ tab === 'character' ? '角色' : tab === 'scene' ? '场景' : '' }}素材</p>
      <p class="empty-desc">在工作台生成角色形象图或场景图后，会自动收录到这里。</p>
      <button class="btn btn-primary" @click="navigateTo(`/drama/${dramaId}`)">返回项目</button>
    </div>

    <!-- Image Viewer -->
    <div v-if="viewer.open" class="overlay viewer-overlay" @click.self="closeViewer">
      <div class="dialog viewer-dialog">
        <div class="viewer-head">
          <span class="viewer-title">{{ viewer.title }}</span>
          <button class="btn btn-icon btn-sm btn-ghost" @click="closeViewer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <img :src="viewer.src" :alt="viewer.title" class="viewer-img" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { dramaAPI, taskAPI } from '~/composables/useApi'

const route = useRoute()
const dramaId = Number(route.params.id)

const drama = ref(null)
const generations = ref([])
const loading = ref(false)
const tab = ref('all')
const viewer = ref({ open: false, src: '', title: '' })

const tabs = [
  { label: '全部', value: 'all' },
  { label: '角色', value: 'character' },
  { label: '场景', value: 'scene' },
]

function resolveName(id, list, fallback) {
  const item = list.find(x => x.id === id)
  return item?.name || item?.location || fallback
}

function toAsset(row) {
  const raw = row.localPath || row.imageUrl || ''
  if (!raw) return null
  const isChar = !!row.characterId
  return {
    id: row.id,
    kind: isChar ? '角色' : '场景',
    kindKey: isChar ? 'character' : 'scene',
    name: isChar
      ? resolveName(row.characterId, drama.value?.characters || [], '角色形象')
      : resolveName(row.sceneId, drama.value?.scenes || [], '场景图'),
    src: /^https?:\/\//i.test(raw) || raw.startsWith('/') ? raw : `/${raw}`,
    createdAt: row.createdAt,
  }
}

const assets = computed(() =>
  generations.value
    .filter(r => r.status === 'completed' && (r.characterId || r.sceneId))
    .map(toAsset)
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
)
const characterAssets = computed(() => assets.value.filter(a => a.kindKey === 'character'))
const sceneAssets = computed(() => assets.value.filter(a => a.kindKey === 'scene'))
const visibleAssets = computed(() =>
  tab.value === 'all' ? assets.value : assets.value.filter(a => a.kindKey === tab.value),
)

async function load() {
  loading.value = true
  try {
    const [d, gens] = await Promise.all([
      dramaAPI.get(dramaId),
      taskAPI.list({ type: 'image', drama_id: dramaId }),
    ])
    drama.value = d
    generations.value = gens || []
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

function openViewer(asset) {
  viewer.value = { open: true, src: asset.src, title: `${asset.kind} · ${asset.name}` }
}

function closeViewer() {
  viewer.value = { open: false, src: '', title: '' }
}

function fmtDate(s) {
  if (!s) return ''
  const d = new Date(s)
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

onMounted(load)
</script>

<style scoped>
.page {
  padding: 28px 48px 40px;
  overflow-y: auto;
  height: 100%;
  animation: fadeUp 0.35s var(--ease-out) both;
}

.page-head {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-radius: var(--radius-xl);
  margin-bottom: 24px;
}
.head-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.head-title-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.asset-filter { flex-shrink: 0; }

.back-btn {
  width: 36px; height: 36px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%;
  background: rgba(0,0,0,0.05); color: var(--text-1);
  cursor: pointer;
  transition: background 0.16s var(--ease-out), color 0.16s var(--ease-out), box-shadow 0.16s var(--ease-out);
}
.back-btn:hover { background: rgba(0,0,0,0.09); color: var(--text-0); }
.back-btn:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }

.page-title { font-size: 22px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.2; }
.page-meta { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.meta-item { display: flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--text-2); }

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--sp-5);
}
.asset-card {
  overflow: hidden;
  cursor: zoom-in;
  padding: 0;
  border: 1px solid var(--border);
  text-align: left;
  animation: fadeUp 0.32s var(--ease-out) both;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out);
}
.asset-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-lift); }
.asset-thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  background: var(--bg-2);
  overflow: hidden;
}
.asset-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.asset-type-tag {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  font-size: 10px;
  font-weight: 600;
  background: rgba(255,255,255,0.88);
  backdrop-filter: blur(8px);
  color: var(--text-1);
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
}
.asset-type-tag.is-character { color: var(--accent); }
.asset-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
}
.asset-name { font-size: 12.5px; font-weight: 600; color: var(--text-0); }
.asset-date { font-size: 11px; color: var(--text-3); font-family: var(--font-mono); flex-shrink: 0; }

.skeleton-card { cursor: default; }
.skeleton-cover { aspect-ratio: 16 / 9; background: var(--bg-2); animation: skeleton-pulse 1.4s ease-in-out infinite alternate; }
.skeleton-body { padding: 10px 12px; }
.skeleton-line { height: 12px; border-radius: 99px; background: var(--bg-2); animation: skeleton-pulse 1.4s ease-in-out infinite alternate; }
.skeleton-line.w-60 { width: 60%; }
@keyframes skeleton-pulse { to { opacity: 0.55; } }

.empty-state {
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  text-align: center;
}
.empty-icon {
  width: 56px; height: 56px; border-radius: var(--radius-lg);
  background: var(--bg-2); color: var(--text-3);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 4px;
}
.empty-title { font-size: 14px; font-weight: 700; color: var(--text-1); }
.empty-desc { font-size: 12px; color: var(--text-3); max-width: 260px; line-height: 1.6; }

.viewer-overlay { align-items: center; }
.viewer-dialog { width: min(960px, calc(100vw - 48px)); padding: 14px; }
.viewer-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
.viewer-title { font-size: 13px; font-weight: 600; color: var(--text-1); }
.viewer-img { width: 100%; max-height: 76vh; object-fit: contain; border-radius: var(--radius); background: var(--bg-2); display: block; }

@media (max-width: 760px) {
  .page { padding: 20px 16px 32px; }
  .page-head { flex-wrap: wrap; }
  .asset-filter { width: 100%; }
}
</style>
