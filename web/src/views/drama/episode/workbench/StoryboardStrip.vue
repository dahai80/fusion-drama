<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import type { Storyboard } from '@/types/drama'
import { getImageUrl } from '@/utils/image'

defineProps<{
  storyboards: Storyboard[]
  currentId: string | null
}>()

const emit = defineEmits<{
  select: [id: string]
  add: []
}>()

function thumbnailFor(sb: Storyboard): string {
  return getImageUrl(sb)
}
</script>

<template>
  <div class="strip-root">
    <ScrollArea class="strip-scroll">
      <div class="strip-list">
        <div
          v-for="(sb, idx) in storyboards"
          :key="sb.id"
          class="strip-item"
          :class="{ 'strip-item--active': sb.id === currentId }"
          @click="emit('select', sb.id)"
        >
          <div class="strip-thumb">
            <img
              v-if="thumbnailFor(sb)"
              :src="thumbnailFor(sb)"
              :alt="`#${idx + 1}`"
              class="strip-thumb__img"
            />
            <div v-else class="strip-thumb__empty">
              {{ idx + 1 }}
            </div>
          </div>
          <span class="strip-num">#{{ idx + 1 }}</span>
        </div>
      </div>
    </ScrollArea>

    <div class="strip-footer">
      <Button variant="ghost" size="sm" class="strip-add-btn" @click="emit('add')">
        <Plus :size="14" />
      </Button>
    </div>
  </div>
</template>

<style scoped>
.strip-root {
  width: 80px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-primary, rgba(255, 255, 255, 0.06));
  background: var(--bg-secondary, rgba(0, 0, 0, 0.15));
}

.strip-scroll {
  flex: 1;
  min-height: 0;
}

.strip-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
}

.strip-item {
  position: relative;
  width: 64px;
  cursor: pointer;
  border-radius: 6px;
  border: 1.5px solid transparent;
  overflow: hidden;
  transition: border-color 0.15s ease;
}

.strip-item:hover {
  border-color: rgba(255, 255, 255, 0.15);
}

.strip-item--active {
  border-color: var(--accent, #e8a243);
  box-shadow: 0 0 0 1px var(--accent, #e8a243);
}

.strip-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--bg-primary, rgba(0, 0, 0, 0.2));
  overflow: hidden;
}

.strip-thumb__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.strip-thumb__empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted, rgba(255, 255, 255, 0.3));
}

.strip-num {
  display: block;
  text-align: center;
  font-size: 9px;
  font-weight: 500;
  color: var(--text-secondary, rgba(255, 255, 255, 0.55));
  padding: 2px 0;
}

.strip-footer {
  flex-shrink: 0;
  padding: 6px;
  border-top: 1px solid var(--border-primary, rgba(255, 255, 255, 0.06));
  display: flex;
  justify-content: center;
}

.strip-add-btn {
  width: 32px !important;
  height: 32px !important;
  padding: 0 !important;
  color: var(--text-secondary, rgba(255, 255, 255, 0.55)) !important;
}

.strip-add-btn:hover {
  color: var(--text-primary, rgba(255, 255, 255, 0.9)) !important;
}
</style>
