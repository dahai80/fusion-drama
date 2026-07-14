<template>
  <div class="page">
    <div class="page-head">
      <div class="head-left">
        <h1 class="page-title">短剧项目</h1>
        <p class="page-desc">项目启动台 · 点击项目直接进入工作台</p>
      </div>
      <button class="btn btn-primary" @click="showCreate = true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        新建项目
      </button>
    </div>

    <div class="toolbar">
      <label class="search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input v-model.trim="searchKeyword" class="input" placeholder="搜索项目" />
      </label>
      <div class="filters">
        <button
          v-for="f in filters"
          :key="f.value"
          type="button"
          class="filter-chip"
          :class="{ active: statusFilter === f.value }"
          @click="statusFilter = f.value"
        >
          {{ f.label }}
        </button>
      </div>
      <select v-model="sortMode" class="input sort-select" aria-label="项目排序">
        <option value="updated">最近更新</option>
        <option value="title">项目名称</option>
      </select>
    </div>

    <div v-if="loading" class="launcher">
      <div v-for="i in 3" :key="i" class="launcher-skeleton"></div>
    </div>

    <div v-else-if="filteredDramas.length" class="launcher launcher-board">
      <div class="launcher-head" aria-hidden="true">
        <span>项目</span>
        <span>状态</span>
        <span>当前工作台</span>
        <span>更新</span>
        <span></span>
        <span></span>
      </div>

      <article
        v-for="(d, i) in filteredDramas"
        :key="d.id"
        class="project-row"
        :style="{ animationDelay: `${i * 0.04}s` }"
        tabindex="0"
        role="button"
        :aria-label="`进入 ${d.title} 工作台`"
        @click="openWorkbench(d)"
        @keydown.enter.prevent="openWorkbench(d)"
        @keydown.space.prevent="openWorkbench(d)"
      >
        <div class="project-main">
          <div class="film-thumb project-slate" aria-hidden="true"></div>
          <div class="project-copy">
            <h2 class="project-title">{{ d.title }}</h2>
            <p class="project-meta">
              <span v-if="d.style">{{ d.style }}</span>
              <span>{{ d.characters?.length || 0 }} 角色</span>
              <span>{{ d.scenes?.length || 0 }} 场景</span>
            </p>
          </div>
        </div>

        <div class="status-cell">
          <span class="status-dot"></span>
          <span>{{ projectStatus(d) }}</span>
        </div>

        <div class="progress-cell">
          <div class="progress-label">{{ currentWorkbenchLabel(d) }}</div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: getProgress(d) + '%' }"></div>
          </div>
        </div>

        <div class="date-cell">{{ fmtDate(d.updated_at || d.updatedAt) }}</div>

        <button class="btn btn-primary btn-sm row-action" type="button" @click.stop="openWorkbench(d)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M5 12h14"/><path d="m13 5 7 7-7 7"/>
          </svg>
          进入工作台
        </button>

        <div class="more-wrap">
          <button class="btn btn-ghost btn-icon" type="button" title="更多" @click.stop="toggleMenu(d.id)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>
            </svg>
          </button>
          <div v-if="activeMenuId === d.id" class="more-menu" @click.stop>
            <button type="button" class="menu-item" @click="openWorkbench(d)">打开工作台</button>
            <button type="button" class="menu-item is-danger" @click="delDrama(d)">删除项目</button>
          </div>
        </div>
      </article>
    </div>

    <div v-else class="empty-state">
      <div class="empty-icon">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </div>
      <p class="empty-title">{{ dramas.length ? '没有匹配的项目' : '新建第一个短剧项目' }}</p>
      <p class="empty-desc">{{ dramas.length ? '调整搜索词或筛选条件。' : '创建后直接进入工作台开始制作。' }}</p>
      <button v-if="!dramas.length" class="btn btn-primary" @click="showCreate = true">新建项目</button>
    </div>

    <div v-if="showCreate" class="overlay" @click.self="showCreate = false">
      <div class="modal card">
        <div class="modal-header">
          <div class="modal-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
          </div>
          <h2 class="modal-title">新建短剧项目</h2>
          <p class="modal-desc">创建后直接进入第 1 集工作台</p>
        </div>
        <form @submit.prevent="create" class="modal-form">
          <label class="field">
            <span class="field-label">项目名称 <span class="required">*</span></span>
            <input v-model="form.title" class="input" placeholder="例如：都市情感短剧《时光邮局》" required autofocus />
          </label>
          <div class="field-row">
            <label class="field">
              <span class="field-label">计划集数</span>
              <input v-model.number="form.total_episodes" class="input" type="number" min="1" max="100" />
            </label>
            <label class="field">
              <span class="field-label">视觉风格</span>
              <BaseSelect v-model="form.style" :options="styleSelectOptions" placeholder="选择风格" searchable />
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" @click="showCreate = false">取消</button>
            <button type="submit" class="btn btn-primary">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              创建并进入工作台
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { dramaAPI } from '~/composables/useApi'
import BaseSelect from '~/components/BaseSelect.vue'

