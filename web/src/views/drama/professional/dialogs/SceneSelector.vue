<template>
  <el-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" title="选择场景背景" width="800px">
    <div class="scene-selector-grid">
      <div
        v-for="scene in scenes"
        :key="scene.id"
        class="scene-card"
        :class="{ selected: currentSceneId === scene.id }"
        @click="$emit('select', Number(scene.id))"
      >
        <div class="scene-image">
          <img v-if="hasImage(scene)" :src="getImageUrl(scene)" :alt="scene.location" />
          <el-icon v-else :size="48" color="#ccc"><Picture /></el-icon>
        </div>
        <div class="scene-info">
          <div class="scene-location">{{ scene.location }}</div>
          <div class="scene-time">{{ scene.time }}</div>
        </div>
      </div>
      <div v-if="scenes.length === 0" class="empty-scenes">
        <el-empty description="暂无可用场景" />
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { Picture } from '@element-plus/icons-vue'
import { getImageUrl, hasImage } from '@/utils/image'

defineProps<{
  modelValue: boolean
  scenes: any[]
  currentSceneId?: string
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
  select: [sceneId: number]
}>()
</script>

<style scoped lang="scss">
.scene-selector-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 12px; max-height: 420px; overflow-y: auto; padding: 4px;
}
.scene-card {
  display: flex; flex-direction: column;
  border: 2px solid transparent; border-radius: 8px;
  overflow: hidden; cursor: pointer; transition: border-color 0.15s;
  &.selected { border-color: #409eff; }
  &:hover { border-color: #a0cfff; }

  .scene-image {
    height: 80px; background: #f0f0f0;
    display: flex; align-items: center; justify-content: center;
    img { width: 100%; height: 100%; object-fit: cover; }
  }
  .scene-info {
    padding: 6px 8px;
    .scene-location { font-size: 13px; font-weight: 500; }
    .scene-time { font-size: 11px; color: #909399; }
  }
}
.empty-scenes { grid-column: 1/-1; }
</style>
