<template>
  <div class="preview-area-v2">
    <template v-if="currentStoryboard">
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
        alt="当前分镜预览"
      />
      <div v-else class="preview-placeholder">
        <el-icon :size="48" color="#444"><Picture /></el-icon>
        <p>暂无预览图，请先生成图片</p>
      </div>
      <div class="preview-info-overlay">
        <span class="preview-shot-num">#{{ currentStoryboard.storyboard_number }}</span>
        <span class="preview-shot-title">{{ currentStoryboard.title || $t('storyboard.untitled') }}</span>
        <span class="preview-shot-duration">{{ currentStoryboard.duration }}s</span>
      </div>
    </template>
    <div v-else class="preview-placeholder">
      <el-icon :size="48" color="#444"><Picture /></el-icon>
      <p>请从左侧选择分镜</p>
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
  min-height: 80px;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;

  .preview-media {
    max-width: 100%; max-height: 100%;
    object-fit: contain; display: block;
  }
  .preview-placeholder {
    display: flex; flex-direction: column;
    align-items: center; gap: 10px; color: #555;
    p { font-size: 13px; margin: 0; }
  }
  .preview-info-overlay {
    position: absolute; bottom: 8px; left: 8px;
    display: flex; gap: 6px; align-items: center;
    .preview-shot-num {
      background: rgba(0,0,0,.7); color: #fff;
      font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 600;
    }
    .preview-shot-title { color: rgba(255,255,255,.8); font-size: 12px; }
    .preview-shot-duration {
      background: rgba(64,158,255,.8); color: #fff;
      font-size: 11px; padding: 2px 6px; border-radius: 4px;
    }
  }
}
</style>
