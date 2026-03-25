<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  User,
  ChevronDown,
  ChevronRight,
  ImagePlus,
  Sparkles,
  Loader2,
} from 'lucide-vue-next'
import type { Character } from '@/types/drama'

defineProps<{
  characters: Character[]
  expanded: boolean
  hasContent: boolean
}>()

const emit = defineEmits<{
  toggle: []
  generateImage: [id: number]
  batchGenerate: []
}>()

function statusLabel(status?: string) {
  switch (status) {
    case 'completed':
      return '已生成'
    case 'generating':
      return '生成中'
    case 'failed':
      return '失败'
    default:
      return '待生成'
  }
}

function statusVariant(status?: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default'
    case 'generating':
      return 'secondary'
    case 'failed':
      return 'destructive'
    default:
      return 'outline'
  }
}
</script>

<template>
  <div
    class="character-block"
    :class="{ 'is-disabled': !hasContent }"
  >
    <!-- Header -->
    <button class="block-header" @click="emit('toggle')">
      <div class="block-header__left">
        <component
          :is="expanded ? ChevronDown : ChevronRight"
          :size="14"
          class="block-header__chevron"
        />
        <User :size="14" class="block-header__icon" />
        <span class="block-header__title">角色</span>
      </div>
      <span v-if="hasContent && !expanded" class="block-header__count">
        ({{ characters.length }})
      </span>
    </button>

    <!-- Expanded -->
    <div v-if="expanded && hasContent" class="block-body">
      <div class="character-list">
        <div
          v-for="char in characters"
          :key="char.id"
          class="character-item"
        >
          <div class="character-avatar">
            <img
              v-if="char.image_url"
              :src="char.image_url"
              :alt="char.name"
              class="character-avatar__img"
            />
            <User v-else :size="16" class="character-avatar__placeholder" />
          </div>
          <div class="character-info">
            <span class="character-name">{{ char.name }}</span>
            <span v-if="char.role" class="character-role">{{ char.role }}</span>
          </div>
          <div class="character-actions">
            <Badge
              :variant="statusVariant(char.image_generation_status)"
              class="character-badge"
            >
              <Loader2
                v-if="char.image_generation_status === 'generating'"
                :size="10"
                class="animate-spin mr-1"
              />
              {{ statusLabel(char.image_generation_status) }}
            </Badge>
            <button
              v-if="char.image_generation_status !== 'completed' && char.image_generation_status !== 'generating'"
              class="gen-btn"
              title="生成形象"
              @click.stop="emit('generateImage', char.id)"
            >
              <ImagePlus :size="13" />
            </button>
          </div>
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        class="batch-btn"
        @click="emit('batchGenerate')"
      >
        <Sparkles :size="13" />
        批量生成形象
      </Button>
    </div>

    <div v-if="expanded && !hasContent" class="block-empty">
      请先提取角色
    </div>
  </div>
</template>

<style scoped>
.character-block {
  border-bottom: 1px solid var(--border-primary);
}

.is-disabled {
  opacity: 0.45;
  pointer-events: none;
}

.block-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-primary);
  transition: background var(--transition-fast);
}

.block-header:hover {
  background: var(--bg-card-hover);
}

.block-header__left {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.block-header__chevron {
  color: var(--text-muted);
  flex-shrink: 0;
}

.block-header__icon {
  color: var(--accent);
  flex-shrink: 0;
}

.block-header__title {
  white-space: nowrap;
}

.block-header__count {
  font-size: 11px;
  color: var(--text-secondary);
}

.block-body {
  padding: 0 12px 10px;
}

.block-empty {
  padding: 12px;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}

.character-list {
  max-height: 240px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.character-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-sm);
  transition: background var(--transition-fast);
}

.character-item:hover {
  background: var(--bg-card-hover);
}

.character-avatar {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}

.character-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.character-avatar__placeholder {
  color: var(--text-muted);
}

.character-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.character-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.character-role {
  font-size: 10px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.character-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.character-badge {
  font-size: 10px !important;
  padding: 1px 6px !important;
  height: auto !important;
}

.gen-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.gen-btn:hover {
  background: var(--bg-card-hover);
  color: var(--accent);
}

.batch-btn {
  width: 100%;
  margin-top: 6px;
  font-size: 11px !important;
  height: 28px !important;
  color: var(--text-secondary) !important;
}

.batch-btn:hover {
  color: var(--text-primary) !important;
}
</style>
