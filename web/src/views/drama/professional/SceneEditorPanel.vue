<template>
  <div class="scene-editor-panel">

    <!-- ===== 顶部分镜导航（固定） ===== -->
    <div class="panel-nav">
      <button class="nav-btn" type="button" :disabled="isFirst" @click="$emit('prev-scene')">
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <span class="scene-title" v-if="currentStoryboard">
        #{{ currentStoryboard.storyboard_number || currentStoryboard.id }}
        {{ currentStoryboard.title || $t('storyboard.untitled') }}
      </span>
      <span class="scene-title" v-else>{{ $t('storyboard.selectStoryboard') }}</span>
      <button class="nav-btn" type="button" :disabled="isLast" @click="$emit('next-scene')">
        <el-icon><ArrowRight /></el-icon>
      </button>
    </div>

    <!-- ===== 无选中分镜时的占位 ===== -->
    <div v-if="!currentStoryboard" class="panel-empty">
      <el-icon :size="40" color="#c0c4cc"><Edit /></el-icon>
      <p>{{ $t('professionalEditor.selectStoryboard') }}</p>
    </div>

    <template v-else>
      <!-- ===== 可滚动区域 ===== -->
      <div class="panel-scroll">

        <!-- Section 1: 场景要素 -->
        <PanelSection :title="$t('professionalEditor.sectionSceneElements')" icon="🎬" :default-open="true">
          <!-- 场景 -->
          <div class="field-group">
            <div class="field-label">
              {{ $t('storyboard.scene') }}
              <el-button size="small" text @click="$emit('show-scene-selector')">{{ $t('storyboard.selectScene') }}</el-button>
            </div>
            <div class="scene-preview-v2" v-if="hasImage(currentStoryboard.background)" @click="$emit('show-scene-image')">
              <img :src="getImageUrl(currentStoryboard.background)" :alt="$t('storyboard.scene')" />
              <div class="scene-info-overlay">
                {{ currentStoryboard.background?.location }} · {{ currentStoryboard.background?.time }}
              </div>
            </div>
            <div class="scene-preview-empty-v2" v-else>
              <el-icon :size="24" color="#ccc"><Picture /></el-icon>
              <span>{{ currentStoryboard.background ? $t('editor.sceneGenerating') : $t('editor.noBackground') }}</span>
            </div>
          </div>
          <!-- 角色 -->
          <div class="field-group">
            <div class="field-label">
              {{ $t('editor.cast') }}
              <el-button size="small" text :icon="Plus" @click="$emit('show-character-selector')">{{ $t('editor.addCharacter') }}</el-button>
            </div>
            <div class="cast-row">
              <div v-for="char in currentStoryboardCharacters" :key="char.id" class="cast-chip">
                <div class="cast-chip-avatar" @click="$emit('show-character-image', char)">
                  <img v-if="hasImage(char)" :src="getImageUrl(char)" :alt="char.name" />
                  <span v-else>{{ char.name?.[0] || '?' }}</span>
                </div>
                <span class="cast-chip-name">{{ char.name }}</span>
                <el-icon class="cast-chip-remove" @click.stop="$emit('toggle-character', char.id)"><Close /></el-icon>
              </div>
              <div v-if="!currentStoryboardCharacters.length" class="cast-empty-hint">{{ $t('editor.noCharacters') }}</div>
            </div>
          </div>
          <!-- 道具 -->
          <div class="field-group">
            <div class="field-label">
              {{ $t('editor.props') }}
              <el-button size="small" text :icon="Plus" @click="$emit('show-prop-selector')">{{ $t('editor.addProp') }}</el-button>
            </div>
            <div class="cast-row">
              <div v-for="prop in currentStoryboardProps" :key="prop.id" class="cast-chip">
                <div class="cast-chip-avatar">
                  <img v-if="hasImage(prop)" :src="getImageUrl(prop)" :alt="prop.name" />
                  <el-icon v-else><Box /></el-icon>
                </div>
                <span class="cast-chip-name">{{ prop.name }}</span>
                <el-icon class="cast-chip-remove" @click.stop="$emit('toggle-prop', prop.id)"><Close /></el-icon>
              </div>
              <div v-if="!currentStoryboardProps?.length" class="cast-empty-hint">{{ $t('editor.noProps') }}</div>
            </div>
          </div>
        </PanelSection>

        <!-- Section 2: 镜头设置 -->
        <PanelSection :title="$t('professionalEditor.sectionShotSettings')" icon="🎥" :default-open="true">
          <div class="shot-row">
            <div class="shot-item">
              <label>{{ $t('editor.shotType') }}</label>
              <el-select v-model="currentStoryboard.shot_type" clearable size="small" @change="$emit('save-field', 'shot_type')">
                <el-option :label="$t('professionalEditor.shot.extremeLong')" value="大远景" />
                <el-option :label="$t('professionalEditor.shot.long')" value="远景" />
                <el-option :label="$t('professionalEditor.shot.full')" value="全景" />
                <el-option :label="$t('professionalEditor.shot.mediumFull')" value="中全景" />
                <el-option :label="$t('professionalEditor.shot.medium')" value="中景" />
                <el-option :label="$t('professionalEditor.shot.mediumClose')" value="中近景" />
                <el-option :label="$t('professionalEditor.shot.close')" value="近景" />
                <el-option :label="$t('professionalEditor.shot.closeUp')" value="特写" />
                <el-option :label="$t('professionalEditor.shot.extremeCloseUp')" value="大特写" />
              </el-select>
            </div>
            <div class="shot-item">
              <label>{{ $t('editor.movement') }}</label>
              <el-select v-model="currentStoryboard.movement" clearable size="small" @change="$emit('save-field', 'movement')">
                <el-option :label="$t('professionalEditor.movement.fixed')" value="固定镜头" />
                <el-option :label="$t('professionalEditor.movement.push')" value="推镜" />
                <el-option :label="$t('professionalEditor.movement.pull')" value="拉镜" />
                <el-option :label="$t('professionalEditor.movement.pan')" value="摇镜" />
                <el-option :label="$t('professionalEditor.movement.dolly')" value="移镜" />
                <el-option :label="$t('professionalEditor.movement.tracking')" value="跟镜" />
                <el-option :label="$t('professionalEditor.movement.crane')" value="升降镜头" />
                <el-option :label="$t('professionalEditor.movement.orbit')" value="环绕" />
                <el-option :label="$t('professionalEditor.movement.whip')" value="甩镜" />
                <el-option :label="$t('professionalEditor.movement.zoom')" value="变焦" />
                <el-option :label="$t('professionalEditor.movement.handheld')" value="手持晃动" />
                <el-option :label="$t('professionalEditor.movement.aerial')" value="航拍" />
              </el-select>
            </div>
            <div class="shot-item">
              <label>{{ $t('editor.angle') }}</label>
              <el-select v-model="currentStoryboard.angle" clearable size="small" @change="$emit('save-field', 'angle')">
                <el-option :label="$t('professionalEditor.angle.eye')" value="平视" />
                <el-option :label="$t('professionalEditor.angle.high')" value="俯视" />
                <el-option :label="$t('professionalEditor.angle.low')" value="仰视" />
                <el-option :label="$t('professionalEditor.angle.birdEye')" value="大俯视（鸟瞰）" />
                <el-option :label="$t('professionalEditor.angle.extremeLow')" value="大仰视" />
                <el-option :label="$t('professionalEditor.angle.side')" value="正侧面" />
                <el-option :label="$t('professionalEditor.angle.oblique')" value="斜侧面" />
                <el-option :label="$t('professionalEditor.angle.back')" value="背面" />
                <el-option :label="$t('professionalEditor.angle.dutch')" value="倾斜（荷兰角）" />
                <el-option :label="$t('professionalEditor.angle.pov')" value="主观视角" />
                <el-option :label="$t('professionalEditor.angle.overShoulder')" value="过肩" />
              </el-select>
            </div>
          </div>
        </PanelSection>

        <!-- Section 3: 内容描述 -->
        <PanelSection :title="$t('professionalEditor.sectionContent')" icon="📝" :default-open="true">
          <div class="field-group">
            <div class="field-label">{{ $t('editor.action') }}</div>
            <el-input v-model="currentStoryboard.action" type="textarea" :rows="3" :placeholder="$t('editor.actionPlaceholder')" @blur="$emit('save-field', 'action')" />
          </div>
          <div class="field-group">
            <div class="field-label">{{ $t('editor.dialogue') }}</div>
            <el-input v-model="currentStoryboard.dialogue" type="textarea" :rows="2" :placeholder="$t('editor.dialoguePlaceholder')" @blur="$emit('save-field', 'dialogue')" />
          </div>
          <div class="field-group">
            <div class="field-label">{{ $t('editor.result') }}</div>
            <el-input v-model="currentStoryboard.result" type="textarea" :rows="2" :placeholder="$t('editor.resultPlaceholder')" @blur="$emit('save-field', 'result')" />
          </div>
          <div class="field-group">
            <div class="field-label">{{ $t('editor.description') }}</div>
            <el-input v-model="currentStoryboard.description" type="textarea" :rows="3" :placeholder="$t('editor.descriptionPlaceholder')" @blur="$emit('save-field', 'description')" />
          </div>
        </PanelSection>

        <!-- Section 4: 音频氛围（默认折叠） -->
        <PanelSection :title="$t('professionalEditor.sectionAudio')" icon="🔊" :default-open="false">
          <div class="field-group">
            <div class="field-label">{{ $t('editor.soundEffects') }}</div>
            <el-input v-model="currentStoryboard.sound_effect" type="textarea" :rows="2" :placeholder="$t('editor.soundEffectsPlaceholder')" @blur="$emit('save-field', 'sound_effect')" />
          </div>
          <div class="field-group">
            <div class="field-label">{{ $t('editor.bgmPrompt') }}</div>
            <el-input v-model="currentStoryboard.bgm_prompt" type="textarea" :rows="2" :placeholder="$t('editor.bgmPromptPlaceholder')" @blur="$emit('save-field', 'bgm_prompt')" />
          </div>
          <div class="field-group">
            <div class="field-label">{{ $t('editor.atmosphere') }}</div>
            <el-input v-model="currentStoryboard.atmosphere" type="textarea" :rows="2" :placeholder="$t('editor.atmospherePlaceholder')" @blur="$emit('save-field', 'atmosphere')" />
          </div>
        </PanelSection>

        <!-- 图片生成区（移植自 GenerationTab 的图片部分） -->
        <PanelSection :title="$t('professionalEditor.imageGeneration')" icon="🖼️" :default-open="false">
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
            <el-input v-model="imageGen.currentFramePrompt.value" type="textarea" :rows="4" :placeholder="$t('editor.promptPlaceholder')" />
          </div>
          <div class="gen-controls-row">
            <el-button
              type="success" :icon="MagicStick" :loading="imageGen.generatingImage.value"
              :disabled="!imageGen.currentFramePrompt.value"
              @click="$emit('generate-image')"
            >{{ imageGen.generatingImage.value ? $t('editor.generating') : $t('editor.generateImage') }}</el-button>
            <el-button :icon="Upload" @click="imageGen.uploadImage()">{{ $t('editor.uploadImage') }}</el-button>
          </div>
          <div v-if="imageGen.generatedImages.value.length > 0" class="field-group" style="margin-top:6px">
            <div class="field-label">{{ $t('editor.generationResult') }} ({{ imageGen.generatedImages.value.length }})</div>
            <div class="result-grid">
              <div v-for="img in imageGen.generatedImages.value" :key="img.id" class="result-item">
                <el-image
                  v-if="hasImage(img)"
                  :src="getImageUrl(img)"
                  fit="cover"
                  :preview-src-list="imageGen.generatedImages.value.filter((i: any) => hasImage(i)).map((i: any) => getImageUrl(i))"
                  preview-teleported
                />
                <div v-else class="result-placeholder">
                  <el-icon :size="16"><Picture /></el-icon>
                  <p>{{ imageGen.getStatusText(img.status) }}</p>
                </div>
              </div>
            </div>
          </div>
        </PanelSection>

        <!-- 视频生成结果区 -->
        <PanelSection :title="$t('professionalEditor.videoGeneration')" icon="🎬" :default-open="true">
          <div v-if="videoGen.generatedVideos.value?.length > 0" class="video-result-list">
            <div
              v-for="video in videoGen.generatedVideos.value"
              :key="video.id"
              class="video-result-item"
              :class="'video-' + video.status"
            >
              <div class="video-thumb-wrap" @click="video.video_url && videoGen.playVideo(video)">
                <video v-if="video.video_url" :src="getVideoUrl(video)" preload="metadata" class="video-thumb-media" />
                <div v-else class="video-thumb-placeholder">
                  <el-icon :size="16"><VideoCamera /></el-icon>
                </div>
                <div class="video-thumb-overlay" v-if="video.video_url">
                  <el-icon color="white" :size="16"><VideoPlay /></el-icon>
                </div>
              </div>
              <div class="video-result-info">
                <el-tag
                  :type="video.status === 'completed' ? 'success' : video.status === 'failed' ? 'danger' : 'warning'"
                  size="small"
                >{{ imageGen.getStatusText(video.status) }}</el-tag>
                <span class="video-duration" v-if="video.duration">{{ video.duration }}s</span>
                <span class="video-error" v-if="video.status === 'failed' && video.error_msg">{{ video.error_msg }}</span>
              </div>
            </div>
          </div>
          <div v-else class="video-empty-hint">
            <el-icon :size="20" color="#c0c4cc"><VideoCamera /></el-icon>
            <p>{{ $t('professionalEditor.noVideoGenerated') }}</p>
          </div>
        </PanelSection>

      </div><!-- end panel-scroll -->

      <!-- ===== 固定底部：视频生成控制 ===== -->
      <div class="panel-gen">
        <!-- 视频提示词预览 -->
        <div class="prompt-preview" v-if="currentStoryboard.video_prompt">
          <span class="prompt-text">{{ currentStoryboard.video_prompt }}</span>
          <button class="copy-btn" type="button" @click="copyPrompt" :title="$t('common.copy')">
            <el-icon><CopyDocument /></el-icon>
          </button>
        </div>
        <!-- 模型选择 -->
        <el-select
          v-model="videoGen.selectedVideoModel.value"
          :placeholder="$t('video.selectVideoModel')"
          size="small"
          style="width:100%"
        >
          <el-option
            v-for="model in videoGen.videoModelCapabilities.value"
            :key="model.id"
            :label="model.name"
            :value="model.id"
          />
        </el-select>
        <!-- 生成按钮 -->
        <button
          class="gen-btn"
          type="button"
          @click="videoGen.generateVideo()"
          :disabled="!videoGen.selectedVideoModel.value || videoGen.generatingVideo.value"
          :class="{ loading: videoGen.generatingVideo.value }"
        >
          <el-icon v-if="!videoGen.generatingVideo.value"><VideoCamera /></el-icon>
          <el-icon v-else class="rotating"><Loading /></el-icon>
          {{ videoGen.generatingVideo.value ? $t('professionalEditor.generatingVideo') : $t('professionalEditor.generateVideo') }}
        </button>
        <!-- 最近生成结果 + 合成工作台入口 -->
        <div class="recent-row">
          <div class="recent-results" v-if="recentVideos.length">
            <div
              v-for="video in recentVideos"
              :key="video.id"
              class="recent-thumb"
              @click="videoGen.playVideo(video)"
            >
              <video v-if="video.video_url" :src="getVideoUrl(video)" preload="metadata" />
              <div class="recent-thumb-overlay">
                <el-icon color="white"><VideoPlay /></el-icon>
              </div>
            </div>
          </div>
          <button class="composition-link-btn" type="button" @click="$emit('go-to-composition')">
            {{ $t('editor.compositionWorkbench') }}
            <el-icon><ArrowRight /></el-icon>
          </button>
        </div>
      </div>

    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft, ArrowRight, Plus, Picture, Close, Box, Edit,
  CopyDocument, VideoCamera, Loading, MagicStick, Upload, VideoPlay
} from '@element-plus/icons-vue'
import PanelSection from './PanelSection.vue'
import { getImageUrl, hasImage, getVideoUrl } from '@/utils/image'

