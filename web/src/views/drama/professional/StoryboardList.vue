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
        <!-- 缩略图 -->
        <div class="card-thumbnail">
          <img
            v-if="getStoryboardThumbnail(shot)"
            :src="getStoryboardThumbnail(shot) ?? undefined"
            alt=""
            class="thumbnail-img"
          />
          <div v-else class="thumbnail-placeholder">
            <el-icon :size="18" color="#aaa"><Picture /></el-icon>
          </div>
          <div class="shot-number-badge">#{{ shot.storyboard_number }}</div>
        </div>
        <!-- 信息区 -->
        <div class="card-info">
          <div class="card-title">{{ shot.title || $t('storyboard.untitled') }}</div>
          <div class="card-meta">
            <span class="card-duration">{{ shot.duration }}s</span>
            <span
              class="status-dot"
              :class="(shot as any).background?.image_url ? 'dot-image' : 'dot-empty'"
            >图</span>
          </div>
        </div>
        <!-- 删除按钮 -->
        <el-button
          link type="danger" :icon="Delete" size="small"
          class="card-delete-btn"
          @click.stop="$emit('delete', shot)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus, Picture, Delete } from '@element-plus/icons-vue'
import type { Storyboard } from '@/types/drama'

defineProps<{
  storyboards: Storyboard[]
  currentStoryboardId: string | null
  getStoryboardThumbnail: (s: any) => string | null
}>()

defineEmits<{
  select: [id: string]
  add: []
  delete: [storyboard: Storyboard]
}>()
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

.storyboard-card {
  display: flex;
  align-items: center;
  gap: 7px;
  background: #fff;
  border: 2px solid transparent;
  border-radius: 7px;
  padding: 5px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  position: relative;

  &:hover { border-color: #a0cfff; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  &.active { border-color: #409eff; background: #ecf5ff; }
}

.card-thumbnail {
  width: 68px;
  height: 44px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
  background: #e0e0e0;

  .thumbnail-img { width: 100%; height: 100%; object-fit: cover; }
  .thumbnail-placeholder {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: #e8e8e8;
  }
  .shot-number-badge {
    position: absolute; bottom: 2px; left: 2px;
    background: rgba(0,0,0,.6); color: #fff;
    font-size: 9px; padding: 0 3px; border-radius: 2px; line-height: 15px;
  }
}

.card-info {
  flex: 1;
  min-width: 0;

  .card-title {
    font-size: 12px; font-weight: 500;
    color: var(--text-primary, #303133);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    margin-bottom: 3px;
  }
  .card-meta {
    display: flex; align-items: center; justify-content: space-between;
    .card-duration { font-size: 11px; color: #909399; }
  }
  .status-dot {
    font-size: 10px; padding: 1px 4px; border-radius: 3px; font-weight: 500;
    &.dot-image { background: #ecf5ff; color: #409eff; }
    &.dot-empty { background: #f4f4f5; color: #c0c4cc; }
  }
}

.card-delete-btn {
  flex-shrink: 0; opacity: 0; transition: opacity 0.15s;
}
.storyboard-card:hover .card-delete-btn { opacity: 1; }
</style>
