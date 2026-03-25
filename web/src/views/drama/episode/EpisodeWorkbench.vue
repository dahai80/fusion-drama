<template>
  <div class="episode-workbench">
    <!-- Top bar -->
    <header class="wb-topbar">
      <div class="wb-topbar-left">
        <Button variant="ghost" size="sm" @click="goBack">
          <ArrowLeft :size="16" />
          返回
        </Button>
        <span class="wb-title">{{ resource.drama?.title }} - 第{{ episodeNumber }}集</span>
      </div>
      <div class="wb-topbar-right">
        <!-- Progress -->
        <div v-if="grid.progress.total > 0" class="wb-progress">
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
          </div>
          <span class="progress-label">{{ grid.progress.withImage }}/{{ grid.progress.total }}</span>
        </div>
        <Button variant="outline" size="sm" @click="agentOpen = true">
          <Wand2 :size="14" />
          Agent
        </Button>
        <Button size="sm" @click="goToCompose" class="compose-btn">
          合成
          <ArrowRight :size="14" />
        </Button>
      </div>
    </header>

    <!-- Main content -->
    <div class="wb-body">
      <ResourcePanel
        :resource="resource"
        @extract="handleExtract"
        @upload-script="handleUploadScript"
        @rewrite-script="handleRewriteScript"
        @generate-character-image="handleGenerateCharacterImage"
        @batch-generate-characters="handleBatchGenerateCharacters"
        @generate-scene-image="handleGenerateSceneImage"
        @batch-generate-scenes="handleBatchGenerateScenes"
      />

      <div class="wb-main">
        <!-- Stage: script only -->
        <div v-if="resource.pipelineStage === 'script'" class="wb-empty">
          <Clapperboard :size="48" :stroke-width="1" />
          <p>镜头工作区</p>
          <p class="wb-empty-hint">完成剧本 → 提取角色场景 → 拆解分镜后，镜头将在此展示</p>
        </div>

        <!-- Stage: extracted, waiting for storyboard -->
        <div v-else-if="resource.pipelineStage === 'extracted'" class="wb-empty">
          <Clapperboard :size="48" :stroke-width="1" />
          <p>角色和场景已就绪，可以拆解分镜了</p>
          <Button @click="handleBreakdown">
            <Wand2 :size="14" />
            Agent 拆解分镜
          </Button>
        </div>

        <!-- Stage: storyboards - grid mode -->
        <StoryboardGrid
          v-else-if="grid.viewMode === 'grid'"
          :storyboards="resource.storyboards"
          :progress="grid.progress"
          @select="grid.selectStoryboard"
          @add="handleAddStoryboard"
          @batch-generate-images="handleBatchImages"
          @batch-generate-videos="handleBatchVideos"
        />

        <!-- Stage: storyboards - edit mode -->
        <StoryboardEditor
          v-else
          :storyboards="resource.storyboards"
          :current-storyboard="grid.currentStoryboard"
          :current-id="grid.selectedStoryboardId"
          :characters="resource.characters"
          :scenes="resource.scenes"
          :images="imageGen.generatedImages"
          :video-url="currentVideoUrl"
          @select="grid.selectStoryboard"
          @back="grid.backToGrid"
          @add="handleAddStoryboard"
          @save-field="handleSaveField"
          @generate-image="handleGenerateImage"
          @generate-video="handleGenerateVideo"
        />
      </div>
    </div>

    <!-- Agent drawer -->
    <AgentDrawer
      v-model:open="agentOpen"
      :drama-id="dramaId"
      :episode-id="episodeNumber"
      @apply="handleAgentApply"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Wand2, Clapperboard } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import ResourcePanel from './workbench/ResourcePanel.vue'
import StoryboardGrid from './workbench/StoryboardGrid.vue'
import StoryboardEditor from './workbench/StoryboardEditor.vue'
import { useEpisodeWorkbench } from '@/composables/useEpisodeWorkbench'
import AgentDrawer from '@/components/agent/AgentDrawer.vue'
import type { AgentType } from '@/types/agent'

const router = useRouter()
const wb = useEpisodeWorkbench()
const { dramaId, episodeNumber } = wb
// Wrap in reactive so nested refs auto-unwrap in template
const resource = reactive(wb.resource)
const grid = reactive(wb.grid)
const imageGen = reactive(wb.imageGen)
const videoGen = reactive(wb.videoGen)

const agentOpen = ref(false)

const progressPct = computed(() => {
  const p = grid.progress
  return p.total > 0 ? Math.round((p.withImage / p.total) * 100) : 0
})

const currentVideoUrl = computed(() => {
  const videos = videoGen.generatedVideos
  const v = Array.isArray(videos) ? videos.find((v: any) => v.video_url) : null
  return v?.video_url || null
})

const goBack = () => router.push(`/drama/${dramaId}`)
const goToCompose = () => router.push(`/drama/${dramaId}/episode/${episodeNumber}/compose`)

// Action stubs (will be fully wired in later tasks)
const handleExtract = () => { /* TODO: call extract agent */ }
const handleBreakdown = () => { /* TODO: call storyboard_breaker agent */ }
const handleAddStoryboard = () => { /* TODO: call dramaAPI to add storyboard */ }
const handleBatchImages = () => { /* TODO: batch image generation */ }
const handleBatchVideos = () => { /* TODO: batch video generation */ }
const handleSaveField = (_field: string, _value: any) => { /* TODO: save via API */ }
const handleGenerateImage = () => { imageGen.generateFrameImage([]) }
const handleGenerateVideo = () => { videoGen.generateVideo() }
const handleUploadScript = () => { /* TODO: upload script */ }
const handleRewriteScript = () => { /* TODO: rewrite script */ }
const handleGenerateCharacterImage = (_id: number) => { /* TODO: generate character image */ }
const handleBatchGenerateCharacters = () => { /* TODO: batch generate characters */ }
const handleGenerateSceneImage = (_id: number) => { /* TODO: generate scene image */ }
const handleBatchGenerateScenes = () => { /* TODO: batch generate scenes */ }
const handleAgentApply = (_data: { type: AgentType; content: string }) => {
  /* TODO: map agent results to workbench actions based on _data.type */
}
</script>

<style scoped>
.episode-workbench {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-primary);
}

.wb-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-card);
}

.wb-topbar-left,
.wb-topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wb-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.wb-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.wb-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wb-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-muted);
}

.wb-empty-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.wb-progress {
  display: flex;
  align-items: center;
  gap: 6px;
}

.progress-track {
  width: 80px;
  height: 4px;
  background: var(--border-primary);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent, #e8a243), var(--glass-accent-to, #f0c060));
  border-radius: 2px;
  transition: width 400ms ease;
}

.progress-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
}

.compose-btn {
  background: linear-gradient(135deg, var(--accent, #e8a243), var(--glass-accent-to, #f0c060));
  color: var(--glass-text-on-accent, #1a1614);
  font-weight: 600;
  border: none;
}
</style>
