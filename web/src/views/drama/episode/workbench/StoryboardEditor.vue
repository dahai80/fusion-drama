<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-vue-next'
import type { Storyboard, Character, Scene } from '@/types/drama'
import type { ImageGeneration } from '@/types/image'
import StoryboardStrip from './StoryboardStrip.vue'
import PreviewPane from './PreviewPane.vue'
import PropertiesPanel from './PropertiesPanel.vue'

defineProps<{
  storyboards: Storyboard[]
  currentStoryboard: Storyboard | null
  currentId: string | null
  characters: Character[]
  scenes: Scene[]
  images: ImageGeneration[]
  videoUrl: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  back: []
  add: []
  saveField: [field: string, value: any]
  generateImage: []
  generateVideo: []
  showCharacterSelector: []
  showSceneSelector: []
}>()
</script>

<template>
  <div class="editor-root">
    <!-- Back button bar -->
    <div class="editor-topbar">
      <Button variant="ghost" size="sm" class="back-btn" @click="emit('back')">
        <ArrowLeft :size="14" />
        返回网格
      </Button>
      <span v-if="currentStoryboard" class="topbar-title">
        #{{ currentStoryboard.storyboard_number }}
        {{ currentStoryboard.title || '' }}
      </span>
    </div>

    <!-- Main three-column layout -->
    <div class="editor-body">
      <StoryboardStrip
        :storyboards="storyboards"
        :current-id="currentId"
        @select="emit('select', $event)"
        @add="emit('add')"
      />

      <PreviewPane
        :storyboard="currentStoryboard"
        :images="images"
        :video-url="videoUrl"
      />

      <PropertiesPanel
        :storyboard="currentStoryboard"
        :characters="characters"
        :scenes="scenes"
        @save-field="(f: string, v: any) => emit('saveField', f, v)"
        @generate-image="emit('generateImage')"
        @generate-video="emit('generateVideo')"
        @show-character-selector="emit('showCharacterSelector')"
        @show-scene-selector="emit('showSceneSelector')"
      />
    </div>
  </div>
</template>

<style scoped>
.editor-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.editor-topbar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 10px;
  border-bottom: 1px solid var(--border-primary, rgba(255, 255, 255, 0.06));
  background: var(--bg-secondary, rgba(0, 0, 0, 0.15));
  height: 36px;
}

.back-btn {
  font-size: 12px !important;
  height: 26px !important;
  padding: 0 8px !important;
  gap: 4px;
  color: var(--text-secondary, rgba(255, 255, 255, 0.55)) !important;
}

.back-btn:hover {
  color: var(--text-primary, rgba(255, 255, 255, 0.9)) !important;
}

.topbar-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary, rgba(255, 255, 255, 0.9));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: row;
}
</style>
