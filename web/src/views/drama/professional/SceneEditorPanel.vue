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
      <el-icon :size="40"><Edit /></el-icon>
      <p>{{ $t('professionalEditor.selectStoryboard') }}</p>
    </div>

    <template v-else>
      <!-- ===== 双列区域：图片生成 | 视频生成 ===== -->
      <div class="panel-columns">

        <!-- ===== 左列：图片生成 ===== -->
        <div class="column-image">
          <div class="column-header column-header--image">{{ $t('professionalEditor.imageGeneration') }}</div>
          <div class="column-scroll">

            <!-- ASSETS 素材区 -->
            <div class="editor-section">
              <div class="section-header">素材</div>
              <div class="section-body">
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
                    <el-icon :size="24"><Picture /></el-icon>
                    <span>{{ currentStoryboard.background ? $t('editor.sceneGenerating') : $t('editor.noBackground') }}</span>
                  </div>
                </div>
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
              </div>
            </div>

            <!-- GENERATE 生成区（accent 色条） -->
            <div class="editor-section section-accent">
              <div class="section-header">生成</div>
              <div class="section-body">
                <div class="field-group">
                  <div class="field-label">{{ $t('editor.selectFrameType') }}</div>
                  <div class="frame-type-tabs">
                    <button
                      v-for="type in frameTypes"
                      :key="type.value"
                      type="button"
                      class="frame-type-tab"
                      :class="{ 'frame-type-tab--active': imageGen.selectedFrameType.value === type.value }"
                      @click="imageGen.selectedFrameType.value = type.value"
                    >{{ type.label }}</button>
                  </div>
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
                  <button
                    class="gen-btn"
                    type="button"
                    :disabled="!imageGen.currentFramePrompt.value || imageGen.generatingImage.value"
                    :class="{ loading: imageGen.generatingImage.value }"
                    @click="$emit('generate-image')"
                  >
                    <el-icon v-if="!imageGen.generatingImage.value"><MagicStick /></el-icon>
                    <el-icon v-else class="rotating"><Loading /></el-icon>
                    {{ imageGen.generatingImage.value ? $t('editor.generating') : $t('editor.generateImage') }}
                  </button>
                  <button
                    class="upload-btn"
                    type="button"
                    @click="imageGen.uploadImage()"
                    :title="$t('editor.uploadImage')"
                  >
                    <el-icon><Upload /></el-icon>
                  </button>
                </div>
              </div>
            </div>


          </div>
        </div>

        <!-- ===== 右列：视频生成 ===== -->
        <div class="column-video">
          <div class="column-header column-header--video">{{ $t('professionalEditor.videoGeneration') }}</div>
          <div class="column-scroll">

            <!-- CAMERA 镜头区 -->
            <div class="editor-section">
              <div class="section-header">镜头</div>
              <div class="section-body">
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
              </div>
            </div>

            <!-- NARRATIVE 叙事区（accent 色条） -->
            <div class="editor-section section-accent">
              <div class="section-header">叙事</div>
              <div class="section-body">
                <div class="field-group">
                  <div class="field-label">{{ $t('editor.action') }}</div>
                  <el-input v-model="currentStoryboard.action" type="textarea" :rows="2" :placeholder="$t('editor.actionPlaceholder')" @blur="$emit('save-field', 'action')" />
                </div>
                <div class="field-group">
                  <div class="field-label">{{ $t('editor.dialogue') }}</div>
                  <el-input v-model="currentStoryboard.dialogue" type="textarea" :rows="2" :placeholder="$t('editor.dialoguePlaceholder')" @blur="$emit('save-field', 'dialogue')" />
                </div>
                <div class="field-group">
                  <div class="field-label">{{ $t('editor.result') }}</div>
                  <el-input v-model="currentStoryboard.result" type="textarea" :rows="1" :placeholder="$t('editor.resultPlaceholder')" @blur="$emit('save-field', 'result')" />
                </div>
                <div class="field-group">
                  <div class="field-label">{{ $t('editor.description') }}</div>
                  <el-input v-model="currentStoryboard.description" type="textarea" :rows="2" :placeholder="$t('editor.descriptionPlaceholder')" @blur="$emit('save-field', 'description')" />
                </div>
              </div>
            </div>

            <!-- AUDIO 音频区 -->
            <div class="editor-section">
              <button class="audio-toggle-btn" type="button" @click="showAudio = !showAudio">
                🔊 {{ $t('professionalEditor.audioAtmosphere') }}
                <el-icon :class="{ 'audio-arrow-open': showAudio }"><ArrowDown /></el-icon>
              </button>
              <div v-show="showAudio" class="section-body">
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
              </div>
            </div>

            <!-- GENERATE 生成控制区 -->
            <div class="editor-section">
              <div class="section-header">生成</div>
              <div class="section-body">
                <div class="prompt-preview" v-if="currentStoryboard.video_prompt">
                  <span class="prompt-text">{{ currentStoryboard.video_prompt }}</span>
                  <button class="copy-btn" type="button" @click="copyPrompt" :title="$t('common.copy')">
                    <el-icon><CopyDocument /></el-icon>
                  </button>
                </div>
                <div class="gen-action-row">
                  <el-select
                    v-model="videoGen.selectedVideoModel.value"
                    :placeholder="$t('video.selectVideoModel')"
                    size="small"
                    style="flex:1"
                  >
                    <el-option
                      v-for="model in videoGen.videoModelCapabilities.value"
                      :key="model.id"
                      :label="model.name"
                      :value="model.id"
                    />
                  </el-select>
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
                </div>
                <button class="composition-link-btn" type="button" @click="$emit('go-to-composition')">
                  {{ $t('editor.compositionWorkbench') }}
                  <el-icon><ArrowRight /></el-icon>
                </button>
              </div>
            </div>


          </div>
        </div>

      </div><!-- end panel-columns -->

    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import {
  ArrowLeft, ArrowRight, ArrowDown, Plus, Picture, Close, Box, Edit,
  CopyDocument, VideoCamera, Loading, MagicStick, Upload
} from '@element-plus/icons-vue'
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

