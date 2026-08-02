<template>
  <div class="page" v-if="drama">
    <!-- Header -->
    <div class="page-head card">
      <button class="back-btn" title="返回" @click="navigateTo('/')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <div class="head-info">
        <div class="head-title-row">
          <h1 class="page-title">{{ drama.title }}</h1>
          <span v-if="drama.style" class="tag tag-accent">{{ drama.style }}</span>
        </div>
        <div class="page-meta">
          <span class="meta-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            {{ drama.characters?.length || 0 }} 角色
          </span>
          <span class="meta-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/></svg>
            {{ drama.scenes?.length || 0 }} 场景
          </span>
          <span class="meta-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.5"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/><line x1="13" y1="8" x2="13" y2="16"/><line x1="16" y1="8" x2="16" y2="16"/></svg>
            {{ drama.episodes?.length || 0 }} 集
          </span>
        </div>
      </div>
      <button class="btn head-assets" @click="navigateTo(`/drama/${drama.id}/assets`)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
        </svg>
        素材库
      </button>
      <button class="btn btn-primary head-action" @click="openAddEpisode">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        添加集
      </button>
    </div>

    <!-- Episode List -->
    <div class="section-label">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <rect x="2" y="2" width="20" height="20" rx="2.5"/>
        <line x1="7" y1="8" x2="7" y2="16"/>
        <line x1="10" y1="8" x2="10" y2="16"/>
        <line x1="13" y1="8" x2="13" y2="16"/>
        <line x1="16" y1="8" x2="16" y2="16"/>
      </svg>
      剧集列表
    </div>

    <div class="ep-grid">
      <div
        v-for="(ep, i) in drama.episodes"
        :key="ep.id"
        class="card ep-card"
        :style="{ animationDelay: `${i * 0.05}s` }"
        @click="navigateTo(`/drama/${drama.id}/episode/${ep.episode_number || ep.episodeNumber}`)"
      >
        <div class="ep-number">
          <span>EP</span>
          <b>{{ String(ep.episode_number || ep.episodeNumber).padStart(2, '0') }}</b>
        </div>
        <div class="ep-body">
          <span class="ep-title">{{ ep.title }}</span>
          <div class="ep-status-wrap" @click.stop>
            <button type="button" :class="['tag', 'ep-status-btn']" title="点击标记本集状态" @click="epStatusMenuId = epStatusMenuId === ep.id ? null : ep.id">
              <span :class="['status-dot', epStatusDotClass(ep)]"></span>
              {{ epStatusLabel(ep) }}
            </button>
            <div v-if="epStatusMenuId === ep.id" class="status-menu">
              <button
                v-for="s in epStatusOptions"
                :key="s.value"
                type="button"
                class="status-menu-item"
                :class="{ on: epStatus(ep) === s.value }"
                @click="setEpisodeStatus(ep, s.value)"
              >{{ s.label }}</button>
            </div>
          </div>
          <span v-if="ep.duration" class="ep-duration">{{ ep.duration }}s</span>
        </div>
        <div class="ep-arrow">
          <button
            class="btn btn-icon btn-sm ep-delete"
            type="button"
            title="删除本集"
            @click.stop="episodeToDelete = ep"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </div>
      </div>

      <!-- Empty episode state -->
      <div v-if="!drama.episodes?.length" class="card ep-empty">
        <div class="ep-empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="16"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </div>
        <p>点击上方「添加集」创建第一集</p>
      </div>
    </div>

    <div v-if="addDialog" class="overlay" @click.self="addDialog = false">
      <div class="dialog ep-dialog">
        <div class="dialog-head">
          <div class="dialog-title">创建新集</div>
          <button class="btn btn-icon btn-sm btn-ghost ml-auto dialog-close" @click="addDialog = false">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="dialog-body">
          <label class="field">
            <span class="field-label">标题</span>
            <input v-model="newEpisodeTitle" class="input" placeholder="默认按集数自动命名" />
            <span class="field-hint">留空时会自动按集数命名，例如“第 3 集”。</span>
          </label>
        </div>
        <div class="dialog-foot">
          <span class="dialog-foot-copy">创建后自动锁定当前启用的图片与视频生成能力。</span>
          <button class="btn" @click="addDialog = false">取消</button>
          <button class="btn btn-primary" :disabled="creatingEpisode" @click="addEpisode">
            {{ creatingEpisode ? '创建中...' : '创建' }}
          </button>
        </div>
      </div>
    </div>
    <ConfirmDialog
      :open="!!episodeToDelete"
      title="删除本集"
      :message="`确定删除「${episodeToDelete?.title || `第 ${episodeToDelete?.episode_number || episodeToDelete?.episodeNumber} 集`}」？删除后不可在列表中查看，其分镜与生成记录将不再可访问。`"
      :loading="deletingEpisode"
      @confirm="confirmDelEpisode"
      @cancel="episodeToDelete = null"
    />
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { dramaAPI, episodeAPI } from '~/composables/useApi'