const dramas = ref([])
const loading = ref(false)
const showCreate = ref(false)
const searchKeyword = ref('')
const statusFilter = ref('all')
const sortMode = ref('updated')
const activeMenuId = ref(null)
const form = ref({ title: '', total_episodes: 1, style: '' })
const styles = ['realistic', 'anime', 'ghibli', 'cinematic', 'comic', 'watercolor']
const styleSelectOptions = computed(() => styles.map(s => ({ label: s, value: s })))
const filters = [
  { label: '全部', value: 'all' },
  { label: '进行中', value: 'active' },
]

const filteredDramas = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  const items = dramas.value.filter((d) => {
    const text = [d.title, d.style, projectStatus(d)].filter(Boolean).join(' ').toLowerCase()
    const matchesSearch = !keyword || text.includes(keyword)
    const matchesStatus = statusFilter.value === 'all' || statusFilter.value === 'active'
    return matchesSearch && matchesStatus
  })

  return [...items].sort((a, b) => {
    if (sortMode.value === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN')
    return new Date(b.updated_at || b.updatedAt || 0).getTime() - new Date(a.updated_at || a.updatedAt || 0).getTime()
  })
})

async function load() {
  loading.value = true
  try {
    const res = await dramaAPI.list()
    dramas.value = res.items || []
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

async function create() {
  if (!form.value.title?.trim()) return
  try {
    const d = await dramaAPI.create(form.value)
    showCreate.value = false
    navigateTo(`/drama/${d.id}/episode/1`)
  } catch (e) {
    toast.error(e.message)
  }
}

async function delDrama(d) {
  activeMenuId.value = null
  if (!confirm(`确定删除「${d.title}」？此操作不可恢复。`)) return
  try {
    await dramaAPI.del(d.id)
    toast.success('已删除')
    load()
  } catch (e) {
    toast.error(e.message)
  }
}

function toggleMenu(id) {
  activeMenuId.value = activeMenuId.value === id ? null : id
}

function projectStatus(d) {
  return d.episodes?.length ? '进行中' : '待开始'
}

function getEpisodeNumber(d) {
  const episodes = [...(d.episodes || [])]
  if (!episodes.length) return 1
  episodes.sort((a, b) => Number(a.episode_number || a.episodeNumber || 1) - Number(b.episode_number || b.episodeNumber || 1))
  return Number(episodes[0].episode_number || episodes[0].episodeNumber || 1)
}

function getWorkbenchPath(d) {
  return `/drama/${d.id}/episode/${getEpisodeNumber(d)}`
}

function openWorkbench(d) {
  activeMenuId.value = null
  navigateTo(getWorkbenchPath(d))
}

function currentWorkbenchLabel(d) {
  if (!d.episodes?.length) return '第 1 集工作台'
  return `第 ${getEpisodeNumber(d)} 集工作台`
}

function fmtDate(s) {
  if (!s) return ''
  const d = new Date(s)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function getProgress(d) {
  if (!d.episodes?.length) return 0
  const scripted = d.episodes.filter(e => e.script_content || e.scriptContent).length
  return Math.max(12, Math.round((scripted / d.episodes.length) * 100))
}

onMounted(load)
</script>

<style scoped>
.page {
  padding: 34px 48px 48px;
  overflow-y: auto;
  height: 100%;
  animation: fadeUp 0.35s var(--ease-out) both;
  background:
    linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px),
    linear-gradient(180deg, rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size: 48px 48px;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
  gap: 24px;
}
.head-left { display: flex; flex-direction: column; gap: 6px; }
.page-title {
  font-family: var(--font-display);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0;
  color: var(--text-0);
}
.page-desc { font-size: 13px; color: var(--text-2); font-weight: 400; }

.toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 390px) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  margin-bottom: 22px;
}
.search { position: relative; }
.search svg {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-3);
  pointer-events: none;
}
.search .input { padding-left: 38px; }
.filters { display: flex; align-items: center; gap: 8px; overflow-x: auto; padding-bottom: 1px; }
.filter-chip {
  min-height: var(--button-height-sm);
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--button-border);
  border-radius: var(--button-radius);
  background: var(--button-bg);
  color: var(--button-text);
  padding: 0 11px;
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  white-space: nowrap;
  transition: all 0.18s var(--ease-out);
  box-shadow: var(--button-shadow);
}
.filter-chip:hover {
  color: var(--button-text-hover);
  background: var(--button-bg-hover);
  border-color: var(--button-border-hover);
  box-shadow: var(--button-shadow-hover);
}
.filter-chip:focus-visible {
  outline: none;
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px var(--button-focus), var(--button-shadow-hover);
}
.filter-chip.active {
  color: var(--accent-text);
  border-color: var(--accent-glow);
  background: linear-gradient(180deg, var(--accent-bg), rgba(217,111,39,0.08));
}
.sort-select { min-height: 36px; min-width: 132px; color: var(--text-1); }