const showAudio = ref(false)

const frameTypes = computed(() => [
  { value: 'first', label: t('editor.firstFrame') },
  { value: 'last', label: t('editor.lastFrame') },
  { value: 'action', label: t('editor.actionSequence') },
  { value: 'key', label: t('editor.keyFrame') },
])

const isFirst = computed(() => props.storyboardIndex <= 0)
const isLast = computed(() => props.storyboardIndex >= props.totalStoryboards - 1)

const copyPrompt = () => {
  if (props.currentStoryboard?.video_prompt) {
    navigator.clipboard.writeText(props.currentStoryboard.video_prompt)
    ElMessage.success(t('common.copied'))
  }
}
</script>

<style scoped lang="scss">
/* ========================================
   Shell — 面板容器
   ======================================== */
.scene-editor-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary, #fff);
  border-left: 1px solid var(--glass-stroke-base);
  overflow: hidden;
}

/* ========================================
   Nav — 分镜导航
   ======================================== */
.panel-nav {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--glass-stroke-base);
  flex-shrink: 0;
  background: var(--bg-card, #fff);
}

.nav-btn {
  width: 28px; height: 28px;
  border: 1px solid var(--glass-stroke-base);
  border-radius: var(--glass-radius-xs);
  background: none;
  color: var(--glass-text-secondary);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: all 120ms;

  &:disabled { opacity: 0.35; cursor: not-allowed; }
  &:not(:disabled):hover { background: var(--glass-ghost-hover-bg); border-color: var(--accent, #e8a243); }
}

.scene-title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--glass-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

/* ========================================
   Empty State — 空状态
   ======================================== */
.panel-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--glass-text-tertiary);
  font-size: 13px;
}

/* ========================================
   Columns — 双列布局
   ======================================== */
.panel-columns {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.column-image {
  flex: 2;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.column-video {
  flex: 3;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  border-left: 1px solid var(--glass-stroke-base);
}

.column-header {
  height: 36px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--glass-text-primary);
  border-bottom: 1px solid var(--glass-stroke-base);
  flex-shrink: 0;
  letter-spacing: 0.2px;
}

.column-header--image {
  border-left: 3px solid var(--accent, #e8a243);
  background: rgba(232, 162, 67, 0.06);
}

.column-header--video {
  border-left: 3px solid #4a9eff;
  background: rgba(74, 158, 255, 0.06);
}

.column-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 12px 12px;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: var(--glass-stroke-base); border-radius: 2px; }
}

