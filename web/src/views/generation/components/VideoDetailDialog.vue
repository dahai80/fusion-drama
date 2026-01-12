<template>
  <el-dialog
    v-model="visible"
    title="视频详情"
    width="1000px"
    @close="handleClose"
  >
    <div v-if="video" class="video-detail">
      <el-row :gutter="20">
        <el-col :span="16">
          <div class="video-preview">
            <video
              v-if="video.status === 'completed' && video.video_url"
              :src="video.video_url"
              class="preview-video"
              controls
              autoplay
              loop
              :poster="video.first_frame_url"
            >
              您的浏览器不支持视频播放
            </video>

            <div v-else-if="video.status === 'processing'" class="video-status">
              <el-icon class="loading-icon"><Loading /></el-icon>
              <span>生成中，请稍候...</span>
              <div class="status-message">预计需要 1-3 分钟</div>
            </div>

            <div v-else-if="video.status === 'failed'" class="video-status error">
              <el-icon><CircleClose /></el-icon>
              <span>生成失败</span>
              <div class="error-message">{{ video.error_msg }}</div>
            </div>

            <div v-else class="video-status">
              <el-icon><VideoCamera /></el-icon>
              <span>等待生成</span>
            </div>
          </div>
        </el-col>

        <el-col :span="8">
          <div class="video-info">
            <el-descriptions :column="1" border>
              <el-descriptions-item label="状态">
                <el-tag :type="getStatusType(video.status)">
                  {{ getStatusText(video.status) }}
                </el-tag>
              </el-descriptions-item>

              <el-descriptions-item label="AI 服务">
                {{ video.provider }}
              </el-descriptions-item>

              <el-descriptions-item label="模型" v-if="video.model">
                {{ video.model }}
              </el-descriptions-item>

              <el-descriptions-item label="时长" v-if="video.duration">
                {{ video.duration }} 秒
              </el-descriptions-item>

              <el-descriptions-item label="宽高比" v-if="video.aspect_ratio">
                {{ video.aspect_ratio }}
              </el-descriptions-item>

              <el-descriptions-item label="分辨率" v-if="video.width && video.height">
                {{ video.width }} × {{ video.height }}
              </el-descriptions-item>

              <el-descriptions-item label="FPS" v-if="video.fps">
                {{ video.fps }}
              </el-descriptions-item>

              <el-descriptions-item label="运动强度" v-if="video.motion_level !== undefined">
                {{ video.motion_level }}
              </el-descriptions-item>

              <el-descriptions-item label="镜头运动" v-if="video.camera_motion">
                {{ getCameraMotionText(video.camera_motion) }}
              </el-descriptions-item>

              <el-descriptions-item label="风格" v-if="video.style">
                {{ video.style }}
              </el-descriptions-item>

              <el-descriptions-item label="随机种子" v-if="video.seed">
                {{ video.seed }}
              </el-descriptions-item>

              <el-descriptions-item label="创建时间">
                {{ formatDateTime(video.created_at) }}
              </el-descriptions-item>

              <el-descriptions-item label="完成时间" v-if="video.completed_at">
                {{ formatDateTime(video.completed_at) }}
              </el-descriptions-item>
            </el-descriptions>

            <el-divider />

            <div class="prompt-section">
              <h4>视频提示词</h4>
              <div class="prompt-text">{{ video.prompt }}</div>
            </div>

            <div v-if="video.image_url" class="image-section">
              <h4>源图片</h4>
              <el-image
                :src="video.image_url"
                fit="contain"
                class="source-image"
                :preview-src-list="[video.image_url]"
              />
            </div>
          </div>
        </el-col>
      </el-row>
    </div>

    <template #footer>
      <el-button @click="handleClose">关闭</el-button>
      <el-button
        v-if="video?.status === 'completed' && video?.video_url"
        type="primary"
        @click="downloadVideo"
      >
        <el-icon><Download /></el-icon>
        下载视频
      </el-button>
      <el-button
        v-if="video?.status === 'completed'"
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
  VideoCamera, Loading, CircleClose,
  Download, Refresh
} from '@element-plus/icons-vue'
import type { VideoGeneration, VideoStatus } from '@/types/video'
import { CAMERA_MOTIONS } from '@/types/video'

interface Props {
  modelValue: boolean
  video?: VideoGeneration
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  regenerate: [video: VideoGeneration]
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const getStatusType = (status: VideoStatus) => {
  const types: Record<VideoStatus, any> = {
    pending: 'info',
    processing: 'warning',
    completed: 'success',
    failed: 'danger'
  }
  return types[status]
}

const getStatusText = (status: VideoStatus) => {
  const texts: Record<VideoStatus, string> = {
    pending: '等待中',
    processing: '生成中',
    completed: '已完成',
    failed: '失败'
  }
  return texts[status]
}

const getCameraMotionText = (motion: string) => {
  const item = CAMERA_MOTIONS.find(m => m.value === motion)
  return item ? item.label : motion
}

const formatDateTime = (dateString: string) => {
  return new Date(dateString).toLocaleString('zh-CN')
}

const downloadVideo = () => {
  if (!props.video?.video_url) return
  window.open(props.video.video_url, '_blank')
}

const regenerate = () => {
  if (!props.video) return
  emit('regenerate', props.video)
  handleClose()
}

const handleClose = () => {
  visible.value = false
}
</script>

<style scoped>
.video-detail {
  min-height: 500px;
}

.video-preview {
  width: 100%;
  height: 600px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  border-radius: 8px;
  overflow: hidden;
}

.preview-video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.video-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #909399;
}

.video-status .el-icon {
  font-size: 64px;
}

.video-status.error {
  color: #f56c6c;
}

.loading-icon {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.status-message {
  font-size: 12px;
  color: #999;
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

.video-info {
  height: 600px;
  overflow-y: auto;
}

.prompt-section,
.image-section {
  margin-bottom: 20px;
}

.prompt-section h4,
.image-section h4 {
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

.source-image {
  width: 100%;
  border-radius: 4px;
}
</style>