.launcher {
  display: grid;
  gap: 10px;
}
.launcher-board {
  padding: 12px;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius-xl);
  background: var(--surface-raised);
  box-shadow: var(--shadow-panel);
}
.launcher-head {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 116px 170px 106px 146px 42px;
  align-items: center;
  padding: 0 14px;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.project-row {
  position: relative;
  width: 100%;
  min-height: 104px;
  display: grid;
  grid-template-columns: minmax(240px, 1fr) 116px 170px 106px 146px 42px;
  align-items: center;
  gap: 14px;
  border: 1px solid rgba(242,238,230,0.08);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  color: inherit;
  padding: 14px;
  text-align: left;
  box-shadow: var(--button-shadow);
  cursor: pointer;
  transition: border-color 0.18s var(--ease-out), transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), background 0.18s var(--ease-out);
  animation: fadeUp 0.32s var(--ease-out) both;
}
.project-row::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  border-radius: var(--radius-lg) 0 0 var(--radius-lg);
  background: linear-gradient(180deg, var(--action-primary), var(--accent-dark));
}
.project-row:hover,
.project-row:focus-visible {
  outline: none;
  border-color: var(--surface-outline-strong);
  background: linear-gradient(180deg, rgba(31,36,42,0.96), rgba(21,25,30,0.98));
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}