/* ========================================
   Section — Figma 风格分区系统
   ======================================== */
.editor-section {
  padding: 4px 0 6px;

  & + .editor-section {
    border-top: 1px solid var(--glass-stroke-base);
  }
}

/* Section header — UPPERCASE 工具面板标题 */
.section-header {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  font-weight: 700;
  color: var(--glass-text-tertiary);
  padding: 6px 0 5px;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 6px;

  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--glass-stroke-base);
  }
}

/* Section body — 内容区域 */
.section-body {
  display: flex;
  flex-direction: column;
}

/* Accent section — 左侧琥珀色条标记重要区域 */
.section-accent {
  border-left: 2px solid var(--accent, #e8a243);
  padding-left: 10px;
  margin-left: -1px;
}

/* ========================================
   Field — 字段组
   ======================================== */
.field-group {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 6px;

  &:last-child { margin-bottom: 0; }
}

/* 视频列紧凑间距 */
.column-video .field-group {
  gap: 2px;
  margin-bottom: 5px;
}

.field-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--glass-text-tertiary);
  display: flex;
  align-items: center;
  gap: 4px;
  letter-spacing: 0.3px;
}

/* ========================================
   Deep inset controls — 深色内嵌 Element Plus 覆盖
   ======================================== */
.column-scroll :deep(.el-textarea__inner) {
  background: var(--glass-bg-canvas) !important;
  border: 1px solid var(--glass-stroke-base) !important;
  color: var(--glass-text-primary);
  font-size: 12px;
  border-radius: 6px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.12);

  &:focus {
    border-color: var(--glass-stroke-focus) !important;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.12), 0 0 0 2px var(--glass-focus-ring);
  }
}

.column-scroll :deep(.el-input__wrapper) {
  background: var(--glass-bg-canvas) !important;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.12) !important;
  border: 1px solid var(--glass-stroke-base);
  border-radius: 6px;

  &.is-focus {
    border-color: var(--glass-stroke-focus);
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.12), 0 0 0 2px var(--glass-focus-ring) !important;
  }
}

.column-scroll :deep(.el-input__inner) {
  color: var(--glass-text-primary);
  font-size: 12px;
}

.column-scroll :deep(.el-select__placeholder) {
  color: var(--glass-text-tertiary);
}

/* ========================================
   Scene Preview — 场景预览
   ======================================== */
.scene-preview-v2 {
  position: relative; border-radius: var(--glass-radius-xs);
  overflow: hidden; cursor: pointer; height: 66px;
  img { width: 100%; height: 100%; object-fit: cover; }
  .scene-info-overlay {
    position: absolute; bottom: 0; left: 0; right: 0;
    background: rgba(0,0,0,.6); color: #fff;
    font-size: 10px; padding: 2px 6px;
  }
}
.scene-preview-empty-v2 {
  height: 46px; border: 1px dashed var(--glass-stroke-base); border-radius: var(--glass-radius-xs);
  display: flex; align-items: center; justify-content: center;
  gap: 5px; color: var(--glass-text-tertiary); font-size: 11px;
}

/* ========================================
   Cast Chips — 角色/道具标签
   ======================================== */
.cast-row {
  display: flex; flex-wrap: wrap; gap: 4px; min-height: 26px;
}
.cast-chip {
  display: flex; align-items: center; gap: 2px;
  background: var(--glass-tone-neutral-bg); border-radius: 14px;
  padding: 2px 6px 2px 2px; font-size: 11px;
}
.cast-chip-avatar {
  width: 20px; height: 20px; border-radius: 50%;
  overflow: hidden; background: var(--glass-stroke-base);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; flex-shrink: 0;
  img { width: 100%; height: 100%; object-fit: cover; }
  span { font-size: 9px; font-weight: 600; }
}
.cast-chip-name { font-size: 11px; color: var(--glass-text-primary); }
.cast-chip-remove {
  font-size: 10px; color: var(--glass-text-tertiary); cursor: pointer;
  &:hover { color: var(--glass-tone-danger-fg); }
}
.cast-empty-hint { font-size: 11px; color: var(--glass-text-tertiary); line-height: 26px; }

