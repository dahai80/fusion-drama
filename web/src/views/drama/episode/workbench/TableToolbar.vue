<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Image, Video, Grid3X3, X } from 'lucide-vue-next'

defineProps<{
  total: number
  withImage: number
  withVideo: number
  generating: number
  hasSelection: boolean
  selectionCount: number
}>()

defineEmits<{
  add: []
  batchImages: []
  batchVideos: []
  generateGrid: []
  clearSelection: []
}>()
</script>

<template>
  <div class="table-toolbar">
    <div class="toolbar-left">
      <span class="toolbar-title">镜头 ({{ total }})</span>
      <div class="toolbar-badges">
        <Badge v-if="withVideo > 0" class="badge badge--complete">完成 {{ withVideo }}</Badge>
        <Badge v-if="withImage - withVideo > 0" class="badge badge--image">有图 {{ withImage - withVideo }}</Badge>
        <Badge v-if="generating > 0" class="badge badge--generating">生成中 {{ generating }}</Badge>
        <Badge v-if="total - withImage - generating > 0" class="badge badge--pending">
          待处理 {{ total - withImage - generating }}
        </Badge>
      </div>
    </div>
    <div class="toolbar-actions">
      <!-- Selection mode actions -->
      <template v-if="hasSelection">
        <span class="selection-count">已选 {{ selectionCount }}</span>
        <Button variant="ghost" size="sm" class="toolbar-btn" @click="$emit('generateGrid')">
          <Grid3X3 :size="14" />
          生成宫格图
        </Button>
        <Button variant="ghost" size="sm" class="toolbar-btn" @click="$emit('batchImages')">
          <Image :size="14" />
          批量生成图片
        </Button>
        <Button variant="ghost" size="sm" class="toolbar-btn" @click="$emit('batchVideos')">
          <Video :size="14" />
          批量生成视频
        </Button>
        <Button variant="ghost" size="icon" class="toolbar-btn toolbar-btn--clear" @click="$emit('clearSelection')">
          <X :size="14" />
        </Button>
      </template>
      <!-- Normal mode actions -->
      <template v-else>
        <Button variant="ghost" size="sm" class="toolbar-btn" @click="$emit('add')">
          <Plus :size="14" />
          添加
        </Button>
        <Button variant="ghost" size="sm" class="toolbar-btn" @click="$emit('batchImages')">
          <Image :size="14" />
          批量生成图片
        </Button>
        <Button variant="ghost" size="sm" class="toolbar-btn" @click="$emit('batchVideos')">
          <Video :size="14" />
          批量生成视频
        </Button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-primary, rgba(255, 255, 255, 0.06));
  flex-shrink: 0;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.toolbar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
}

.toolbar-badges {
  display: flex;
  align-items: center;
  gap: 4px;
}

.badge {
  font-size: 10px !important;
  padding: 1px 7px !important;
  height: auto !important;
  border-radius: 9999px !important;
  font-weight: 500 !important;
  border: none !important;
}

.badge--complete {
  background: rgba(94, 230, 176, 0.15) !important;
  color: rgba(94, 230, 176, 0.9) !important;
}

.badge--image {
  background: rgba(232, 162, 67, 0.15) !important;
  color: rgba(232, 162, 67, 0.9) !important;
}

.badge--generating {
  background: rgba(96, 165, 250, 0.15) !important;
  color: rgba(96, 165, 250, 0.9) !important;
}

.badge--pending {
  background: rgba(255, 255, 255, 0.06) !important;
  color: rgba(255, 255, 255, 0.45) !important;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.selection-count {
  font-size: 12px;
  font-weight: 500;
  color: var(--accent, #e8a243);
  margin-right: 4px;
}

.toolbar-btn {
  font-size: 11px !important;
  height: 28px !important;
  padding: 0 8px !important;
  color: var(--text-secondary) !important;
}

.toolbar-btn:hover {
  color: var(--text-primary) !important;
}

.toolbar-btn--clear {
  width: 28px !important;
  padding: 0 !important;
}
</style>
