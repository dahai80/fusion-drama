<script setup lang="ts">
import { computed } from 'vue'
import { Checkbox } from '@/components/ui/checkbox'
import { Wand2, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import type { Storyboard, Character, Scene } from '@/types/drama'
import TableToolbar from './TableToolbar.vue'
import StoryboardTableRow from './StoryboardTableRow.vue'

const props = defineProps<{
  storyboards: Storyboard[]
  characters: Character[]
  scenes: Scene[]
  selectedIds: Set<string>
  allSelected: boolean
  hasSelection: boolean
  progress: {
    total: number
    withImage: number
    withVideo: number
    generating: number
    totalDuration: number
  }
  running?: boolean
  runningType?: string | null
}>()

const emit = defineEmits<{
  toggleSelect: [id: string]
  toggleSelectAll: []
  clearSelection: []
  saveField: [id: string, field: string, value: any]
  generateImage: [id: string]
  generateVideo: [id: string]
  add: []
  batchImages: []
  batchVideos: []
  generateGrid: []
  breakdown: []
}>()

const durationDisplay = computed(() => {
  const secs = props.progress.totalDuration
  const min = Math.floor(secs / 60)
  const sec = secs % 60
  return `${min}:${String(sec).padStart(2, '0')}`
})
</script>

<template>
  <div class="storyboard-table-root">
    <template v-if="storyboards.length > 0">
      <TableToolbar
        :total="progress.total"
        :with-image="progress.withImage"
        :with-video="progress.withVideo"
        :generating="progress.generating"
        :has-selection="hasSelection"
        :selection-count="selectedIds.size"
        @add="emit('add')"
        @batch-images="emit('batchImages')"
        @batch-videos="emit('batchVideos')"
        @generate-grid="emit('generateGrid')"
        @clear-selection="emit('clearSelection')"
      />

      <div class="table-scroll">
        <table class="sb-table">
          <thead>
            <tr class="table-header">
              <th class="th th--checkbox">
                <Checkbox :checked="allSelected" @update:checked="emit('toggleSelectAll')" />
              </th>
              <th class="th th--seq">#</th>
              <th class="th th--thumb">缩略图</th>
              <th class="th">场景</th>
              <th class="th">景别</th>
              <th class="th">描述</th>
              <th class="th">视频提示词</th>
              <th class="th">角色</th>
              <th class="th">对白</th>
              <th class="th">状态</th>
              <th class="th th--actions">操作</th>
            </tr>
          </thead>
          <tbody>
            <StoryboardTableRow
              v-for="(sb, idx) in storyboards"
              :key="sb.id"
              :storyboard="sb"
              :index="idx"
              :selected="selectedIds.has(sb.id)"
              :characters="characters"
              :scenes="scenes"
              @toggle-select="emit('toggleSelect', $event)"
              @save-field="(id: string, field: string, value: any) => emit('saveField', id, field, value)"
              @generate-image="emit('generateImage', $event)"
              @generate-video="emit('generateVideo', $event)"
            />
          </tbody>
        </table>
      </div>

      <!-- Status bar -->
      <div class="status-bar">
        <span>共 {{ progress.total }} 镜头</span>
        <span class="status-sep">|</span>
        <span>有图 {{ progress.withImage }}</span>
        <span class="status-sep">|</span>
        <span>有视频 {{ progress.withVideo }}</span>
        <span class="status-sep">|</span>
        <span>预计 {{ durationDisplay }}</span>
      </div>
    </template>

    <!-- Empty state -->
    <div v-else class="table-empty">
      <Wand2 :size="32" class="table-empty__icon" />
      <p class="table-empty__text">暂无分镜</p>
      <p class="table-empty__hint">请先在「剧本」页完成改写和角色场景提取，然后拆解分镜</p>
      <Button variant="outline" size="sm" :disabled="running" @click="emit('breakdown')">
        <Loader2 v-if="runningType === 'storyboard_breaker'" :size="14" class="animate-spin" />
        <Wand2 v-else :size="14" />
        {{ runningType === 'storyboard_breaker' ? '拆解中...' : 'Agent 拆解分镜' }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.storyboard-table-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.table-scroll {
  flex: 1;
  overflow: auto;
}

.sb-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: auto;
}

.table-header {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--bg-card, rgba(255, 255, 255, 0.04));
  border-bottom: 1px solid var(--border-primary, rgba(255, 255, 255, 0.08));
}

.th {
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-align: left;
  white-space: nowrap;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.th--checkbox {
  width: 32px;
  text-align: center;
}

.th--seq {
  width: 52px;
}

.th--thumb {
  width: 168px;
}

.th--actions {
  width: 72px;
}

/* Status bar */
.status-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-top: 1px solid var(--border-primary, rgba(255, 255, 255, 0.06));
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-card);
}

.status-sep {
  color: var(--border-primary);
}

/* Empty state */
.table-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.table-empty__icon {
  color: var(--text-muted);
}

.table-empty__text {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

.table-empty__hint {
  font-size: 12px;
  color: var(--text-muted);
  margin: 0;
}
</style>
