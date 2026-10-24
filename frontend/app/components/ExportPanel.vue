<template>
  <div class="content-panel">
    <div v-if="!sbs.length" class="step-empty" style="flex:1">
      <div class="empty-visual">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </div>
      <div class="empty-title">{{ t('episode.prod.notReady') }}</div>
      <div class="empty-desc">{{ t('episode.export.notReadyDesc') }}</div>
      <button class="btn btn-primary" @click="emit('goto-script')">{{ t('episode.export.gotoScript') }}</button>
    </div>
    <div v-else class="export-split">
      <div class="export-main">
        <!-- 上方:成片列表 -->
        <div class="export-section">
          <div class="export-section-head">
            <span class="export-section-title">{{ t('episode.export.filmList') }}</span>
            <span class="dim" style="font-size:11px">{{ t('episode.export.countN', { n: merges.length }) }}</span>
            <button
              :class="['btn btn-sm ml-auto export-done-btn', { on: done }]"
              :title="t('episode.export.markDoneTitle')"
              @click="emit('toggle-done')"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {{ done ? t('episode.export.markedDone') : t('episode.export.markDone') }}
            </button>
            <button class="btn btn-sm" @click="emit('refresh')">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
              {{ t('common.refresh') }}
            </button>
          </div>
          <div v-if="merges.length" class="export-merge-strip">
            <div
              v-for="m in merges"
              :key="m.id"
              :class="['merge-card', m.status === 'completed' && m.merged_url && 'playable']"
              :role="m.status === 'completed' && m.merged_url ? 'button' : undefined"
              :tabindex="m.status === 'completed' && m.merged_url ? 0 : undefined"
              @click="m.status === 'completed' && m.merged_url && emit('play-merge', m)"
              @keydown.enter.prevent="m.status === 'completed' && m.merged_url && emit('play-merge', m)"
            >
              <div class="merge-card-thumb">
                <video
                  v-if="m.status === 'completed' && m.merged_url"
                  :src="'/' + m.merged_url"
                  :poster="posterOf('/' + m.merged_url) || undefined"
                  preload="none"
                  muted
                  playsinline
                  tabindex="-1"
                />
                <div v-else :class="['merge-card-pending', m.status === 'failed' && 'is-failed']" :title="m.status === 'failed' ? m.error_msg : null">
                  {{ m.status === 'failed' ? mapError(m.error_msg, { fallback: 'episode.export.mergeFailed' }) : t('episode.export.merging') }}
                </div>
                <span v-if="m.status === 'completed' && m.merged_url" class="merge-card-play">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                </span>
              </div>
              <div class="merge-card-meta">
                <span class="mono">{{ helpers.formatHistoryTime(m.created_at) }}</span>
                <span v-if="m.duration">· {{ m.duration }}s</span>
                <a
                  v-if="m.status === 'completed' && m.merged_url"
                  :href="'/' + m.merged_url"
                  download
                  class="btn btn-sm"
                  @click.stop
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  {{ t('common.download') }}
                </a>
              </div>
            </div>
          </div>
          <div v-else class="export-merge-empty">{{ t('episode.export.empty') }}</div>
        </div>

        <!-- 下方:镜头素材(可勾选) -->
        <div class="export-section export-section-grow">
          <div class="export-section-head">
            <span class="export-section-title">{{ t('episode.export.shotAssets') }}</span>
            <span class="dim" style="font-size:11px">{{ t('episode.export.shotStat', { done: shotVidCount, total: sbs.length, selected: selectedReadyIds.length }) }}</span>
            <div class="ml-auto flex gap-1">
              <button class="btn btn-sm" :disabled="!readyIds.length" @click="emit('select-all')">
                {{ selectedReadyIds.length === readyIds.length && readyIds.length ? t('episode.export.clearSelection') : t('episode.export.selectAllReady') }}
              </button>
              <button
                class="btn btn-sm btn-primary"
                :disabled="!selectedReadyIds.length"
                @click="emit('merge', selectedReadyIds)"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                {{ t('episode.export.mergeSelected', { n: selectedReadyIds.length }) }}
              </button>
            </div>
          </div>
          <div class="export-grid">
            <div
              v-for="(sb, i) in sbs"
              :key="sb.id"
              :class="['exp-card', { selected: selectedReadyIds.includes(sb.id), playable: helpers.hasVid(sb) }]"
              :role="helpers.hasVid(sb) ? 'button' : undefined"
              :tabindex="helpers.hasVid(sb) ? 0 : undefined"
              @click="emit('toggle-select', sb)"
              @keydown.enter.prevent="emit('toggle-select', sb)"
            >
              <div class="exp-thumb">
                <video
                  v-if="helpers.hasVid(sb)"
                  :src="'/' + helpers.getVideoUrl(sb)"
                  :poster="posterOf('/' + helpers.getVideoUrl(sb)) || undefined"
                  preload="none"
                  muted
                  playsinline
                  tabindex="-1"
                />
                <div v-else class="exp-thumb-empty">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                </div>
                <span class="exp-thumb-index">#{{ String(i+1).padStart(2,'0') }}</span>
                <span v-if="sb.duration" class="exp-thumb-duration">{{ sb.duration }}s</span>
                <span
                  v-if="helpers.hasVid(sb)"
                  class="exp-play"
                  :title="t('episode.export.previewShot')"
                  @click.stop="emit('preview', sb)"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                </span>
                <span v-if="helpers.hasVid(sb)" :class="['exp-check', selectedReadyIds.includes(sb.id) && 'on']">
                  <svg v-if="selectedReadyIds.includes(sb.id)" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </span>
              </div>
              <div class="exp-row-line">
                <span class="truncate" style="flex:1;font-size:11px">{{ sb.description || sb.title || '—' }}</span>
                <span :class="['dot', helpers.hasVid(sb) && 'ok']" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { mapError } from '~/composables/useToast'
