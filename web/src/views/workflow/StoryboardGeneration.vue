<template>
  <div class="storyboard-generation">
    <el-empty description="分镜拆解功能开发中" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  dramaId: string
  episodeId: string
}>()

defineEmits<{
  storyboardGenerated: []
}>()
</script>

<style scoped lang="scss">
.storyboard-generation {
  padding: 24px;
}
</style>
