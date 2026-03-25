<script setup lang="ts">
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import type { Storyboard } from '@/types/drama'
import { getImageUrl } from '@/utils/image'

const props = defineProps<{
  storyboard: Storyboard
  index: number
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const hasImage = computed(() => !!props.storyboard.image_url || !!props.storyboard.local_path)
const hasVideo = computed(() => !!props.storyboard.video_url)
const isGenerating = computed(() =>
  props.storyboard.image_generation_status === 'processing' ||
  props.storyboard.image_generation_status === 'generating' ||
  props.storyboard.status === 'processing' ||
  props.storyboard.status === 'generating'
)

const thumbnailUrl = computed(() => getImageUrl(props.storyboard))

const borderClass = computed(() => {
  if (isGenerating.value) return 'card--generating'
  if (hasImage.value && hasVideo.value) return 'card--complete'
  if (hasImage.value) return 'card--has-image'
  return 'card--pending'
})

const statusText = computed(() => {
  if (isGenerating.value) return '生成中'
  if (hasImage.value && hasVideo.value) return '完成'
  if (hasImage.value) return '有图'
  return '待处理'
})
</script>

<template>
  <div
    class="storyboard-card"
    :class="borderClass"
    @click="emit('select', storyboard.id)"
  >
    <!-- Thumbnail area -->
    <div class="card-thumb">
      <img
        v-if="hasImage && thumbnailUrl"
        :src="thumbnailUrl"
        :alt="storyboard.title || `镜头 ${index + 1}`"
        class="card-thumb__img"
      />
      <div v-else-if="isGenerating" class="card-thumb__loader">
        <Loader2 :size="20" class="animate-spin" />
      </div>
      <div v-else class="card-thumb__placeholder">
        待生成
      </div>

      <!-- Number overlay top-left -->
      <span class="card-number">#{{ index + 1 }}</span>

      <!-- Status badge top-right -->
      <span class="card-status" :class="borderClass">
        <template v-if="hasImage && hasVideo">&#127916;&#10003;</template>
        <template v-else-if="isGenerating">
          <Loader2 :size="10" class="animate-spin" />
        </template>
        <template v-else>{{ statusText }}</template>
      </span>
    </div>

    <!-- Info area -->
    <div class="card-info">
      <div class="card-info__row">
        <span class="card-title">{{ storyboard.title || `镜头 ${index + 1}` }}</span>
        <span v-if="storyboard.location" class="card-sep">&middot;</span>
        <span v-if="storyboard.location" class="card-location">{{ storyboard.location }}</span>
      </div>
      <div class="card-info__row card-info__row--sub">
        <span v-if="storyboard.shot_type" class="card-meta">{{ storyboard.shot_type }}</span>
        <span v-if="storyboard.shot_type && storyboard.movement" class="card-sep">&middot;</span>
        <span v-if="storyboard.movement" class="card-meta">{{ storyboard.movement }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.storyboard-card {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius-md, 8px);
  border: 1.5px solid rgba(255, 255, 255, 0.08);
  background: var(--bg-card, rgba(255, 255, 255, 0.04));
  cursor: pointer;
  overflow: hidden;
  transition: all 0.2s ease;
}

.storyboard-card:hover {
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
  transform: translateY(-1px);
}

/* Border color variants */
.card--pending {
  border-color: rgba(255, 255, 255, 0.08);
}

.card--generating {
  border-color: rgba(96, 165, 250, 0.4);
}

.card--has-image {
  border-color: rgba(232, 162, 67, 0.3);
}

.card--complete {
  border-color: rgba(94, 230, 176, 0.3);
}

/* Thumbnail */
.card-thumb {
  position: relative;
  width: 100%;
  height: 80px;
  background: var(--bg-primary, rgba(0, 0, 0, 0.2));
  overflow: hidden;
}

.card-thumb__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.card-thumb__loader {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(96, 165, 250, 0.7);
}

.card-thumb__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 11px;
  color: var(--text-muted, rgba(255, 255, 255, 0.35));
}

/* Overlays */
.card-number {
  position: absolute;
  top: 4px;
  left: 4px;
  font-size: 10px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(0, 0, 0, 0.5);
  padding: 1px 5px;
  border-radius: 4px;
  line-height: 1.4;
}

.card-status {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 9px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 4px;
  line-height: 1.4;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.card-status.card--pending {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
}

.card-status.card--generating {
  background: rgba(96, 165, 250, 0.2);
  color: rgba(96, 165, 250, 0.9);
}

.card-status.card--has-image {
  background: rgba(232, 162, 67, 0.2);
  color: rgba(232, 162, 67, 0.9);
}

.card-status.card--complete {
  background: rgba(94, 230, 176, 0.2);
  color: rgba(94, 230, 176, 0.9);
}

/* Info */
.card-info {
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-info__row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}

.card-info__row--sub {
  font-size: 10px;
  color: var(--text-muted, rgba(255, 255, 255, 0.35));
}

.card-title {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-primary, rgba(255, 255, 255, 0.9));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-sep {
  color: var(--text-muted, rgba(255, 255, 255, 0.25));
  flex-shrink: 0;
}

.card-location {
  font-size: 10px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.55));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-meta {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
