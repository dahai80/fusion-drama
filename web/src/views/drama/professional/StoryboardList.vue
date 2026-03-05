<template>
  <div class="storyboard-panel-v2">
    <div class="panel-header-v2">
      <span class="panel-title">{{ $t('storyboard.scriptStructure') }}</span>
      <el-button text :icon="Plus" size="small" @click="$emit('add')">{{ $t('storyboard.add') }}</el-button>
    </div>
    <div class="storyboard-cards">
      <div
        v-for="shot in storyboards"
        :key="shot.id"
        class="film-card"
        :class="{ active: currentStoryboardId === shot.id }"
        @click="$emit('select', shot.id)"
        :title="shot.title || $t('storyboard.untitled')"
      >
        <!-- 缩略图 -->
        <div class="film-thumb">
          <img v-if="getStoryboardThumbnail(shot)" :src="getStoryboardThumbnail(shot) ?? undefined" alt="" />
          <div v-else class="film-thumb-placeholder">
            <span class="film-num-big">#{{ shot.storyboard_number || shot.id }}</span>
          </div>
          <!-- hover 重新生成按钮 -->
          <button class="film-regen-btn" @click.stop="$emit('regenerate', shot)" title="重新生成">
            <el-icon><Refresh /></el-icon>
          </button>
        </div>
        <!-- 右侧元信息 -->
        <div class="film-meta">
          <span class="film-seq">#{{ shot.storyboard_number || shot.id }}</span>
          <span class="film-dot" :class="getStatusClass(shot)"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Refresh, Picture, Plus } from '@element-plus/icons-vue'
import { useI18n } from 'vue-i18n'
import type { Storyboard } from '@/types/drama'

const { t } = useI18n()

const props = defineProps<{
  storyboards: Storyboard[]
  currentStoryboardId: string | null
  getStoryboardThumbnail: (s: any) => string | null
  generatedVideos?: any[]
  generatingIds?: Set<string>
}>()

defineEmits<{
  select: [id: string]
  add: []
  delete: [storyboard: Storyboard]
  regenerate: [storyboard: Storyboard]
}>()

// 判断某分镜的状态
const getStatusClass = (storyboard: Storyboard) => {
  const sid = String(storyboard.id)
  if (props.generatingIds?.has(sid)) return 'status-generating'
  // 如果没有 generatingIds，从 generatedVideos 中判断 pending/processing 状态
  const isPending = props.generatedVideos?.some(
    (v) => String(v.storyboard_id) === sid && (v.status === 'pending' || v.status === 'processing')
  )
  if (isPending) return 'status-generating'
  const hasVideo = props.generatedVideos?.some(
    (v) => String(v.storyboard_id) === sid && v.status === 'completed' && v.video_url
  )
  return hasVideo ? 'status-done' : 'status-none'
}

const getStatusText = (storyboard: Storyboard) => {
  const cls = getStatusClass(storyboard)
  if (cls === 'status-generating') return t('professionalEditor.statusGenerating')
  if (cls === 'status-done') return t('professionalEditor.statusDone')
  return t('professionalEditor.statusNone')
}
</script>

<style scoped lang="scss">
/* 面板容器 */
.storyboard-panel-v2 {
  display: flex;
  flex-direction: column;
  background: var(--glass-bg-canvas);
  border-right: 1px solid var(--glass-stroke-base);
  overflow: hidden;
  width: 120px;
  flex-shrink: 0;
}

/* 顶部 header */
.panel-header-v2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid var(--glass-stroke-base);
  flex-shrink: 0;
  gap: 4px;

  .panel-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--glass-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
}

/* 滚动列表 */
.storyboard-cards {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;

  &::-webkit-scrollbar { width: 3px; }
  &::-webkit-scrollbar-thumb { background: var(--glass-stroke-base); border-radius: 2px; }
}

/* 胶片卡片 */
.film-card {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px;
  border-radius: 6px;
  border: 1px solid transparent;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: all 120ms;
  flex-shrink: 0;
  height: 52px;
  position: relative;

  &:hover {
    background: var(--glass-ghost-hover-bg);
    border-color: var(--glass-stroke-base);
    border-left-color: var(--glass-stroke-base);
    .film-regen-btn { opacity: 1; }
  }

  &.active {
    background: var(--glass-tone-warning-bg);
    border-left-color: var(--accent, #e8a243);
    border-color: var(--glass-stroke-base);
  }
}

/* 缩略图 */
.film-thumb {
  width: 62px;
  height: 38px;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
  flex-shrink: 0;
  position: relative;

  img { width: 100%; height: 100%; object-fit: cover; display: block; }
}

.film-thumb-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: var(--glass-tone-neutral-bg);
}

.film-num-big {
  font-size: 10px;
  font-weight: 700;
  color: var(--glass-text-tertiary);
}

/* hover 重新生成按钮 */
.film-regen-btn {
  position: absolute;
  inset: 0;
  width: 100%; height: 100%;
  border: none;
  border-radius: 4px;
  background: rgba(0,0,0,0.55);
  color: #fff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transition: opacity 150ms;
  font-size: 12px;

  &:hover { background: rgba(0,0,0,0.75); }
}

/* 右侧元信息 */
.film-meta {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
}

.film-seq {
  font-size: 10px;
  font-weight: 600;
  color: var(--glass-text-tertiary);
  white-space: nowrap;
}

/* 状态点 */
.film-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;

  &.status-none { background: var(--glass-stroke-strong); }
  &.status-generating {
    background: var(--accent, #e8a243);
    animation: pulse-dot 1s ease-in-out infinite;
  }
  &.status-done { background: var(--glass-tone-success-fg); }
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.7); }
}
</style>
