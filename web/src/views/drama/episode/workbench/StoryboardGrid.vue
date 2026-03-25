<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Image, Video, Wand2 } from 'lucide-vue-next'
import type { Storyboard } from '@/types/drama'
import StoryboardCard from './StoryboardCard.vue'

const props = defineProps<{
  storyboards: Storyboard[]
  progress: { total: number; withImage: number; withVideo: number }
}>()

const emit = defineEmits<{
  select: [id: string]
  add: []
  batchGenerateImages: []
  batchGenerateVideos: []
}>()

const generatingCount = computed(() =>
  props.storyboards.filter(s =>
    s.image_generation_status === 'processing' ||
    s.image_generation_status === 'generating' ||
    s.status === 'processing' ||
    s.status === 'generating'
  ).length
)

const pendingCount = computed(() =>
  props.progress.total - props.progress.withImage - generatingCount.value
)
</script>

<template>
  <div class="storyboard-grid">
    <!-- Toolbar -->
    <div class="grid-toolbar">
      <div class="toolbar-left">
        <span class="toolbar-title">镜头 ({{ progress.total }})</span>
        <div class="toolbar-badges">
          <Badge v-if="progress.withVideo > 0" class="badge badge--complete">
            完成 {{ progress.withVideo }}
          </Badge>
          <Badge v-if="progress.withImage - progress.withVideo > 0" class="badge badge--image">
            有图 {{ progress.withImage - progress.withVideo }}
          </Badge>
          <Badge v-if="generatingCount > 0" class="badge badge--generating">
            生成中 {{ generatingCount }}
          </Badge>
          <Badge v-if="pendingCount > 0" class="badge badge--pending">
            待处理 {{ pendingCount }}
          </Badge>
        </div>
      </div>
      <div class="toolbar-actions">
        <Button variant="ghost" size="sm" class="toolbar-btn" @click="emit('add')">
          <Plus :size="14" />
          添加
        </Button>
        <Button variant="ghost" size="sm" class="toolbar-btn" @click="emit('batchGenerateImages')">
          <Image :size="14" />
          批量生成图片
        </Button>
        <Button variant="ghost" size="sm" class="toolbar-btn" @click="emit('batchGenerateVideos')">
          <Video :size="14" />
          批量生成视频
        </Button>
      </div>
    </div>

    <!-- Grid -->
    <div v-if="storyboards.length > 0" class="grid-container">
      <StoryboardCard
        v-for="(sb, idx) in storyboards"
        :key="sb.id"
        :storyboard="sb"
        :index="idx"
        @select="emit('select', $event)"
      />
    </div>

    <!-- Empty state -->
    <div v-else class="grid-empty">
      <div class="grid-empty__content">
        <Wand2 :size="32" class="grid-empty__icon" />
        <p class="grid-empty__text">暂无分镜，点击下方按钮开始创作</p>
        <Button variant="outline" size="sm" class="grid-empty__btn" @click="emit('add')">
          <Wand2 :size="14" />
          Agent 拆解分镜
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.storyboard-grid {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* Toolbar */
.grid-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
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
  color: var(--text-primary, rgba(255, 255, 255, 0.9));
  white-space: nowrap;
}

.toolbar-badges {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
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

.toolbar-btn {
  font-size: 11px !important;
  height: 28px !important;
  padding: 0 8px !important;
  color: var(--text-secondary, rgba(255, 255, 255, 0.55)) !important;
}

.toolbar-btn:hover {
  color: var(--text-primary, rgba(255, 255, 255, 0.9)) !important;
}

/* Grid */
.grid-container {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  padding: 10px 12px;
  overflow-y: auto;
  flex: 1;
}

/* Empty state */
.grid-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.grid-empty__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.grid-empty__icon {
  color: var(--text-muted, rgba(255, 255, 255, 0.25));
}

.grid-empty__text {
  font-size: 13px;
  color: var(--text-muted, rgba(255, 255, 255, 0.35));
}

.grid-empty__btn {
  font-size: 12px !important;
  color: var(--text-secondary, rgba(255, 255, 255, 0.55)) !important;
}
</style>
