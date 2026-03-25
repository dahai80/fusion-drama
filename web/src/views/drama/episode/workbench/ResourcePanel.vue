<script setup lang="ts">
import ScriptBlock from './ScriptBlock.vue'
import CharacterBlock from './CharacterBlock.vue'
import SceneBlock from './SceneBlock.vue'
import type { useResourcePanel } from '@/composables/useResourcePanel'

const props = defineProps<{
  resource: ReturnType<typeof useResourcePanel>
}>()

defineEmits<{
  extract: []
  uploadScript: []
  rewriteScript: []
  generateCharacterImage: [id: number]
  batchGenerateCharacters: []
  generateSceneImage: [id: number]
  batchGenerateScenes: []
}>()
</script>

<template>
  <aside class="resource-panel">
    <ScriptBlock
      :script-content="resource.scriptContent"
      :expanded="resource.expandedBlock === 'script'"
      :has-content="resource.hasScript"
      @toggle="resource.toggleBlock('script')"
      @save="resource.saveScript"
      @extract="$emit('extract')"
      @upload="$emit('uploadScript')"
      @rewrite="$emit('rewriteScript')"
    />
    <CharacterBlock
      :characters="resource.characters"
      :expanded="resource.expandedBlock === 'characters'"
      :has-content="resource.hasCharacters"
      @toggle="resource.toggleBlock('characters')"
      @generate-image="$emit('generateCharacterImage', $event)"
      @batch-generate="$emit('batchGenerateCharacters')"
    />
    <SceneBlock
      :scenes="resource.scenes"
      :expanded="resource.expandedBlock === 'scenes'"
      :has-content="resource.hasScenes"
      @toggle="resource.toggleBlock('scenes')"
      @generate-image="$emit('generateSceneImage', $event)"
      @batch-generate="$emit('batchGenerateScenes')"
    />
  </aside>
</template>

<style scoped>
.resource-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-card);
  border-right: 1px solid var(--border-primary);
  overflow-y: auto;
}
</style>
