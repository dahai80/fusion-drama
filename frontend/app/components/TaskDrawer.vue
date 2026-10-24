<template>
  <div v-if="open" class="task-drawer-overlay" @click.self="emit('close')">
    <aside class="task-drawer" role="dialog" aria-modal="true" :aria-label="t('episode.tasks.title')">
      <header class="task-drawer-head">
        <div>
          <div class="video-task-title">{{ t('episode.tasks.title') }}</div>
          <div class="video-task-meta">{{ t('episode.tasks.meta', { n: rows.length }) }}</div>
        </div>
        <div class="task-drawer-head-actions">
          <button class="btn btn-sm" @click="emit('refresh')">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            {{ t('common.refresh') }}
          </button>
          <button class="btn btn-ghost btn-icon" @click="emit('close')"><X :size="14" /></button>
        </div>
      </header>
      <div class="video-task-metrics task-drawer-metrics">
        <span class="video-task-metric is-pending">{{ t('episode.vid.metricPending', { n: activeCount }) }}</span>
        <span class="video-task-metric is-done">{{ t('episode.vid.metricDone', { n: doneCount }) }}</span>
        <span class="video-task-metric is-failed">{{ t('episode.vid.metricFailed', { n: failedCount }) }}</span>
      </div>
      <div v-if="!rows.length" class="step-empty task-drawer-empty">
        <div class="empty-visual">
          <ListTodo :size="32" />
        </div>
        <div class="empty-title">{{ t('episode.tasks.emptyTitle') }}</div>
        <div class="empty-desc">{{ t('episode.tasks.emptyDesc') }}</div>
      </div>
      <div v-else class="video-task-table task-drawer-body">
        <div
          v-for="row in rows"
          :key="row.key"
          :class="['video-task-row', 'gen-task-row', 'is-' + stateClass(row.status)]"
        >
          <div class="video-task-preview">
            <video
              v-if="row.previewUrl && (row.kind === 'video' || row.kind === 'merge')"
              :src="previewSrc(row.previewUrl)"
              :poster="posterOf(previewSrc(row.previewUrl)) || undefined"
              controls
              preload="none"
              playsinline
            />
            <img
              v-else-if="row.previewUrl"
              :src="thumbOf(previewSrc(row.previewUrl))"
              :alt="row.targetLabel"
              loading="lazy"
              @error="thumbFallback($event, previewSrc(row.previewUrl))"
              @click="emit('open-image', previewSrc(row.previewUrl), row.targetLabel)"
            />
            <div v-else class="video-task-empty">
              <Loader2 v-if="stateClass(row.status) === 'pending'" :size="18" class="animate-spin" />
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            </div>
            <span class="video-task-index">{{ kindLabel(row.kind) }}</span>
          </div>
          <div class="video-task-main">
            <div class="video-task-line">
              <strong class="video-task-name truncate">{{ row.targetLabel }}</strong>
            </div>
            <div class="video-task-meta-line">
              <span class="video-task-loc truncate">{{ row.provider }}{{ row.model ? ' · ' + row.model : '' }}</span>
              <template v-if="duration(row)">
                <span class="video-task-sep">·</span>
                <span>{{ t('episode.tasks.duration', { dur: duration(row) }) }}</span>
              </template>
              <span class="video-task-sep">·</span>
              <span>#{{ row.id }}</span>
            </div>
            <div v-if="row.errorMsg" class="video-task-error" :title="row.errorMsg">
              {{ mapError(row.errorMsg) }}
              <div v-if="row.kind === 'video' && helpers.moderationHint(row.errorMsg)" class="video-task-error-hint">{{ helpers.moderationHint(row.errorMsg) }}</div>
            </div>
          </div>
          <span :class="['video-task-status', 'is-' + stateClass(row.status)]">
            <span :class="['dot', stateClass(row.status) === 'done' && 'ok', stateClass(row.status) === 'pending' && 'pending']" />
            {{ statusLabel(row.status) }}
          </span>
        </div>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { ListTodo, Loader2, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { mapError } from '~/composables/useToast'
import { posterOf, thumbOf, thumbFallback } from '~/composables/useMedia'

const props = defineProps({
  open: { type: Boolean, default: false },
  // 统一行结构（image/video/merge 合并按时间倒序），由父组件 genTaskRows 组装
  rows: { type: Array, default: () => [] },
  // 父组件持有的判定函数（与列表视图共用）
  helpers: { type: Object, required: true },
})

const emit = defineEmits(['close', 'refresh', 'open-image'])
const { t } = useI18n()

// 计数语义与父组件顶栏徽章一致：processing 计进行中，merge 的 pending 也算
const activeCount = computed(() =>
  props.rows.filter(r => r.status === 'processing' || (r.kind === 'merge' && r.status === 'pending')).length)
const doneCount = computed(() => props.rows.filter(r => r.status === 'completed').length)
const failedCount = computed(() => props.rows.filter(r => r.status === 'failed').length)

function kindLabel(kind) {
  return kind === 'extract' ? t('episode.tasks.extractKind') : kind === 'image' ? t('common.serviceType.image') : kind === 'video' ? t('common.serviceType.video') : t('episode.tasks.mergeKind')
}

function statusLabel(status) {
  if (status === 'completed') return t('episode.status.done')
  if (status === 'failed') return t('episode.status.failed')
  return t('episode.status.generating')
}

// 映射到现有 video-task-status 的样式类:is-done / is-pending / is-failed
function stateClass(status) {
  if (status === 'completed') return 'done'
  if (status === 'failed') return 'failed'
  return 'pending'
}

// local_path 为站内相对路径补 '/',远端 result_url 原样使用
function previewSrc(url) {
  if (!url) return ''
  return /^https?:\/\//.test(url) ? url : '/' + url
}

function duration(row) {
  if (!row.createdAt || !row.completedAt) return ''
  const ms = new Date(row.completedAt).getTime() - new Date(row.createdAt).getTime()
  if (!Number.isFinite(ms) || ms < 0) return ''
  return ms >= 60000 ? `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s` : `${Math.round(ms / 1000)}s`
}
</script>

<style scoped>
.gen-task-row {
  grid-template-columns: 84px minmax(0, 1fr) auto;
  cursor: default;
}
.gen-task-row .video-task-preview img {
  cursor: zoom-in;
}
.task-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 118;
  display: flex;
  justify-content: flex-end;
  background: var(--scrim);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: fadeIn 0.18s var(--ease-out);
}
.task-drawer {
  width: min(560px, 100vw);
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--panel-bg);
  border-left: 1px solid var(--panel-border);
  box-shadow: var(--shadow-xl);
  animation: taskDrawerIn 0.22s var(--ease-out);
}
@keyframes taskDrawerIn {
  from { transform: translateX(24px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
.task-drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--surface-outline);
}
.task-drawer-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.task-drawer-metrics {
  padding: 10px 16px;
  border-bottom: 1px solid var(--surface-outline);
}
.task-drawer-body {
  flex: 1;
  overflow-y: auto;
}
.task-drawer-empty {
  flex: 1;
  justify-content: center;
}

  /* ===== 与列表视图共用的行样式（组件内副本，改动需两侧同步） ===== */
.video-task-title {
  font-size: 13px;
  line-height: 1.2;
  font-weight: 850;
  color: var(--text-0);
}
.video-task-meta {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-3);
}
.video-task-metrics {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}
.video-task-metric,
.video-task-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid var(--surface-outline);
  border-radius: 999px;
  background: var(--overlay-track);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 750;
  white-space: nowrap;
}
.video-task-metric.is-done,
.video-task-status.is-done {
  color: var(--success);
  border-color: var(--success-bg);
  background: var(--success-bg);
}
.video-task-metric.is-pending,
.video-task-status.is-pending,
.video-task-status.is-ready {
  color: var(--accent-text);
  border-color: var(--accent-glow);
  background: var(--accent-bg);
}
.video-task-metric.is-failed,
.video-task-status.is-failed,
.video-task-status.is-blocked {
  color: var(--warning);
  border-color: var(--warning-bg);
  background: var(--warning-bg);
}
.video-task-table {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.video-task-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-top: 1px solid var(--surface-outline);
  transition: background 0.16s var(--ease-out), border-color 0.16s var(--ease-out);
  cursor: pointer;
}
.video-task-row:first-child {
  border-top: 0;
}
.video-task-row:hover,
.video-task-row.is-pending {
  background: var(--bg-hover);
}
.video-task-row.is-failed {
  background: var(--error-bg);
}
.video-task-preview {
  position: relative;
  width: 56px;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius-sm);
  background: var(--bg-2);
}
.video-task-preview video,
.video-task-preview img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.video-task-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
}
.video-task-index {
  position: absolute;
  left: 3px;
  top: 3px;
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(0,0,0,0.56);
  color: #fff;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 800;
}
.video-task-main {
  min-width: 0;
}
.video-task-line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.video-task-name {
  min-width: 0;
  font-size: 12px;
  line-height: 1.35;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.video-task-meta-line {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
  font-size: 10.5px;
  color: var(--text-3);
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
}
.video-task-loc {
  color: var(--text-2);
}
.video-task-sep { color: var(--text-3); opacity: 0.5; }
.video-task-error {
  margin-top: 5px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--error);
}
.video-task-error-hint {
  margin-top: 3px;
  color: var(--accent-text, var(--accent));
  font-weight: 600;
}
.video-task-status {
  justify-self: end;
  align-self: center;
}
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--bg-3); flex-shrink: 0; }
.dot.ok { background: var(--success); }
.dot.pending {
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.step-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; min-height: 300px; gap: 10px; padding: 46px;
  animation: fadeIn 0.3s var(--ease-out);
}
.empty-visual {
  width: 72px; height: 72px; border-radius: 22px;
  background: var(--bg-1); color: var(--accent);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 8px;
}
.empty-title { font-size: 22px; font-weight: 700; font-family: var(--font-display); color: var(--text-0); }
.empty-desc { font-size: 13px; color: var(--text-2); max-width: 420px; text-align: center; line-height: 1.8; }
</style>
