<template>
  <div class="professional-editor-v3">
    <!-- ===== 顶栏 ===== -->
    <AppHeader :fixed="false">
      <template #left>
        <el-button text @click="editor.goBack" class="back-btn">
          <el-icon><ArrowLeft /></el-icon>
          <span>{{ $t('editor.backToEpisode') }}</span>
        </el-button>
        <span class="episode-title">{{ editor.drama.value?.title }} - {{ $t('editor.episode', { number: editor.episodeNumber }) }}</span>
      </template>
    </AppHeader>

    <!-- ===== 主编辑区：三栏 + 底部时间线 ===== -->
    <div class="editor-body">
      <div class="editor-upper">
        <!-- 左栏：分镜列表 -->
        <StoryboardList
          :storyboards="editor.storyboards.value"
          :current-storyboard-id="editor.currentStoryboardId.value"
          :get-storyboard-thumbnail="imageGen.getStoryboardThumbnail"
          @select="editor.selectStoryboard"
          @add="editor.handleAddStoryboard"
          @delete="editor.handleDeleteStoryboard"
        />

        <!-- 中间：预览 -->
        <PreviewPane
          :current-storyboard="editor.currentStoryboard.value"
          :current-preview-url="currentPreviewUrl"
          :current-preview-video="currentPreviewVideo"
        />

        <!-- 右栏：Tab 面板 -->
        <div class="property-panel" v-if="editor.currentStoryboard.value">
          <el-tabs v-model="activeTab" class="panel-tabs">
            <el-tab-pane :label="$t('editor.properties')" name="properties">
              <PropertiesTab
                :current-storyboard="editor.currentStoryboard.value"
                :current-storyboard-characters="editor.currentStoryboardCharacters.value"
                :current-storyboard-props="editor.currentStoryboardProps.value"
                @save-field="editor.saveStoryboardField"
                @show-scene-selector="editor.showSceneSelector.value = true"
                @show-character-selector="editor.showCharacterSelector.value = true"
                @show-prop-selector="editor.showPropSelector.value = true"
                @show-character-image="editor.showCharacterImage"
                @show-scene-image="editor.showSceneImage"
                @toggle-character="editor.toggleCharacterInShot"
                @toggle-prop="editor.togglePropInShot"
              />
            </el-tab-pane>
            <el-tab-pane :label="$t('editor.generation')" name="generation">
              <GenerationTab
                :current-storyboard="editor.currentStoryboard.value"
                :image-gen="imageGen"
                :video-gen="videoGen"
                @generate-image="handleGenerateImage"
              />
            </el-tab-pane>
            <el-tab-pane :label="$t('editor.composition')" name="composition">
              <CompositionTab
                :video-merges="merge.videoMerges.value"
                :loading-merges="merge.loadingMerges.value"
                @download="merge.downloadVideo"
                @preview="merge.previewMergedVideo"
                @delete="merge.deleteMerge"
              />
            </el-tab-pane>
          </el-tabs>
        </div>
        <div class="property-panel property-panel-empty" v-else>
          <el-empty description="请从左侧选择分镜" />
        </div>
      </div>

      <!-- 底部：时间线 -->
      <div class="editor-timeline">
        <VideoTimelineEditor
          ref="timelineEditorRef"
          v-if="editor.storyboards.value.length > 0"
          :scenes="(editor.storyboards.value as any[])"
          :episode-id="editor.episodeId.value.toString()"
          :drama-id="editor.dramaId.toString()"
          :assets="videoGen.videoAssets.value"
          @select-scene="handleTimelineSelect"
          @asset-deleted="videoGen.loadVideoAssets"
          @merge-completed="handleMergeCompleted"
        />
        <el-empty v-else :description="$t('storyboard.noStoryboard')" class="empty-timeline" />
      </div>
    </div>

    <!-- ===== 弹窗 ===== -->
    <SceneSelector
      v-model="editor.showSceneSelector.value"
      :scenes="editor.availableScenes.value"
      :current-scene-id="editor.currentStoryboard.value?.scene_id"
      @select="editor.selectScene"
    />
    <CharacterSelector
      v-model="editor.showCharacterSelector.value"
      :characters="editor.availableCharacters.value"
      :is-in-current-shot="editor.isCharacterInCurrentShot"
      @toggle="editor.toggleCharacterInShot"
    />
    <PropSelector
      v-model="editor.showPropSelector.value"
      :props="editor.availableProps.value"
      :is-in-current-shot="editor.isPropInCurrentShot"
      @toggle="editor.togglePropInShot"
    />

    <!-- 角色图片预览 -->
    <el-dialog v-model="editor.showCharacterImagePreview.value" :title="editor.previewCharacter.value?.name" width="600px">
      <div class="image-preview-content" v-if="editor.previewCharacter.value">
        <img v-if="editor.previewCharacter.value.local_path" :src="getImageUrl(editor.previewCharacter.value)" :alt="editor.previewCharacter.value.name" />
        <el-empty v-else description="暂无图片" />
      </div>
    </el-dialog>

    <!-- 场景大图预览 -->
    <el-dialog
      v-model="editor.showSceneImagePreview.value"
      :title="editor.currentStoryboard.value?.background ? `${editor.currentStoryboard.value.background.location} · ${editor.currentStoryboard.value.background.time}` : '场景预览'"
      width="800px"
    >
      <div class="image-preview-content" v-if="editor.currentStoryboard.value?.background?.image_url">
        <img :src="editor.currentStoryboard.value.background.image_url" alt="场景" />
      </div>
    </el-dialog>

    <!-- 视频预览对话框 -->
    <el-dialog v-model="videoGen.showVideoPreview.value" title="视频预览" width="800px" destroy-on-close>
      <div class="video-preview-container" v-if="videoGen.previewVideo.value">
        <video
          v-if="videoGen.previewVideo.value.video_url"
          :src="getVideoUrl(videoGen.previewVideo.value)"
          controls autoplay
          style="width:100%;max-height:70vh;display:block;background:#000;border-radius:8px"
        />
        <div v-else style="text-align:center;padding:40px">
          <el-icon :size="48" color="#ccc"><VideoCamera /></el-icon>
          <p style="margin-top:16px;color:#909399">视频生成中...</p>
        </div>
        <div class="video-meta" style="margin-top:12px">
          <el-tag :type="imageGen.getStatusType(videoGen.previewVideo.value.status)" size="small">
            {{ imageGen.getStatusText(videoGen.previewVideo.value.status) }}
          </el-tag>
          <span v-if="videoGen.previewVideo.value.duration" style="margin-left:12px;color:#606266;font-size:14px">
            {{ $t('professionalEditor.duration') }}: {{ videoGen.previewVideo.value.duration }}{{ $t('professionalEditor.seconds') }}
          </span>
        </div>
      </div>
    </el-dialog>

    <!-- 宫格图片编辑器 -->
    <GridImageEditor
      v-model="imageGen.showGridEditor.value"
      :storyboard-id="Number(editor.currentStoryboard.value?.id) || 0"
      :drama-id="Number(editor.dramaId)"
      :all-images="(imageGen.allGeneratedImages.value as any[])"
      @success="imageGen.handleGridImageSuccess"
    />

    <!-- 图片裁剪对话框 -->
    <ImageCropDialog
      v-model="imageGen.showCropDialog.value"
      :image-url="imageGen.cropImageUrl.value"
      @save="imageGen.handleCropSave"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { ArrowLeft, VideoCamera } from '@element-plus/icons-vue'
