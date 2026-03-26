<script setup lang="ts">
import { ref } from 'vue'
import { User, MapPin } from 'lucide-vue-next'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import CharacterBlock from './CharacterBlock.vue'
import SceneBlock from './SceneBlock.vue'
import type { Character, Scene } from '@/types/drama'

defineProps<{
  characters: Character[]
  scenes: Scene[]
  hasCharacters: boolean
  hasScenes: boolean
}>()

defineEmits<{
  generateCharacterImage: [id: number]
  batchGenerateCharacters: []
  generateSceneImage: [id: number]
  batchGenerateScenes: []
}>()

type PanelBlock = 'characters' | 'scenes' | null
const activeBlock = ref<PanelBlock>(null)

function toggleBlock(block: PanelBlock) {
  activeBlock.value = activeBlock.value === block ? null : block
}
</script>

<template>
  <aside class="resource-rail">
    <!-- Icon rail -->
    <div class="rail-icons">
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            class="rail-icon-btn"
            :class="{ active: activeBlock === 'characters' }"
            @click="toggleBlock('characters')"
          >
            <User :size="18" />
            <span v-if="hasCharacters" class="rail-dot" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">角色</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger as-child>
          <button
            class="rail-icon-btn"
            :class="{ active: activeBlock === 'scenes' }"
            @click="toggleBlock('scenes')"
          >
            <MapPin :size="18" />
            <span v-if="hasScenes" class="rail-dot" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">场景</TooltipContent>
      </Tooltip>
    </div>

    <!-- Expanded panel -->
    <div v-if="activeBlock" class="rail-panel">
      <CharacterBlock
        v-if="activeBlock === 'characters'"
        :characters="characters"
        :expanded="true"
        :has-content="hasCharacters"
        @toggle="toggleBlock(null)"
        @generate-image="$emit('generateCharacterImage', $event)"
        @batch-generate="$emit('batchGenerateCharacters')"
      />
      <SceneBlock
        v-if="activeBlock === 'scenes'"
        :scenes="scenes"
        :expanded="true"
        :has-content="hasScenes"
        @toggle="toggleBlock(null)"
        @generate-image="$emit('generateSceneImage', $event)"
        @batch-generate="$emit('batchGenerateScenes')"
      />
    </div>
  </aside>
</template>

<style scoped>
.resource-rail {
  display: flex;
  flex-shrink: 0;
  height: 100%;
  border-right: 1px solid var(--border-primary);
  background: var(--bg-card);
}

.rail-icons {
  width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 4px;
}

.rail-icon-btn {
  position: relative;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.rail-icon-btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.rail-icon-btn.active {
  background: rgba(232, 162, 67, 0.1);
  color: var(--accent, #e8a243);
}

.rail-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent, #e8a243);
}

.rail-panel {
  width: 260px;
  overflow-y: auto;
  border-left: 1px solid var(--border-primary);
}
</style>
