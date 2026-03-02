<template>
  <el-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" title="添加角色到镜头" width="800px">
    <div class="character-selector-grid">
      <div
        v-for="char in characters"
        :key="char.id"
        class="character-card"
        :class="{ selected: isInCurrentShot(char.id) }"
        @click="$emit('toggle', char.id)"
      >
        <div class="character-avatar-large">
          <img v-if="char.local_path" :src="getImageUrl(char)" :alt="char.name" />
          <span v-else>{{ char.name?.[0] || '?' }}</span>
        </div>
        <div class="character-info">
          <div class="character-name">{{ char.name }}</div>
          <div class="character-role">{{ char.role || '角色' }}</div>
        </div>
        <div class="character-check" v-if="isInCurrentShot(char.id)">
          <el-icon color="#409eff" :size="24"><Check /></el-icon>
        </div>
      </div>
      <div v-if="characters.length === 0" class="empty-characters">
        <el-empty description="暂无角色，请先在剧集中创建角色" />
      </div>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">关闭</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { Check } from '@element-plus/icons-vue'
import { getImageUrl } from '@/utils/image'

defineProps<{
  modelValue: boolean
  characters: any[]
  isInCurrentShot: (id: number) => boolean
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
  toggle: [charId: number]
}>()
</script>

<style scoped lang="scss">
.character-selector-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 12px; max-height: 420px; overflow-y: auto; padding: 4px;
}
.character-card {
  display: flex; flex-direction: column; align-items: center;
  gap: 6px; padding: 10px; border: 2px solid transparent;
  border-radius: 8px; cursor: pointer;
  transition: border-color 0.15s;
  &.selected { border-color: #409eff; background: #ecf5ff; }
  &:hover { border-color: #a0cfff; }

  .character-avatar-large {
    width: 64px; height: 64px; border-radius: 50%;
    overflow: hidden; background: #f0f0f0;
    display: flex; align-items: center; justify-content: center;
    img { width: 100%; height: 100%; object-fit: cover; }
    span { font-size: 22px; font-weight: 600; }
  }
  .character-info {
    text-align: center;
    .character-name { font-size: 13px; font-weight: 500; }
    .character-role { font-size: 11px; color: #909399; }
  }
  .character-check { margin-top: 4px; }
}
.empty-characters { grid-column: 1/-1; }
</style>
