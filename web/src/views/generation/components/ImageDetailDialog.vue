<template>
  <el-dialog
    v-model="visible"
    title="图片详情"
    width="900px"
    @close="handleClose"
  >
    <div v-if="image" class="image-detail">
      <el-row :gutter="20">
        <el-col :span="14">
          <div class="image-preview">
            <el-image
              v-if="image.status === 'completed' && image.image_url"
              :src="image.image_url"
              fit="contain"
              class="preview-image"
              :preview-src-list="[image.image_url]"
            >
              <template #error>
                <div class="image-error">
                  <el-icon><PictureFilled /></el-icon>
                  <span>加载失败</span>
                </div>
              </template>
            </el-image>

            <div v-else-if="image.status === 'processing'" class="image-status">
              <el-icon class="loading-icon"><Loading /></el-icon>
              <span>生成中，请稍候...</span>
            </div>

            <div v-else-if="image.status === 'failed'" class="image-status error">
              <el-icon><CircleClose /></el-icon>
              <span>生成失败</span>
              <div class="error-message">{{ image.error_msg }}</div>
            </div>
          </div>
        </el-col>

        <el-col :span="10">
          <div class="image-info">
            <el-descriptions :column="1" border>
              <el-descriptions-item label="状态">
                <el-tag :type="getStatusType(image.status)">
                  {{ getStatusText(image.status) }}
                </el-tag>
              </el-descriptions-item>

              <el-descriptions-item label="AI 服务">
                {{ image.provider }}
              </el-descriptions-item>

              <el-descriptions-item label="模型" v-if="image.model">
                {{ image.model }}
              </el-descriptions-item>

              <el-descriptions-item label="尺寸" v-if="image.size">
                {{ image.size }}
              </el-descriptions-item>

              <el-descriptions-item label="分辨率" v-if="image.width && image.height">
                {{ image.width }} × {{ image.height }}
              </el-descriptions-item>

              <el-descriptions-item label="质量" v-if="image.quality">
                {{ image.quality }}
              </el-descriptions-item>

              <el-descriptions-item label="风格" v-if="image.style">
                {{ image.style }}
              </el-descriptions-item>

              <el-descriptions-item label="采样步数" v-if="image.steps">
                {{ image.steps }}
              </el-descriptions-item>

              <el-descriptions-item label="CFG Scale" v-if="image.cfg_scale">
                {{ image.cfg_scale }}
              </el-descriptions-item>

              <el-descriptions-item label="随机种子" v-if="image.seed">
                {{ image.seed }}
              </el-descriptions-item>

              <el-descriptions-item label="创建时间">
                {{ formatDateTime(image.created_at) }}
              </el-descriptions-item>

              <el-descriptions-item label="完成时间" v-if="image.completed_at">
                {{ formatDateTime(image.completed_at) }}
              </el-descriptions-item>
            </el-descriptions>

            <el-divider />

            <div class="prompt-section">
              <h4>提示词</h4>
              <div class="prompt-text">{{ image.prompt }}</div>
            </div>

            <div v-if="image.negative_prompt" class="prompt-section">
              <h4>反向提示词</h4>
              <div class="prompt-text">{{ image.negative_prompt }}</div>
            </div>
          </div>
        </el-col>
      </el-row>
    </div>

    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
      <el-button
        v-if="image?.status === 'completed' && image?.image_url"
        type="primary"
        @click="downloadImage"
      >
        <el-icon><Download /></el-icon>
        下载图片
      </el-button>
      <el-button
        v-if="image?.status === 'completed'"
        type="success"
        @click="regenerate"
      >
        <el-icon><Refresh /></el-icon>
        重新生成
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import {
  PictureFilled, Loading, CircleClose,
  Download, Refresh
} from '@element-plus/icons-vue'
import { imageAPI } from '@/api/image'
import type { ImageGeneration, ImageStatus } from '@/types/image'

interface Props {
  modelValue: boolean
  image?: ImageGeneration
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  regenerate: [image: ImageGeneration]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const getStatusType = (status: ImageStatus) => {
  const types: Record<ImageStatus, any> = {
    pending: 'info',
    processing: 'warning',
    completed: 'success',
    failed: 'danger'
  }
  return types[status]
}

const getStatusText = (status: ImageStatus) => {
  const texts: Record<ImageStatus, string> = {
    pending: '等待中',
    processing: '生成中',
    completed: '已完成',
    failed: '失败'
  }
  return texts[status]
}

const formatDateTime = (dateString: string) => {
  return new Date(dateString).toLocaleString('zh-CN')
}

const downloadImage = () => {
  if (!props.image?.image_url) return
  window.open(props.image.image_url, '_blank')
}

const regenerate = () => {
  if (!props.image) return
  emit('regenerate', props.image)
  handleClose()
}

const handleClose = () => {
  visible.value = false
}
</script>

<style scoped>
.image-detail {
  min-height: 400px;
}

.image-preview {
  width: 100%;
  height: 600px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
  border-radius: 8px;
  overflow: hidden;
}

.preview-image {
  width: 100%;
  height: 100%;
}

.image-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #909399;
}

.image-status .el-icon {
  font-size: 64px;
}

.image-status.error {
  color: #f56c6c;
}

.loading-icon {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.error-message {
  margin-top: 8px;
  padding: 12px;
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 4px;
  font-size: 14px;
  color: #f56c6c;
  max-width: 300px;
  word-wrap: break-word;
}

.image-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: #909399;
}

.image-error .el-icon {
  font-size: 48px;
}

.image-info {
  height: 600px;
  overflow-y: auto;
}

.prompt-section {
  margin-bottom: 20px;
}

.prompt-section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.prompt-text {
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.6;
  color: #666;
  white-space: pre-wrap;
  word-wrap: break-word;
}
</style>
