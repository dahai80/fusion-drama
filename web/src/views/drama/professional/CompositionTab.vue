<template>
  <div class="composition-tab" v-loading="loadingMerges">
    <el-empty v-if="videoMerges.length === 0" description="暂无合成记录" :image-size="60" />
    <div v-else class="merge-list-v2">
      <div v-for="merge in videoMerges" :key="merge.id" class="merge-item-v2" :class="'merge-' + merge.status">
        <div class="merge-item-header">
          <span class="merge-item-title">{{ merge.title }}</span>
          <el-tag
            :type="merge.status === 'completed' ? 'success' : merge.status === 'failed' ? 'danger' : 'warning'"
            size="small"
          >{{ merge.status === 'pending' ? '等待中' : merge.status === 'processing' ? '合成中' : merge.status === 'completed' ? '已完成' : '失败' }}</el-tag>
        </div>
        <div class="merge-item-actions">
          <el-button v-if="merge.status === 'completed' && merge.merged_url" type="primary" size="small" @click="$emit('download', merge.merged_url, merge.title)">下载</el-button>
          <el-button v-if="merge.status === 'completed' && merge.merged_url" size="small" @click="$emit('preview', merge.merged_url)">预览</el-button>
          <el-button type="danger" size="small" @click="$emit('delete', merge.id)">删除</el-button>
        </div>
        <div v-if="merge.status === 'failed' && merge.error_msg" class="merge-error-v2">{{ merge.error_msg }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { VideoMerge } from '@/api/videoMerge'

defineProps<{
  videoMerges: VideoMerge[]
  loadingMerges: boolean
}>()

defineEmits<{
  download: [url: string, title: string]
  preview: [url: string]
  delete: [mergeId: number]
}>()
</script>

<style scoped lang="scss">
.composition-tab {
  padding: 10px 12px;
}

.merge-list-v2 { display: flex; flex-direction: column; gap: 7px; }
.merge-item-v2 {
  border: 1px solid #e4e7ed; border-radius: 5px;
  padding: 9px; background: #fafafa;
  &.merge-completed { border-color: #b3e19d; background: #f0f9eb; }
  &.merge-processing { border-color: #fcd891; background: #fdf6ec; }
  &.merge-failed { border-color: #fbc4c4; background: #fef0f0; }

  .merge-item-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 7px;
    .merge-item-title { font-size: 13px; font-weight: 500; color: #303133; }
  }
  .merge-item-actions { display: flex; gap: 5px; flex-wrap: wrap; }
  .merge-error-v2 { margin-top: 5px; font-size: 11px; color: #f56c6c; }
}
</style>
