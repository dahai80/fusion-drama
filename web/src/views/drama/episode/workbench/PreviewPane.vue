<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { ImageIcon, Play } from 'lucide-vue-next'
import type { Storyboard } from '@/types/drama'
import type { ImageGeneration } from '@/types/image'
import { getImageUrl, getVideoUrl } from '@/utils/image'

const props = defineProps<{
  storyboard: Storyboard | null
  images: ImageGeneration[]
  videoUrl: string | null
}>()

// Track which gallery image is selected; null = use storyboard's main image
const selectedImageId = ref<number | null>(null)
const showVideo = ref(false)

// Reset selection when storyboard changes
watch(() => props.storyboard?.id, () => {
  selectedImageId.value = null
  showVideo.value = false
})

const mainImageUrl = computed(() => {
  if (selectedImageId.value !== null) {
    const img = props.images.find(i => i.id === selectedImageId.value)
    if (img) return getImageUrl(img)
  }
  return getImageUrl(props.storyboard)
})

function selectImage(img: ImageGeneration) {
  selectedImageId.value = img.id
  showVideo.value = false
}

function toggleVideo() {
  if (props.videoUrl) {
    showVideo.value = true
    selectedImageId.value = null
  }
}
</script>

<template>
  <div class="preview-root">
    <template v-if="storyboard">
      <!-- Main media area -->
      <div class="preview-main">
        <video
          v-if="showVideo && videoUrl"
          :src="videoUrl"
          class="preview-media"
          controls
          autoplay
        />
        <img
          v-else-if="mainImageUrl"
          :src="mainImageUrl"
          class="preview-media"
          :alt="storyboard.title || '预览'"
        />
        <div v-else class="preview-empty">
          <ImageIcon :size="36" class="preview-empty__icon" />
          <p class="preview-empty__text">暂无图片，请先生成</p>
        </div>

        <!-- Info overlay -->
        <div v-if="mainImageUrl || (showVideo && videoUrl)" class="preview-overlay">
          <span class="overlay-tag">#{{ storyboard.storyboard_number }}</span>
          <span v-if="storyboard.title" class="overlay-title">{{ storyboard.title }}</span>
          <span v-if="storyboard.duration" class="overlay-duration">{{ storyboard.duration }}s</span>
        </div>
      </div>

      <!-- Gallery row -->
      <div class="gallery-row" v-if="images.length > 0 || videoUrl">
        <!-- Image thumbnails -->
        <div
          v-for="img in images"
          :key="img.id"
          class="gallery-thumb"
          :class="{ 'gallery-thumb--active': !showVideo && selectedImageId === img.id }"
          @click="selectImage(img)"
        >
          <img v-if="getImageUrl(img)" :src="getImageUrl(img)" class="gallery-thumb__img" />
          <div v-else class="gallery-thumb__placeholder">
            <ImageIcon :size="10" />
          </div>
        </div>

        <!-- Video thumbnail -->
        <div
          v-if="videoUrl"
          class="gallery-thumb gallery-thumb--video"
          :class="{ 'gallery-thumb--active': showVideo }"
          @click="toggleVideo"
        >
          <Play :size="14" class="gallery-thumb__play" />
        </div>
      </div>
    </template>

    <!-- No storyboard selected -->
    <div v-else class="preview-empty preview-empty--full">
      <ImageIcon :size="48" class="preview-empty__icon" />
      <p class="preview-empty__text">选择分镜以预览</p>
    </div>
  </div>
</template>

<style scoped>
.preview-root {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #0a0a0a;
  overflow: hidden;
}

/* Main media */
.preview-main {
  flex: 1;
  min-height: 0;
  position: relative;
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

.preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted, rgba(255, 255, 255, 0.3));
}

.preview-empty--full {
  flex: 1;
}

.preview-empty__icon {
  opacity: 0.5;
}

.preview-empty__text {
  font-size: 12px;
  margin: 0;
}

/* Overlay */
.preview-overlay {
  position: absolute;
  bottom: 6px;
  left: 6px;
  display: flex;
  gap: 5px;
  align-items: center;
}

.overlay-tag {
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.overlay-title {
  color: rgba(255, 255, 255, 0.85);
  font-size: 11px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.overlay-duration {
  background: rgba(64, 158, 255, 0.8);
  color: #fff;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
}

/* Gallery row */
.gallery-row {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  overflow-x: auto;
  border-top: 1px solid var(--border-primary, rgba(255, 255, 255, 0.06));
  background: var(--bg-secondary, rgba(0, 0, 0, 0.15));
}

.gallery-row::-webkit-scrollbar {
  height: 3px;
}

.gallery-row::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.gallery-thumb {
  flex-shrink: 0;
  width: 72px;
  height: 46px;
  border-radius: 5px;
  overflow: hidden;
  cursor: pointer;
  border: 1.5px solid transparent;
  background: #111;
  transition: border-color 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gallery-thumb:hover {
  border-color: rgba(255, 255, 255, 0.2);
}

.gallery-thumb--active {
  border-color: var(--accent, #e8a243);
  box-shadow: 0 0 0 1px var(--accent, #e8a243);
}

.gallery-thumb__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.gallery-thumb__placeholder {
  color: var(--text-muted, rgba(255, 255, 255, 0.25));
}

.gallery-thumb--video {
  background: rgba(96, 165, 250, 0.1);
}

.gallery-thumb__play {
  color: rgba(96, 165, 250, 0.8);
}
</style>