const route = useRoute()
const drama = ref(null)
const dramaId = Number(route.params.id)
const addDialog = ref(false)
const creatingEpisode = ref(false)
const newEpisodeTitle = ref('')
const episodeToDelete = ref(null)
const deletingEpisode = ref(false)

// 集状态由用户手动标记（持久化到 episodes.status），不再按剧本内容自动推算
const epStatusOptions = [
  { label: '待开始', value: 'draft' },
  { label: '进行中', value: 'active' },
  { label: '已完成', value: 'completed' },
]
const epStatusMenuId = ref(null)

function epStatus(ep) { return ep.status || 'draft' }
function epStatusLabel(ep) { return epStatusOptions.find(s => s.value === epStatus(ep))?.label || '待开始' }
function epStatusDotClass(ep) { return epStatus(ep) === 'active' ? 'dot-active' : epStatus(ep) === 'completed' ? 'dot-done' : 'dot-pending' }

async function setEpisodeStatus(ep, status) {
  epStatusMenuId.value = null
  if (epStatus(ep) === status) return
  const prev = ep.status
  ep.status = status
  try {
    await episodeAPI.update(ep.id, { status })
  } catch (e) {
    ep.status = prev
    toast.error(e.message)
  }
}

async function load() {
  try {
    drama.value = await dramaAPI.get(dramaId)
  } catch (e) {
    toast.error(e.message)
  }
}

function openAddEpisode() {
  newEpisodeTitle.value = ''
  addDialog.value = true
}

async function addEpisode() {
  try {
    creatingEpisode.value = true
    // 图片/视频生成配置由后端自动锁定为当前启用的最高优先级配置
    await episodeAPI.create({
      drama_id: dramaId,
      title: newEpisodeTitle.value || undefined,
    })
    toast.success('已添加新集')
    addDialog.value = false
    load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    creatingEpisode.value = false
  }
}

async function confirmDelEpisode() {
  const ep = episodeToDelete.value
  if (!ep) return
  try {
    deletingEpisode.value = true
    await episodeAPI.del(ep.id)
    toast.success('已删除')
    episodeToDelete.value = null
    load()
  } catch (e) {
    toast.error(e.message)
  } finally {
    deletingEpisode.value = false
  }
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

/* Header card */
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
.head-action { flex-shrink: 0; }
.head-assets { flex-shrink: 0; }

.back-btn {
  width: 36px; height: 36px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: none; border-radius: 50%;
  background: rgba(0,0,0,0.05); color: var(--text-1);
  cursor: pointer;
  transition: background 0.16s var(--ease-out), color 0.16s var(--ease-out), box-shadow 0.16s var(--ease-out);
}
.back-btn:hover { background: rgba(0,0,0,0.09); color: var(--text-0); }
.back-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3.5px var(--button-focus);
}

.page-title {
  font-size: 22px; font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.2;
}

