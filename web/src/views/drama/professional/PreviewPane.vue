<template>
  <div class="preview-area-v2">
    <template v-if="currentStoryboard">
      <!-- 主预览区 -->
      <div class="media-section">
        <video
          v-if="activePreviewVideo"
          :src="activePreviewVideo"
          class="preview-media"
          controls
          preload="metadata"
        />
        <img
          v-else-if="activePreviewUrl"
          :src="activePreviewUrl"
          class="preview-media"
          :alt="$t('professionalEditor.currentPreviewAlt')"
        />
        <div v-else class="preview-placeholder">
          <el-icon :size="36"><Picture /></el-icon>
          <p>{{ $t('professionalEditor.noPreview') }}</p>
        </div>
        <!-- 镜头信息浮层 -->
        <div class="preview-info-overlay">
          <span class="tag-shot-num">#{{ currentStoryboard.storyboard_number }}</span>
          <span class="tag-title">{{ currentStoryboard.title || $t('storyboard.untitled') }}</span>
          <span class="tag-duration" v-if="currentStoryboard.duration">{{ currentStoryboard.duration }}s</span>
        </div>
      </div>

      <!-- 双行结果轨 -->
      <div class="results-strip">
        <!-- 图片行 -->
        <div class="results-row">
          <span class="results-row-label">🖼️</span>
          <div class="results-scroll">
            <div
              v-for="img in (generatedImages || [])"
              :key="img.id"
              class="result-thumb result-thumb--image"
              :class="{ 'result-thumb--active': selectedImage?.id === img.id }"
              @click="selectedImage = img; selectedVideo = null"
            >
              <img v-if="hasImage(img)" :src="getImageUrl(img)" />
              <div v-else class="result-thumb-placeholder">
                <el-icon :size="12"><Picture /></el-icon>
              </div>
              <span class="result-thumb-badge" v-if="img.frame_type">{{ img.frame_type }}</span>
            </div>
            <div v-if="!generatedImages?.length" class="results-empty">{{ $t('professionalEditor.noImageGenerated') }}</div>
          </div>
        </div>

        <!-- 视频行 -->
        <div class="results-row">
          <span class="results-row-label">🎬</span>
          <div class="results-scroll">
            <div
              v-for="vid in (generatedVideos || [])"
              :key="vid.id"
              class="result-thumb result-thumb--video"
              :class="{ 'result-thumb--active': selectedVideo?.id === vid.id }"
              @click="selectedVideo = vid; selectedImage = null; vid.video_url && onPlayVideo?.(vid)"
            >
              <video v-if="vid.video_url" :src="getVideoUrl(vid)" preload="metadata" class="result-thumb-video" />
              <div v-else class="result-thumb-placeholder">
                <el-icon :size="12"><VideoCamera /></el-icon>
              </div>
              <span class="result-thumb-play" v-if="vid.video_url">▶</span>
              <span class="result-thumb-status" :class="'status-' + vid.status"></span>
            </div>
            <div v-if="!generatedVideos?.length" class="results-empty">{{ $t('professionalEditor.noVideoGenerated') }}</div>
          </div>
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
import { ref, computed, watch } from 'vue'
import { Picture, VideoCamera } from '@element-plus/icons-vue'
import type { Storyboard } from '@/types/drama'
import { getImageUrl, getVideoUrl, hasImage } from '@/utils/image'

const props = defineProps<{
  currentStoryboard: Storyboard | null
  currentPreviewUrl: string | null
  currentPreviewVideo: string | null
  generatedImages?: any[]
  generatedVideos?: any[]
  onPlayVideo?: (video: any) => void
}>()

// 用户点击结果条时选中的 item，null = 使用父组件传入的 currentPreviewUrl/Video
const selectedImage = ref<any | null>(null)
const selectedVideo = ref<any | null>(null)

// 切换分镜时清除选中
watch(() => props.currentStoryboard?.id, () => {
  selectedImage.value = null
  selectedVideo.value = null
})

const activePreviewUrl = computed(() =>
  selectedImage.value
    ? getImageUrl(selectedImage.value)
    : props.currentPreviewUrl
)

const activePreviewVideo = computed(() =>
  selectedVideo.value?.video_url
    ? getVideoUrl(selectedVideo.value)
    : props.currentPreviewVideo
)
</script>

<style scoped lang="scss">
.preview-area-v2 {
  width: 100%;
  min-width: 0;
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

/* 双行结果轨容器 */
.results-strip {
  flex-shrink: 0;
  border-top: 1px solid var(--glass-stroke-base);
  background: var(--glass-bg-canvas);
  display: flex;
  flex-direction: column;
}

/* 单行（图片 or 视频） */
.results-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  height: 72px;
  border-bottom: 1px solid var(--glass-stroke-base);

  &:last-child { border-bottom: none; }
}

.results-row-label {
  font-size: 13px;
  flex-shrink: 0;
  width: 18px;
  text-align: center;
}

.results-scroll {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  flex: 1;
  align-items: center;
  padding-bottom: 2px;

  &::-webkit-scrollbar { height: 3px; }
  &::-webkit-scrollbar-thumb { background: var(--glass-stroke-base); border-radius: 2px; }
}

/* 缩略图卡片 */
.result-thumb {
  flex-shrink: 0;
  width: 88px;
  height: 56px;
  border-radius: 5px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  border: 1.5px solid transparent;
  background: #111;
  transition: border-color 100ms;

  img, .result-thumb-video {
    width: 100%; height: 100%; object-fit: cover; display: block;
  }

  &:hover { border-color: var(--glass-stroke-strong); }

  &.result-thumb--active {
    border-color: var(--accent, #e8a243);
    box-shadow: 0 0 0 1px var(--accent, #e8a243);
  }
}

.result-thumb-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  color: var(--glass-text-tertiary);
}

.result-thumb-badge {
  position: absolute;
  bottom: 2px; left: 3px;
  font-size: 9px;
  background: rgba(0,0,0,.65);
  color: #fff;
  padding: 1px 4px;
  border-radius: 3px;
}

.result-thumb-play {
  position: absolute;
  inset: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px;
  color: rgba(255,255,255,0.85);
  text-shadow: 0 1px 4px rgba(0,0,0,.6);
}

.result-thumb-status {
  position: absolute;
  top: 3px; right: 3px;
  width: 7px; height: 7px;
  border-radius: 50%;

  &.status-completed { background: var(--glass-tone-success-fg, #22c55e); }
  &.status-pending, &.status-processing {
    background: var(--accent, #e8a243);
    animation: pulse-dot 1s ease-in-out infinite;
  }
  &.status-failed { background: #ef4444; }
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.results-empty {
  font-size: 11px;
  color: var(--glass-text-tertiary);
  white-space: nowrap;
  padding: 0 4px;
}
</style>