const { t } = useI18n()

const props = defineProps<{
  currentStoryboard: any
  currentStoryboardCharacters: any[]
  currentStoryboardProps: any[]
  storyboardIndex: number
  totalStoryboards: number
  imageGen: any
  videoGen: any
}>()

const emit = defineEmits<{
  'prev-scene': []
  'next-scene': []
  'save-field': [fieldName: string]
  'show-scene-selector': []
  'show-character-selector': []
  'show-prop-selector': []
  'show-character-image': [char: any]
  'show-scene-image': []
  'toggle-character': [charId: number]
  'toggle-prop': [propId: number]
  'generate-image': []
  'go-to-composition': []
}>()

const isFirst = computed(() => props.storyboardIndex <= 0)
const isLast = computed(() => props.storyboardIndex >= props.totalStoryboards - 1)

const recentVideos = computed(() =>
  (props.videoGen.generatedVideos.value || [])
    .filter((v: any) => v.video_url && v.status === 'completed')
    .slice(0, 3)
)

const copyPrompt = () => {
  if (props.currentStoryboard?.video_prompt) {
    navigator.clipboard.writeText(props.currentStoryboard.video_prompt)
    ElMessage.success(t('common.copied'))
  }
}
</script>

<style scoped lang="scss">
.scene-editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary, #fff);
  border-left: 1px solid var(--border-primary, #e4e7ed);
  overflow: hidden;
}

