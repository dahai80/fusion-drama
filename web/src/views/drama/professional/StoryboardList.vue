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
        class="storyboard-card"
        :class="{ active: currentStoryboardId === shot.id }"
        @click="$emit('select', shot.id)"
      >
        <!-- 缩略图区域 16:9 大图 -->
        <div class="card-thumb">
          <img v-if="getStoryboardThumbnail(shot)" :src="getStoryboardThumbnail(shot) ?? undefined" alt="" />
          <div v-else class="thumb-placeholder">
            <el-icon :size="20"><Picture /></el-icon>
          </div>
          <!-- 生成状态指示器 -->
          <div class="gen-status">
            <span class="status-dot" :class="getStatusClass(shot)"></span>
            <span class="status-label">{{ getStatusText(shot) }}</span>
          </div>
          <!-- hover 重新生成按钮 -->
          <button class="regen-btn" @click.stop="$emit('regenerate', shot)" title="重新生成">
            <el-icon><Refresh /></el-icon>
          </button>
        </div>
        <!-- 底部信息条 -->
        <div class="card-info">
          <span class="card-num">#{{ shot.storyboard_number || shot.id }}</span>
          <span class="card-name">{{ shot.title || $t('storyboard.untitled') }}</span>
          <span class="card-duration" v-if="shot.duration">{{ shot.duration }}s</span>
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
.storyboard-panel-v2 {
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary, #f0f2f5);
  border-right: 1px solid var(--border-color, #e4e7ed);
  overflow: hidden;
  width: 220px;
  flex-shrink: 0;
}

.panel-header-v2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color, #e4e7ed);
  flex-shrink: 0;

  .panel-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #303133);
  }
}

.storyboard-cards {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

// 卡片
.storyboard-card {
  position: relative;
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid var(--border-primary, #e5e7eb);
  background: var(--bg-elevated, #ffffff);
  transition: all 150ms;

  &:hover .regen-btn { opacity: 1; }
  &:hover { border-color: #a0cfff; }

  &.active {
    border-color: var(--accent, #e8a243);
    border-left-width: 4px;
  }
}

// 缩略图
.card-thumb {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--bg-primary, #f5f7fa);
  overflow: hidden;

  img { width: 100%; height: 100%; object-fit: cover; }
}

.thumb-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  color: var(--text-muted, #c0c4cc);
}

// 生成状态标签
.gen-status {
  position: absolute;
  bottom: 4px; left: 4px;
  display: flex; align-items: center; gap: 3px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0,0,0,0.55);
  font-size: 10px;
  color: #fff;
  pointer-events: none;
}

.status-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;

  &.status-none { background: #6b7280; }
  &.status-generating {
    background: var(--accent, #e8a243);
    animation: pulse-dot 1s ease-in-out infinite;
  }
  &.status-done { background: #22c55e; }
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.7); }
}

// hover 重新生成按钮
.regen-btn {
  position: absolute;
  top: 4px; right: 4px;
  width: 24px; height: 24px;
  border: none;
  border-radius: 4px;
  background: rgba(0,0,0,0.55);
  color: #fff;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  opacity: 0;
  transition: opacity 150ms;

  &:hover { background: rgba(0,0,0,0.75); }
}

// 底部信息条
.card-info {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  background: var(--bg-elevated, #fff);
}

.card-num { font-size: 11px; color: var(--text-muted, #909399); flex-shrink: 0; }
.card-name { font-size: 12px; color: var(--text-primary, #303133); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-duration { font-size: 11px; color: var(--text-muted, #909399); flex-shrink: 0; }
</style>
