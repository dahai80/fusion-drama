<template>
  <div class="generation-tab">
    <!-- ── 图片生成 ── -->
    <div class="section-title">图片生成</div>
    <div class="field-group">
      <div class="field-label">{{ $t('editor.selectFrameType') }}</div>
      <el-radio-group v-model="imageGen.selectedFrameType.value" size="small">
        <el-radio-button value="first">{{ $t('editor.firstFrame') }}</el-radio-button>
        <el-radio-button value="last">{{ $t('editor.lastFrame') }}</el-radio-button>
        <el-radio-button value="action">{{ $t('editor.actionSequence') }}</el-radio-button>
        <el-radio-button value="key">{{ $t('editor.keyFrame') }}</el-radio-button>
      </el-radio-group>
    </div>
    <div class="field-group">
      <div class="field-label">
        {{ $t('editor.prompt') }}
        <el-button
          size="small" type="primary"
          :disabled="imageGen.isGeneratingPrompt(currentStoryboard?.id, imageGen.selectedFrameType.value)"
          :loading="imageGen.isGeneratingPrompt(currentStoryboard?.id, imageGen.selectedFrameType.value)"
          @click="imageGen.extractFramePrompt()"
          style="margin-left: 8px"
        >{{ $t('editor.extractPrompt') }}</el-button>
      </div>
      <el-input v-model="imageGen.currentFramePrompt.value" type="textarea" :rows="5" :placeholder="$t('editor.promptPlaceholder')" />
    </div>
    <div class="gen-controls-v2">
      <el-button
        type="success" :icon="MagicStick" :loading="imageGen.generatingImage.value"
        :disabled="!imageGen.currentFramePrompt.value"
        @click="$emit('generate-image')"
      >{{ imageGen.generatingImage.value ? $t('editor.generating') : $t('editor.generateImage') }}</el-button>
      <el-button :icon="Upload" @click="imageGen.uploadImage()">{{ $t('editor.uploadImage') }}</el-button>
    </div>
    <!-- 生成结果 -->
    <div v-if="imageGen.generatedImages.value.length > 0 || imageGen.selectedFrameType.value === 'action'" class="field-group" style="margin-top:4px">
      <div class="field-label">{{ $t('editor.generationResult') }} ({{ imageGen.generatedImages.value.length }})</div>
      <div class="result-grid">
        <div v-if="imageGen.selectedFrameType.value === 'action'" class="result-item grid-entry" @click="imageGen.showGridEditor.value = true">
          <el-icon :size="24" color="#ccc"><Plus /></el-icon>
        </div>
        <div v-for="img in imageGen.generatedImages.value" :key="img.id" class="result-item">
          <el-image
            v-if="hasImage(img)"
            :src="getImageUrl(img)"
            fit="cover"
            :preview-src-list="imageGen.generatedImages.value.filter(i => hasImage(i)).map(i => getImageUrl(i))"
            preview-teleported
          />
          <div v-else class="result-placeholder">
            <el-icon :size="20"><Picture /></el-icon>
            <p>{{ imageGen.getStatusText(img.status) }}</p>
          </div>
          <div class="result-actions" v-if="hasImage(img)">
            <div v-if="img.frame_type === 'action'" class="result-action-btn" @click.stop="imageGen.openCropDialog(img)">
              <el-icon :size="13" color="white"><Crop /></el-icon>
            </div>
            <div class="result-action-btn" @click.stop="imageGen.handleDeleteImage(img)">
              <el-icon :size="13" color="#f56c6c"><DeleteFilled /></el-icon>
            </div>
          </div>
        </div>
      </div>
    </div>

    <el-divider />

    <!-- ── 视频生成 ── -->
    <div class="section-title">视频生成</div>
    <div class="field-group">
      <div class="field-label">视频提示词</div>
      <div class="video-prompt-display">{{ currentStoryboard?.video_prompt || '暂无提示词' }}</div>
    </div>
    <div class="field-group">
      <div class="field-label">{{ $t('video.model') }}</div>
      <el-select v-model="videoGen.selectedVideoModel.value" :placeholder="$t('video.selectVideoModel')" size="small" style="width:100%">
        <el-option v-for="model in videoGen.videoModelCapabilities.value" :key="model.id" :label="model.name" :value="model.id">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span>{{ model.name }}</span>
            <div style="display:flex;gap:4px">
              <el-tag v-if="model.supportMultipleImages" size="small" type="success">多图</el-tag>
              <el-tag v-if="model.supportFirstLastFrame" size="small" type="primary">首尾帧</el-tag>
            </div>
          </div>
        </el-option>
      </el-select>
    </div>
    <div class="field-group" v-if="videoGen.selectedVideoModel.value && videoGen.availableReferenceModes.value.length > 0">
      <div class="field-label">参考图模式</div>
      <el-select v-model="videoGen.selectedReferenceMode.value" size="small" style="width:100%">
        <el-option v-for="mode in videoGen.availableReferenceModes.value" :key="mode.value" :label="mode.label" :value="mode.value" />
      </el-select>
    </div>
    <div class="field-group">
      <div class="field-label">{{ $t('professionalEditor.duration') }}</div>
      <div style="display:flex;align-items:center;gap:8px">
        <el-slider v-model="videoGen.videoDuration.value" :min="4" :max="10" :step="1" show-stops style="flex:1" />
        <span style="min-width:32px;font-size:12px;color:#606266">{{ videoGen.videoDuration.value }}{{ $t('professionalEditor.seconds') }}</span>
      </div>
    </div>
    <!-- 参考图选择 -->
    <div class="field-group" v-if="videoGen.selectedReferenceMode.value && videoGen.selectedReferenceMode.value !== 'none'">
      <div class="field-label">选择参考图</div>
      <el-radio-group v-model="videoGen.selectedVideoFrameType.value" size="small">
        <el-radio-button value="first">首帧</el-radio-button>
        <el-radio-button value="last">尾帧</el-radio-button>
        <el-radio-button value="action">动作序列</el-radio-button>
        <el-radio-button value="key">关键帧</el-radio-button>
      </el-radio-group>
      <div class="ref-image-grid">
        <div
          v-for="img in imageGen.videoReferenceImages.value.filter(i => i.status === 'completed' && i.image_url && i.frame_type === videoGen.selectedVideoFrameType.value)"
          :key="img.id"
          class="ref-image-item"
          :class="{ selected: videoGen.selectedImagesForVideo.value.includes(img.id) }"
          @click="videoGen.handleImageSelect(img.id)"
        >
          <el-image :src="getImageUrl(img)" fit="cover" style="width:100%;height:100%;pointer-events:none" />
          <div class="ref-selected-mark" v-if="videoGen.selectedImagesForVideo.value.includes(img.id)">✓</div>
        </div>
        <el-empty
          v-if="!imageGen.videoReferenceImages.value.some(i => i.status==='completed' && i.image_url && i.frame_type===videoGen.selectedVideoFrameType.value)"
          description="暂无图片" :image-size="40"
        />
      </div>
      <!-- 首尾帧模式预览框 -->
      <div v-if="videoGen.selectedReferenceMode.value === 'first_last'" class="frame-slots-row">
        <div class="frame-slot">
          <div class="frame-slot-label">首帧</div>
          <div class="image-slot-mini" @click="videoGen.firstFrameSlotImage.value && videoGen.removeSelectedImage(videoGen.firstFrameSlotImage.value.id)">
            <img v-if="videoGen.firstFrameSlotImage.value" :src="videoGen.firstFrameSlotImage.value.image_url" />
            <el-icon v-else><Plus /></el-icon>
          </div>
        </div>
        <span style="color:#c0c4cc;font-size:18px">→</span>
        <div class="frame-slot">
          <div class="frame-slot-label">尾帧</div>
          <div class="image-slot-mini" @click="videoGen.lastFrameSlotImage.value && videoGen.removeSelectedImage(videoGen.lastFrameSlotImage.value.id)">
            <img v-if="videoGen.lastFrameSlotImage.value" :src="videoGen.lastFrameSlotImage.value.image_url" />
            <el-icon v-else><Plus /></el-icon>
          </div>
        </div>
      </div>
    </div>
    <!-- 生成按钮 -->
    <div class="gen-controls-v2">
      <el-button
        type="primary" :icon="VideoCamera" :loading="videoGen.generatingVideo.value"
        :disabled="!videoGen.selectedVideoModel.value || (videoGen.selectedReferenceMode.value !== 'none' && videoGen.selectedImagesForVideo.value.length === 0)"
        @click="videoGen.generateVideo()"
      >{{ videoGen.generatingVideo.value ? '生成中...' : '生成视频' }}</el-button>
    </div>
    <!-- 视频结果 -->
    <div class="result-grid" v-if="videoGen.generatedVideos.value.length > 0" style="margin-top:8px">
      <div v-for="video in videoGen.generatedVideos.value" :key="video.id" class="result-item video-result-item">
        <div v-if="video.video_url" class="video-thumb-v2" @click="videoGen.playVideo(video)">
          <video :src="getVideoUrl(video)" preload="metadata" />
          <div class="play-overlay-v2"><el-icon :size="28" color="#fff"><VideoPlay /></el-icon></div>
        </div>
        <div v-else class="result-placeholder">
          <el-icon :size="20"><VideoCamera /></el-icon>
          <p>{{ imageGen.getStatusText(video.status) }}</p>
        </div>
        <div class="result-actions" v-if="video.video_url">
          <div class="result-action-btn" @click.stop="videoGen.addVideoToAssets(video)">
            <el-icon :size="13" color="white"><FolderAdd /></el-icon>
          </div>
          <div class="result-action-btn" @click.stop="videoGen.handleDeleteVideo(video)">
            <el-icon :size="13" color="#f56c6c"><DeleteFilled /></el-icon>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  Plus, Picture, MagicStick, Upload, VideoCamera, VideoPlay,
  Crop, DeleteFilled, FolderAdd,
} from '@element-plus/icons-vue'
import type { Storyboard } from '@/types/drama'
import type { useFrameImageGeneration } from '@/composables/useFrameImageGeneration'
import type { useVideoGenerationPro } from '@/composables/useVideoGenerationPro'
import { getImageUrl, hasImage, getVideoUrl } from '@/utils/image'