.page-meta { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.meta-item {
  display: flex; align-items: center; gap: 5px;
  font-size: 12.5px; color: var(--text-2);
}

/* Section label */
.section-label {
  display: flex; align-items: center; gap: 7px;
  font-size: 11px; font-weight: 700;
  color: var(--text-3); letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 12px;
}

/* Episode List */
.ep-grid { display: flex; flex-direction: column; gap: 12px; max-width: 760px; }

.ep-card {
  display: flex; align-items: center; gap: 16px;
  padding: 16px 20px;
  cursor: pointer;
  animation: fadeUp 0.35s var(--ease-out) both;
}
.ep-card:hover {
  transform: translateX(3px);
  box-shadow: var(--shadow-lift);
}

.ep-number {
  width: 52px; height: 52px; flex-shrink: 0;
  border-radius: var(--radius-lg);
  background: var(--accent-bg);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  font-family: var(--font-mono);
  color: var(--accent-text);
}
.ep-number span { font-size: 9px; letter-spacing: 0.12em; opacity: 0.65; }
.ep-number b { font-size: 16px; font-weight: 700; line-height: 1.1; }

.ep-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.ep-title { font-size: 14.5px; font-weight: 650; color: var(--text-0); }
.ep-status-wrap { position: relative; display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; }
.ep-status-btn { cursor: pointer; border: none; font: inherit; display: inline-flex; align-items: center; gap: 6px; }
.status-dot {
  width: 5px; height: 5px; border-radius: 50%;
}
.dot-active { background: var(--success); }
.dot-done { background: var(--accent); }
.dot-pending { background: var(--text-3); }
.status-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 108px;
  display: grid;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-raised);
  box-shadow: var(--shadow-lg);
  z-index: 10;
}
.status-menu-item {
  min-height: var(--button-height-sm);
  display: flex;
  align-items: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-1);
  padding: 0 9px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.14s var(--ease-out);
}
.status-menu-item:hover { background: var(--bg-hover); color: var(--text-0); }
.status-menu-item.on { color: var(--accent); background: var(--accent-bg); }
.ep-duration { font-size: 12px; color: var(--text-2); font-family: var(--font-mono); }

.ep-arrow { color: var(--text-3); flex-shrink: 0; transition: transform 0.18s var(--ease-out), color 0.18s var(--ease-out); display: flex; align-items: center; gap: 6px; }
.ep-card:hover .ep-arrow { transform: translateX(3px); color: var(--accent); }
.ep-delete {
  opacity: 0;
  color: var(--text-3);
  transition: opacity 0.15s var(--ease-out), color 0.15s var(--ease-out);
}
.ep-card:hover .ep-delete { opacity: 1; }
.ep-delete:hover { color: var(--action-danger); }
.ep-card:hover .ep-arrow:has(.ep-delete:hover) { transform: none; color: var(--text-3); }

/* Empty */
.ep-empty {
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  padding: 48px; text-align: center; color: var(--text-3); font-size: 13px;
  border-style: dashed;
}
.ep-empty-icon {
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--accent-bg); color: var(--accent-text);
  display: flex; align-items: center; justify-content: center;
}

/* Create Episode Dialog (on top of global .dialog skeleton) */
.ep-dialog { width: min(480px, 100%); }
.dialog-close { flex-shrink: 0; color: var(--text-2); }
.dialog-body { display: flex; flex-direction: column; gap: 20px; }

.field { display: flex; flex-direction: column; gap: 8px; }
.field-label { font-size: 12.5px; font-weight: 600; color: var(--text-1); }
.field-hint { font-size: 12px; color: var(--text-3); }

.dialog-foot-copy {
  margin-right: auto;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-3);
}

@media (max-width: 860px) {
  .page { padding: 20px 20px 32px; }
  .page-head { flex-wrap: wrap; }
  .dialog-foot { flex-wrap: wrap; gap: 10px; }
  .dialog-foot-copy { display: none; }
}
</style>