import { posterOf } from '~/composables/useMedia'

const props = defineProps({
  // 分镜列表（镜头素材勾选区）
  sbs: { type: Array, default: () => [] },
  // 拼接记录列表
  merges: { type: Array, default: () => [] },
  done: { type: Boolean, default: false },
  readyIds: { type: Array, default: () => [] },
  selectedReadyIds: { type: Array, default: () => [] },
  shotVidCount: { type: Number, default: 0 },
  // 父组件持有的展示函数（与列表视图共用）
  helpers: { type: Object, required: true },
})

const emit = defineEmits(['toggle-done', 'refresh', 'select-all', 'merge', 'toggle-select', 'preview', 'play-merge', 'goto-script'])
const { t } = useI18n()
</script>

<style scoped>
.content-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.export-split { flex: 1; display: flex; min-height: 0; }
.export-main { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; align-items: stretch; gap: 18px; padding: 16px 20px 24px; }
.export-section { display: flex; flex-direction: column; min-height: 0; }
.export-section-grow { flex: 1; }
.export-section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.export-section-title { font-size: 13px; font-weight: 800; color: var(--text-0); }
.export-merge-strip { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 4px; }
.merge-card {
  flex: 0 0 auto;
  width: 260px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border-radius: var(--radius);
  background: var(--surface-raised);
  border: 1px solid var(--border);
}
.merge-card video {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 6px;
  background: var(--media-surface);
  display: block;
}
.merge-card-pending {
  width: 100%;
  aspect-ratio: 16 / 9;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--text-3);
  font-size: 11px;
  text-align: center;
}
.merge-card-pending.is-failed { color: var(--error); background: var(--error-bg); }
.merge-card-meta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-3); min-width: 0; }
.merge-card-meta .btn { margin-left: auto; }
.merge-card.playable { cursor: pointer; }
.merge-card.playable:hover { border-color: var(--border-strong); box-shadow: var(--shadow-card); }
.merge-card-thumb { position: relative; }
.merge-card-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(0,0,0,0.28);
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s var(--ease-out);
  pointer-events: none;
}
.merge-card.playable:hover .merge-card-play { opacity: 1; }
.export-merge-empty {
  padding: 14px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
}
.export-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  align-content: start;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}
.exp-card { display: flex; flex-direction: column; align-items: stretch; gap: 6px; padding: 8px; border-radius: var(--radius); background: var(--surface-raised); border: 1px solid var(--border); }
.exp-card:hover { border-color: var(--border-strong); box-shadow: var(--shadow-card); }
.exp-card.playable { cursor: pointer; }
.exp-card.selected { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-glow); }
.exp-check {
  position: absolute;
  right: 6px;
  top: 6px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.9);
  background: rgba(0,0,0,0.35);
  color: #fff;
}
.exp-check.on { background: var(--accent); border-color: var(--accent); }
.exp-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--surface-outline);
  border-radius: 6px;
  background: var(--media-surface);
}
.exp-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; }
.exp-thumb-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.exp-thumb-index {
  position: absolute;
  left: 5px;
  top: 5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0,0,0,0.56);
  color: #fff;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 800;
}
.exp-thumb-duration {
  position: absolute;
  right: 5px;
  bottom: 5px;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-family: var(--font-mono);
  font-size: 9px;
}
/* 镜头预览：悬停浮现的居中播放钮，点击打开预览弹窗（不影响卡片勾选） */
.exp-play {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) scale(0.9);
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0,0,0,0.62);
  color: #fff;
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.15s, transform 0.15s, background 0.15s;
}
.exp-card:hover .exp-play { opacity: 1; transform: translate(-50%, -50%) scale(1); }
.exp-play:hover { background: var(--accent); }
/* 导出完成手动标记按钮 */
.export-done-btn.on {
  background: var(--success-bg, var(--accent-bg));
  color: var(--success, var(--accent-text));
  border-color: transparent;
  font-weight: 600;
}
.exp-row-line { display: flex; align-items: center; gap: 8px; min-width: 0; }

/* 父组件共享类副本（父 scoped 样式作用不到子组件节点，改动需两侧同步） */
.dim { color: var(--text-3); }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--bg-3); flex-shrink: 0; }
.dot.ok { background: var(--success); }
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

@media (max-width: 1080px) {
  .export-split { flex-direction: column; }
}
</style>