/* ========================================
   Shot Row — 镜头设置 2列 grid
   ======================================== */
.shot-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}
.shot-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  label {
    font-size: 10px;
    font-weight: 600;
    color: var(--glass-text-tertiary);
    white-space: nowrap;
    letter-spacing: 0.3px;
  }
}

/* ========================================
   Audio Toggle — 音频氛围折叠
   ======================================== */
.audio-toggle-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 0;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 11px;
  font-weight: 600;
  color: var(--glass-text-secondary);
  text-align: left;

  .el-icon {
    margin-left: auto;
    transition: transform 150ms;
  }
  &:hover { color: var(--accent, #e8a243); }
}

.audio-arrow-open {
  transform: rotate(180deg);
}

/* ========================================
   Image Gen Controls — 图片生成按钮行
   ======================================== */
.gen-controls-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.upload-btn {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: 1px solid var(--glass-stroke-base);
  border-radius: var(--glass-radius-xs);
  background: none;
  color: var(--glass-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 120ms;

  &:hover {
    border-color: var(--accent, #e8a243);
    color: var(--accent, #e8a243);
    background: var(--glass-ghost-hover-bg);
  }
}

/* ========================================
   Prompt Preview — 视频提示词预览
   ======================================== */
.prompt-preview {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding: 5px 7px;
  background: var(--glass-bg-canvas);
  border: 1px solid var(--glass-stroke-base);
  border-radius: 6px;
  font-size: 11px;
  color: var(--glass-text-tertiary);
  max-height: 44px;
  overflow: hidden;
  margin-bottom: 6px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.12);
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
  color: var(--glass-text-tertiary);
  padding: 0;
  &:hover { color: var(--accent, #e8a243); }
}

/* ========================================
   Gen Action Row — 模型选择 + 生成按钮同行
   ======================================== */
.gen-action-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.gen-btn {
  width: auto;
  height: 32px;
  padding: 0 14px;
  display: flex; align-items: center; justify-content: center; gap: 5px;
  border: none; border-radius: var(--glass-radius-xs);
  background: linear-gradient(135deg, var(--accent, #e8a243) 0%, var(--glass-accent-to, #f0c060) 100%);
  color: var(--glass-text-on-accent, #1a1614);
  font-size: 12px; font-weight: 700;
  cursor: pointer; transition: all 150ms;
  white-space: nowrap;
  flex-shrink: 0;

  &:hover:not(:disabled) { filter: brightness(1.08); box-shadow: 0 2px 8px var(--glass-accent-shadow-soft); }
  &:disabled { opacity: 0.55; cursor: not-allowed; }
  &.loading {
    background: var(--glass-bg-canvas);
    color: var(--glass-text-secondary);
    border: 1px solid var(--glass-stroke-base);
  }
}

@keyframes spin { to { transform: rotate(360deg); } }
.rotating { animation: spin 1s linear infinite; }

/* ========================================
   Frame Type Tabs — 帧类型 segmented control
   ======================================== */
.frame-type-tabs {
  display: flex;
  background: var(--glass-bg-canvas);
  border: 1px solid var(--glass-stroke-base);
  border-radius: 8px;
  padding: 2px;
  gap: 1px;
}

.frame-type-tab {
  flex: 1;
  height: 24px;
  border: none;
  background: none;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--glass-text-tertiary);
  cursor: pointer;
  transition: all 120ms;
  white-space: nowrap;
  padding: 0 4px;

  &:hover:not(.frame-type-tab--active) {
    color: var(--glass-text-secondary);
    background: var(--glass-ghost-hover-bg);
  }

  &.frame-type-tab--active {
    background: var(--accent, #e8a243);
    color: var(--glass-text-on-accent, #1a1614);
    font-weight: 700;
  }
}

/* 合成入口 — ghost 风格 */
.composition-link-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 4px 8px;
  border: none;
  border-radius: var(--glass-radius-xs);
  background: none;
  color: var(--glass-text-tertiary);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all 120ms;

  &:hover {
    color: var(--accent, #e8a243);
    background: var(--glass-ghost-hover-bg);
  }
}
</style>
