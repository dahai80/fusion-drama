<template>
  <div class="preview-area-v2">
    <template v-if="currentStoryboard">
      <!-- 媒体预览区（上方，限制高度） -->
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
          <el-icon :size="36" color="#444"><Picture /></el-icon>
          <p>{{ $t('professionalEditor.noPreview') }}</p>
        </div>
        <!-- 镜头信息浮层 -->
        <div class="preview-info-overlay">
          <span class="tag-shot-num">#{{ currentStoryboard.storyboard_number }}</span>
          <span class="tag-title">{{ currentStoryboard.title || $t('storyboard.untitled') }}</span>
          <span class="tag-duration" v-if="currentStoryboard.duration">{{ currentStoryboard.duration }}s</span>
        </div>
      </div>

      <!-- 剧本内容区（下方，可滚动） -->
      <div class="script-section">
        <div class="script-block" v-if="currentStoryboard.action">
          <div class="script-label">{{ $t('editor.action') }}</div>
          <p class="script-text">{{ currentStoryboard.action }}</p>
        </div>
        <div class="script-block" v-if="currentStoryboard.dialogue">
          <div class="script-label">{{ $t('editor.dialogue') }}</div>
          <p class="script-text dialogue">{{ currentStoryboard.dialogue }}</p>
        </div>
        <div class="script-block" v-if="currentStoryboard.result">
          <div class="script-label">{{ $t('editor.result') }}</div>
          <p class="script-text muted">{{ currentStoryboard.result }}</p>
        </div>
        <div class="script-block" v-if="currentStoryboard.description">
          <div class="script-label">{{ $t('editor.description') }}</div>
          <p class="script-text muted">{{ currentStoryboard.description }}</p>
        </div>
        <div class="script-empty" v-if="!currentStoryboard.action && !currentStoryboard.dialogue && !currentStoryboard.result && !currentStoryboard.description">
          <el-icon :size="20" color="#555"><Document /></el-icon>
          <p>{{ $t('professionalEditor.noScriptContent') }}</p>
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
import { Picture, Document } from '@element-plus/icons-vue'
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
  background: var(--bg-primary, #f5f7fa);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 媒体区 */
.media-section {
  position: relative;
  background: #000;
  flex-shrink: 0;
  height: 45%;
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

/* 剧本内容区 */
.script-section {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb {
    background: var(--border-primary, #e4e7ed);
    border-radius: 2px;
  }
}

.script-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.script-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted, #9ca3af);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.script-text {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary, #111827);
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;

  &.dialogue {
    color: var(--accent, #e8a243);
    font-style: italic;
  }

  &.muted {
    color: var(--text-secondary, #6b7280);
    font-size: 12px;
  }
}

.script-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted, #9ca3af);
  p { font-size: 12px; margin: 0; }
}
</style>