import VideoTimelineEditor from '@/components/editor/VideoTimelineEditor.vue'
import GridImageEditor from '@/components/editor/GridImageEditor.vue'
import { AppHeader, ImageCropDialog } from '@/components/common'
import { getImageUrl, getVideoUrl } from '@/utils/image'

// 子组件
import StoryboardList from './professional/StoryboardList.vue'
import PreviewPane from './professional/PreviewPane.vue'
import PropertiesTab from './professional/PropertiesTab.vue'
import GenerationTab from './professional/GenerationTab.vue'
import CompositionTab from './professional/CompositionTab.vue'
import SceneSelector from './professional/dialogs/SceneSelector.vue'
import CharacterSelector from './professional/dialogs/CharacterSelector.vue'
import PropSelector from './professional/dialogs/PropSelector.vue'

// composables
import { useProfessionalEditor } from '@/composables/useProfessionalEditor'
import { useFrameImageGeneration } from '@/composables/useFrameImageGeneration'
import { useVideoGenerationPro } from '@/composables/useVideoGenerationPro'
import { useVideoMerge } from '@/composables/useVideoMerge'

// 初始化 composables
const editor = useProfessionalEditor()

const imageGen = useFrameImageGeneration(
  editor.currentStoryboard,
  editor.dramaId,
)

