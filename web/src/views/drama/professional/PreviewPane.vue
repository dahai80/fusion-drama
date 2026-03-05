<template>
  <div class="preview-area-v2">
    <template v-if="currentStoryboard">
      <!-- 媒体预览区（占满全高） -->
      <div class="media-section">
        <video
          v-if="currentPreviewVideo"
          :src="currentPreviewVideo"
          class="preview-media"
          controls
          preload="metadata"
        />
        <img
          v-else-if="currentPreviewUrl"
          :src="currentPreviewUrl"
          class="preview-media"
          :alt="$t('professionalEditor.currentPreviewAlt')"
        />
        <div v-else class="preview-placeholder">
          <el-icon :size="36"><Picture /></el-icon>
          <p>{{ $t('professionalEditor.noPreview') }}</p>
        </div>
        <!-- 镜头信息浮层（保留） -->
        <div class="preview-info-overlay">
          <span class="tag-shot-num">#{{ currentStoryboard.storyboard_number }}</span>
          <span class="tag-title">{{ currentStoryboard.title || $t('storyboard.untitled') }}</span>
          <span class="tag-duration" v-if="currentStoryboard.duration">{{ currentStoryboard.duration }}s</span>
        </div>
      </div>
    </template>

    <div v-else class="preview-placeholder full">
      <el-icon :size="48" color="#444"><Picture /></el-icon>
      <p>{{ $t('professionalEditor.selectStoryboard') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Picture } from '@element-plus/icons-vue'
import type { Storyboard } from '@/types/drama'

defineProps<{
  currentStoryboard: Storyboard | null
  currentPreviewUrl: string | null
  currentPreviewVideo: string | null
}>()
</script>

<style scoped lang="scss">
.preview-area-v2 {
  flex: 1;
  min-width: 300px;
  min-height: 80px;
  background: var(--bg-primary, #f5f7fa);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 媒体区 */
.media-section {
  position: relative;
  background: #000;
  flex: 1;
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.preview-media {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #555;
  p { font-size: 12px; margin: 0; }

  &.full {
    flex: 1;
    justify-content: center;
    background: #000;
  }
}

/* 镜头信息浮层 */
.preview-info-overlay {
  position: absolute;
  bottom: 6px;
  left: 6px;
  display: flex;
  gap: 5px;
  align-items: center;
}

.tag-shot-num {
  background: rgba(0,0,0,.75);
  color: #fff;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.tag-title {
  color: rgba(255,255,255,.85);
  font-size: 11px;
  text-shadow: 0 1px 3px rgba(0,0,0,.8);
}

.tag-duration {
  background: rgba(64,158,255,.8);
  color: #fff;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

</style>