defineProps<{
  currentStoryboard: Storyboard | null
  imageGen: ReturnType<typeof useFrameImageGeneration>
  videoGen: ReturnType<typeof useVideoGenerationPro>
}>()

defineEmits<{
  'generate-image': []
}>()
</script>

<style scoped lang="scss">
.generation-tab {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #303133);
  padding: 4px 0;
}

.field-group {
  display: flex; flex-direction: column; gap: 5px;
}

.field-label {
  font-size: 12px; font-weight: 500;
  color: var(--text-secondary, #606266);
  display: flex; align-items: center; gap: 6px;
}

.gen-controls-v2 {
  display: flex; gap: 7px; flex-wrap: wrap;
}

.result-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 7px;
}

.result-item {
  position: relative;
  aspect-ratio: 16/9;
  border-radius: 5px;
  overflow: hidden;
  background: #f0f0f0;
  cursor: pointer;

  .el-image { width: 100%; height: 100%; }

  &.grid-entry {
    border: 2px dashed #dcdfe6;
    display: flex; align-items: center; justify-content: center;
    &:hover { border-color: #409eff; }
  }

  .result-placeholder {
    width: 100%; height: 100%;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 4px; color: #909399; font-size: 11px;
    p { margin: 0; }
  }

  .result-actions {
    position: absolute; top: 3px; right: 3px;
    display: flex; gap: 3px;
    opacity: 0; transition: opacity 0.15s;
  }
  &:hover .result-actions { opacity: 1; }

  .result-action-btn {
    width: 22px; height: 22px;
    background: rgba(0,0,0,.65); border-radius: 3px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    &:hover { background: rgba(0,0,0,.85); }
  }
}

.video-result-item {
  .video-thumb-v2 {
    width: 100%; height: 100%; position: relative;
    video { width: 100%; height: 100%; object-fit: cover; }
    .play-overlay-v2 {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,.3); opacity: 0; transition: opacity 0.15s;
    }
    &:hover .play-overlay-v2 { opacity: 1; }
  }
}

.video-prompt-display {
  font-size: 12px; color: #606266;
  background: #fafafa; border: 1px solid #e4e7ed;
  border-radius: 5px; padding: 7px 9px;
  line-height: 1.6; max-height: 80px; overflow-y: auto;
}

/* 参考图 */
.ref-image-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 5px; margin-top: 5px;
  max-height: 180px; overflow-y: auto;
}
.ref-image-item {
  position: relative; aspect-ratio: 16/9;
  border-radius: 3px; overflow: hidden;
  border: 2px solid transparent; cursor: pointer;
  background: #f0f0f0;
  &.selected { border-color: #409eff; }
  .ref-selected-mark {
    position: absolute; top: 2px; right: 2px;
    background: #52c41a; color: #fff;
    font-size: 9px; padding: 0 3px; border-radius: 2px;
  }
}

.frame-slots-row {
  display: flex; align-items: center; gap: 8px; margin-top: 6px;
}
.frame-slot {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  .frame-slot-label { font-size: 11px; color: #909399; }
}
.image-slot-mini {
  width: 60px; height: 38px;
  border: 2px dashed #dcdfe6; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; cursor: pointer;
  background: #fafafa;
  img { width: 100%; height: 100%; object-fit: cover; }
}
</style>