/* 分镜导航 */
.panel-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--border-primary, #e4e7ed);
  flex-shrink: 0;
  background: var(--bg-card, #fff);
}

.nav-btn {
  width: 28px; height: 28px;
  border: 1px solid var(--border-primary, #e4e7ed);
  border-radius: 6px;
  background: none;
  color: var(--text-secondary, #606266);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all 120ms;

  &:disabled { opacity: 0.35; cursor: not-allowed; }
  &:not(:disabled):hover { background: var(--bg-card-hover, #f5f7fa); border-color: var(--accent, #e8a243); }
}

.scene-title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

/* 空状态 */
.panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted, #c0c4cc);
  font-size: 13px;
}

/* 可滚动区域 */
.panel-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: var(--border-primary, #e4e7ed); border-radius: 2px; }
}

/* 字段组 */
.field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;

  &:last-child { margin-bottom: 0; }
}

.field-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #606266);
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 场景预览 */
.scene-preview-v2 {
  position: relative; border-radius: 5px;
  overflow: hidden; cursor: pointer; height: 66px;
  img { width: 100%; height: 100%; object-fit: cover; }
  .scene-info-overlay {
    position: absolute; bottom: 0; left: 0; right: 0;
    background: rgba(0,0,0,.6); color: #fff;
    font-size: 10px; padding: 2px 6px;
  }
}
.scene-preview-empty-v2 {
  height: 46px; border: 1px dashed #dcdfe6; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  gap: 5px; color: #c0c4cc; font-size: 11px;
}

/* Cast chip */
.cast-row {
  display: flex; flex-wrap: wrap; gap: 4px; min-height: 26px;
}
.cast-chip {
  display: flex; align-items: center; gap: 2px;
  background: #f4f4f5; border-radius: 14px;
  padding: 2px 6px 2px 2px; font-size: 11px;
}
.cast-chip-avatar {
  width: 20px; height: 20px; border-radius: 50%;
  overflow: hidden; background: #ddd;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0;
  img { width: 100%; height: 100%; object-fit: cover; }
  span { font-size: 9px; font-weight: 600; }
}
.cast-chip-name { font-size: 11px; color: #303133; }
.cast-chip-remove {
  font-size: 10px; color: #c0c4cc; cursor: pointer;
  &:hover { color: #f56c6c; }
}
.cast-empty-hint { font-size: 11px; color: #c0c4cc; line-height: 26px; }

/* 镜头设置三列 */
.shot-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 5px;
}
.shot-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  label {
    font-size: 10px;
    color: var(--text-muted, #909399);
    white-space: nowrap;
  }
}

/* 视频生成结果列表 */
.video-result-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.video-result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px;
  border-radius: 6px;
  background: var(--bg-primary, #f9fafb);
  border: 1px solid var(--border-primary, #e5e7eb);

  &.video-completed { border-color: #b3e19d; background: rgba(21,128,61,0.06); }
  &.video-failed { border-color: #fbc4c4; background: rgba(239,68,68,0.06); }
  &.video-processing, &.video-pending { border-color: #fcd891; background: rgba(245,158,11,0.06); }
}

.video-thumb-wrap {
  width: 60px;
  height: 34px;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
  position: relative;
  cursor: pointer;
  flex-shrink: 0;

  &:hover .video-thumb-overlay { opacity: 1; }
}

.video-thumb-media {
  width: 100%; height: 100%;
  object-fit: cover; display: block;
}

.video-thumb-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  color: #555;
}

.video-thumb-overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 150ms;
}

.video-result-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.video-duration {
  font-size: 11px;
  color: var(--text-muted, #9ca3af);
}

.video-error {
  font-size: 10px;
  color: #f56c6c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.video-empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 0;
  color: var(--text-muted, #9ca3af);
  p { font-size: 12px; margin: 0; }
}

/* 图片生成 */
.gen-controls-row {
  display: flex; gap: 6px; flex-wrap: wrap;
}
.result-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  margin-top: 4px;
}
.result-item {
  aspect-ratio: 1;
  border-radius: 5px;
  overflow: hidden;
  background: #f5f7fa;
  position: relative;
  .el-image { width: 100%; height: 100%; }
}
.result-placeholder {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 3px; color: #c0c4cc;
  p { font-size: 10px; margin: 0; }
}

/* 固定底部生成区 */
.panel-gen {
  flex-shrink: 0;
  padding: 8px 10px;
  border-top: 2px solid var(--border-primary, #e4e7ed);
  background: var(--bg-card, #fff);
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.prompt-preview {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding: 5px 7px;
  background: var(--bg-secondary, #f5f7fa);
  border-radius: 5px;
  font-size: 11px;
  color: var(--text-muted, #909399);
  max-height: 44px;
  overflow: hidden;
}
.prompt-text {
  flex: 1;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.copy-btn {
  flex-shrink: 0;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--text-muted, #909399);
  padding: 0;
  &:hover { color: var(--accent, #e8a243); }
}

.gen-btn {
  width: 100%;
  height: 38px;
  display: flex; align-items: center; justify-content: center; gap: 7px;
  border: none; border-radius: 7px;
  background: linear-gradient(135deg, var(--accent, #e8a243) 0%, var(--glass-accent-to, #f0c060) 100%);
  color: var(--glass-text-on-accent, #1a1614);
  font-size: 13px; font-weight: 700;
  cursor: pointer; transition: all 150ms;

  &:hover:not(:disabled) { filter: brightness(1.08); }
  &:disabled { opacity: 0.55; cursor: not-allowed; }
  &.loading {
    background: var(--bg-secondary, #f5f7fa);
    color: var(--text-secondary, #606266);
  }
}

@keyframes spin { to { transform: rotate(360deg); } }
.rotating { animation: spin 1s linear infinite; }

.recent-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.recent-results {
  display: flex;
  gap: 5px;
  flex: 1;
}
.recent-thumb {
  width: 52px; height: 30px;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--border-primary, #e4e7ed);
  cursor: pointer;
  position: relative;
  flex-shrink: 0;

  video { width: 100%; height: 100%; object-fit: cover; }
  &:hover .recent-thumb-overlay { opacity: 1; }
}
.recent-thumb-overlay {
  position: absolute; inset: 0;
  background: rgba(0,0,0,0.4);
  display: flex; align-items: center; justify-content: center;
  opacity: 0; transition: opacity 150ms;
}

.composition-link-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  border: 1px solid var(--border-primary, #e4e7ed);
  border-radius: 5px;
  background: none;
  color: var(--text-secondary, #606266);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 120ms;

  &:hover {
    border-color: var(--accent, #e8a243);
    color: var(--accent, #e8a243);
  }
}
</style>