const timelineEditorRef = ref<InstanceType<typeof VideoTimelineEditor> | null>(null)

const videoGen = useVideoGenerationPro(
  editor.currentStoryboard,
  editor.dramaId,
  editor.episodeId,
  editor.storyboards,
  imageGen.videoReferenceImages,
  timelineEditorRef,
)

const merge = useVideoMerge(editor.episodeId)

// 本地 UI 状态
const activeTab = ref('properties')

// 预览 computed
const currentPreviewUrl = computed((): string | null => {
  if (!editor.currentStoryboard.value) return null
  const firstFrameImg = imageGen.generatedImages.value.find(
    (i: any) => i.frame_type === 'first' && i.image_url,
  )
  if (firstFrameImg?.image_url) return firstFrameImg.image_url
  if ((editor.currentStoryboard.value as any).background?.image_url) {
    return (editor.currentStoryboard.value as any).background.image_url
  }
  return null
})

const currentPreviewVideo = computed((): string | null => {
  const latestVideo = videoGen.generatedVideos.value.find((v: any) => v.video_url)
  return latestVideo?.video_url || null
})

// 事件处理
const handleGenerateImage = () => {
  imageGen.generateFrameImage(editor.currentStoryboardCharacters.value)
}

const handleTimelineSelect = (sceneId: number) => {
  editor.selectStoryboard(String(sceneId))
}

const handleMergeCompleted = async (mergeId: number) => {
  await merge.handleMergeCompleted()
  activeTab.value = 'composition'
}

// 生命周期
onMounted(async () => {
  await editor.loadData()
  await videoGen.loadVideoModels()
  await videoGen.loadVideoAssets()
  await merge.loadVideoMerges()
})

onBeforeUnmount(() => {
  imageGen.stopPolling()
  videoGen.stopVideoPolling()
  merge.stopMergePolling()
})
</script>

<style scoped lang="scss">
.professional-editor-v3 {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-primary, #f5f7fa);
}

.editor-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.editor-upper {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 右栏属性面板 */
.property-panel {
  width: 380px;
  min-width: 320px;
  border-left: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &.property-panel-empty {
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.panel-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;

  :deep(.el-tabs__header) {
    margin: 0;
    padding: 0 12px;
    flex-shrink: 0;
  }
  :deep(.el-tabs__content) {
    flex: 1;
    overflow-y: auto;
  }
}

/* 底部时间线 */
.editor-timeline {
  height: 220px;
  min-height: 180px;
  border-top: 1px solid var(--el-border-color-lighter);
  overflow: hidden;
}

.empty-timeline {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 顶栏 */
.back-btn {
  gap: 4px;
}

.episode-title {
  font-size: 14px;
  font-weight: 500;
  margin-left: 8px;
  color: var(--text-primary, #303133);
}

/* 弹窗预览样式 */
.image-preview-content {
  text-align: center;
  img {
    max-width: 100%;
    max-height: 60vh;
    border-radius: 8px;
  }
}

.video-preview-container {
  .video-meta {
    display: flex;
    align-items: center;
  }
}
</style>