.project-main { display: flex; align-items: center; gap: 14px; min-width: 0; }
.film-thumb {
  width: 78px;
  height: 56px;
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background:
    linear-gradient(90deg, transparent 0 10px, rgba(255,255,255,0.05) 10px 18px, transparent 18px 100%),
    linear-gradient(135deg, rgba(217,111,39,0.16), #17191c 58%, #101214);
  position: relative;
  overflow: hidden;
}
.project-slate {
  box-shadow: inset 0 0 0 1px rgba(217,111,39,0.08), 0 10px 18px rgba(0,0,0,0.16);
}
.film-thumb::before,
.film-thumb::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 7px;
  background: repeating-linear-gradient(90deg, #3a4048 0 10px, transparent 10px 28px);
}
.film-thumb::before { top: 0; }
.film-thumb::after { bottom: 0; }
.project-copy { min-width: 0; display: grid; gap: 6px; }
.project-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: 0;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.project-meta {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
  color: var(--text-2);
  font-size: 13px;
}
.project-meta span + span::before {
  content: "";
  display: inline-block;
  width: 3px;
  height: 3px;
  margin-right: 7px;
  border-radius: 50%;
  background: var(--text-3);
  vertical-align: middle;
}
.status-cell {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--success);
  font-size: 12px;
  font-weight: 700;
}
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.progress-cell { display: grid; gap: 7px; min-width: 0; }
.progress-label { color: var(--text-2); font-size: 12px; }
.progress-track { height: 4px; border-radius: 99px; background: var(--bg-3); overflow: hidden; }
.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--action-primary), var(--accent));
  transition: width 0.6s var(--ease-out);
}
.date-cell { color: var(--text-2); font-size: 13px; white-space: nowrap; }
.row-action { justify-self: end; }
.more-wrap { position: relative; justify-self: end; }
.more-menu {
  position: absolute;
  top: 38px;
  right: 0;
  width: 138px;
  display: grid;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow-lg);
  z-index: 5;
}
.menu-item {
  min-height: var(--button-height-sm);
  display: flex;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--text-1);
  padding: 0 9px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.14s var(--ease-out);
}
.menu-item:hover { background: var(--bg-hover); border-color: var(--button-border); color: var(--text-0); }
.menu-item:focus-visible {
  outline: none;
  background: var(--bg-hover);
  border-color: var(--action-primary);
  box-shadow: 0 0 0 2px var(--button-focus);
}
.menu-item.is-danger { color: var(--action-danger); }
.menu-item.is-danger:hover {
  background: var(--action-danger-bg);
  border-color: rgba(213,111,111,0.28);
  color: #ffd0d0;
}

.launcher-skeleton {
  height: 104px;
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, var(--bg-2) 25%, var(--bg-hover) 50%, var(--bg-2) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.empty-state {
  min-height: 280px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  text-align: center;
}
.empty-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  background: var(--bg-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  margin-bottom: 4px;
}
.empty-title { font-size: 14px; font-weight: 700; color: var(--text-1); }
.empty-desc { font-size: 12px; color: var(--text-3); max-width: 240px; line-height: 1.6; }

.modal { padding: 32px; width: 460px; box-shadow: var(--shadow-elevated); animation: scaleIn 0.2s var(--ease-out); }
.modal-header { margin-bottom: 24px; display: flex; flex-direction: column; gap: 6px; }
.modal-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius);
  background: var(--accent-bg);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}
.modal-title { font-family: var(--font-display); font-size: 19px; font-weight: 700; }
.modal-desc { font-size: 13px; color: var(--text-3); }
.modal-form { display: flex; flex-direction: column; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12px; font-weight: 600; color: var(--text-1); }
.required { color: var(--error); }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 6px; }

@media (max-width: 980px) {
  .launcher-head { display: none; }
  .project-row {
    grid-template-columns: minmax(0, 1fr) 42px;
    align-items: start;
  }
  .project-main,
  .status-cell,
  .progress-cell,
  .date-cell,
  .row-action { grid-column: 1 / 2; }
  .more-wrap { grid-column: 2 / 3; grid-row: 1; }
  .row-action { justify-self: stretch; }
  .row-action.btn { width: 100%; }
}

@media (max-width: 760px) {
  .page {
    padding: 24px 16px 32px;
  }
  .page-head {
    display: grid;
    grid-template-columns: 1fr;
    align-items: start;
  }
  .page-head .btn { width: 100%; }
  .toolbar { grid-template-columns: 1fr; }
  .project-row {
    grid-template-columns: 1fr;
    overflow: hidden;
    padding: 14px 14px 16px;
    gap: 12px;
  }
  .project-main,
  .status-cell,
  .progress-cell,
  .date-cell,
  .row-action { grid-column: 1; }
  .project-main { align-items: flex-start; padding-right: 42px; }
  .more-wrap {
    position: absolute;
    top: 12px;
    right: 12px;
    grid-column: auto;
    grid-row: auto;
  }
  .film-thumb { width: 62px; height: 48px; }
  .project-title { font-size: 20px; }
  .row-action.btn { width: 100%; }
  .modal {
    width: calc(100vw - 32px);
    padding: 24px;
  }
  .field-row { grid-template-columns: 1fr; }
  .modal-actions { display: grid; grid-template-columns: 1fr; }
}
</style>
