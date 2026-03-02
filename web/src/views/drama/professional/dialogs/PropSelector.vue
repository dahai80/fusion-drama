<template>
  <el-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" :title="$t('editor.addPropToShot')" width="800px">
    <div class="character-selector-grid">
      <div
        v-for="prop in props"
        :key="prop.id"
        class="character-card"
        :class="{ selected: isInCurrentShot(prop.id) }"
        @click="$emit('toggle', prop.id)"
      >
        <div class="character-avatar-large">
          <img v-if="prop.local_path" :src="getImageUrl(prop)" :alt="prop.name" />
          <el-icon v-else :size="32"><Box /></el-icon>
        </div>
        <div class="character-info">
          <div class="character-name">{{ prop.name }}</div>
          <div class="character-role">{{ prop.type || $t('editor.props') }}</div>
        </div>
        <div class="character-check" v-if="isInCurrentShot(prop.id)">
          <el-icon color="#409eff" :size="24"><Check /></el-icon>
        </div>
      </div>
      <div v-if="props.length === 0" class="empty-characters">
        <el-empty :description="$t('editor.noPropsAvailable')" />
      </div>
    </div>
    <template #footer>
      <el-button @click="$emit('update:modelValue', false)">{{ $t('common.close') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { Check, Box } from '@element-plus/icons-vue'
import { getImageUrl } from '@/utils/image'

defineProps<{
  modelValue: boolean
  props: any[]
  isInCurrentShot: (id: number) => boolean
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
  toggle: [propId: number]
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
