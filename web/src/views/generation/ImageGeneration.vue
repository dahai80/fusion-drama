<template>
  <div class="image-generation-container">
    <el-page-header @back="goBack" class="page-header">
      <template #content>
        <div class="header-content">
          <h2>{{ $t('image.title') }}</h2>
        </div>
      </template>
      <template #extra>
        <el-button type="primary" @click="showGenerateDialog = true">
          <el-icon><Plus /></el-icon>
          {{ $t('image.generate') }}
        </el-button>
      </template>
    </el-page-header>

    <el-card shadow="never" class="filter-card">
      <el-form inline>
        <el-form-item :label="$t('video.filter.drama')">
          <el-select v-model="filters.drama_id" :placeholder="$t('video.filter.allDramas')" clearable>
            <el-option
              v-for="drama in dramas"
              :key="drama.id"
              :label="drama.title"
              :value="drama.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item :label="$t('video.filter.status')">
          <el-select v-model="filters.status" :placeholder="$t('video.filter.allStatus')" clearable>
            <el-option :label="$t('video.status.processing')" value="processing" />
            <el-option :label="$t('video.status.completed')" value="completed" />
            <el-option :label="$t('video.status.failed')" value="failed" />
          </el-select>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="loadImages">{{ $t('video.filter.query') }}</el-button>
          <el-button @click="resetFilters">{{ $t('video.filter.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-row :gutter="16" v-loading="loading">
      <el-col
        v-for="image in images"
        :key="image.id"
        :xs="24"
        :sm="12"
        :md="8"
        :lg="6"
      >
        <el-card class="image-card" shadow="hover">
          <div class="image-wrapper">
            <el-image
              v-if="image.status === 'completed' && image.image_url"
              :src="image.image_url"
              fit="cover"
              class="image"
              :preview-src-list="[image.image_url]"
            >
              <template #error>
                <div class="image-placeholder">
                  <el-icon><PictureFilled /></el-icon>
                  <span>{{ $t('image.loadFailed') }}</span>
                </div>
              </template>
            </el-image>

            <div v-else-if="image.status === 'processing'" class="image-placeholder processing">
              <el-icon class="loading-icon"><Loading /></el-icon>
              <span>{{ $t('image.generating') }}</span>
            </div>

            <div v-else-if="image.status === 'failed'" class="image-placeholder failed">
              <el-icon><CircleClose /></el-icon>
              <span>{{ $t('image.generateFailed') }}</span>
            </div>

            <div v-else class="image-placeholder">
              <el-icon><Picture /></el-icon>
              <span>等待生成</span>
            </div>

            <div class="image-overlay">
              <el-tag :type="getStatusType(image.status)" size="small">
                {{ getStatusText(image.status) }}
              </el-tag>
            </div>
          </div>

          <div class="image-info">
            <div class="prompt-text">{{ truncateText(image.prompt, 60) }}</div>
            <div class="meta-info">
              <span class="provider-tag">
                <el-tag size="small" effect="plain">{{ image.provider }}</el-tag>
              </span>
              <span class="time-text">{{ formatTime(image.created_at) }}</span>
            </div>
          </div>

          <template #footer>
            <div class="card-actions">
              <el-button text size="small" @click="viewDetails(image)">
                <el-icon><View /></el-icon>
                查看
              </el-button>
              <el-button
                v-if="image.status === 'completed'"
                text
                size="small"
                @click="downloadImage(image)"
              >
                <el-icon><Download /></el-icon>
                下载
              </el-button>
              <el-popconfirm
                title="确定删除该图片吗？"
                @confirm="deleteImage(image.id)"
              >
                <template #reference>
                  <el-button text size="small" type="danger">
                    <el-icon><Delete /></el-icon>
                    删除
                  </el-button>
                </template>
              </el-popconfirm>
            </div>
          </template>
        </el-card>
      </el-col>
    </el-row>

    <el-empty v-if="!loading && images.length === 0" description="暂无图片，开始生成吧！" />

    <el-pagination
      v-if="total > 0"
      v-model:current-page="pagination.page"
      v-model:page-size="pagination.page_size"
      :total="total"
      :page-sizes="[12, 24, 36, 48]"
      layout="total, sizes, prev, pager, next, jumper"
      @current-change="loadImages"
      @size-change="loadImages"
      class="pagination"
    />

    <GenerateImageDialog
      v-model="showGenerateDialog"
      :drama-id="filters.drama_id"
      @success="loadImages"
    />

    <ImageDetailDialog
      v-model="showDetailDialog"
      :image="selectedImage"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Plus, Picture, PictureFilled, Loading, CircleClose,
  View, Download, Delete
} from '@element-plus/icons-vue'
import { imageAPI } from '@/api/image'
import { dramaAPI } from '@/api/drama'
import type { ImageGeneration, ImageStatus } from '@/types/image'
import type { Drama } from '@/types/drama'
import GenerateImageDialog from './components/GenerateImageDialog.vue'
import ImageDetailDialog from './components/ImageDetailDialog.vue'

const route = useRoute()
const router = useRouter()

const loading = ref(false)
const images = ref<ImageGeneration[]>([])
const dramas = ref<Drama[]>([])
const total = ref(0)
const showGenerateDialog = ref(false)
const showDetailDialog = ref(false)
const selectedImage = ref<ImageGeneration>()

const filters = reactive({
  drama_id: undefined as string | undefined,
  status: undefined as ImageStatus | undefined
})

const pagination = reactive({
  page: 1,
  page_size: 12
})

const loadImages = async () => {
  loading.value = true
  try {
    const result = await imageAPI.listImages({
      drama_id: filters.drama_id,
      status: filters.status,
      page: pagination.page,
      page_size: pagination.page_size
    })
    images.value = result.items
    total.value = result.pagination.total
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const loadDramas = async () => {
  try {
    const result = await dramaAPI.list({ page: 1, page_size: 100 })
    dramas.value = result.items
  } catch (error: any) {
    console.error('Failed to load dramas:', error)
  }
}

const resetFilters = () => {
  filters.drama_id = undefined
  filters.status = undefined
  pagination.page = 1
  loadImages()
}

const viewDetails = (image: ImageGeneration) => {
  selectedImage.value = image
  showDetailDialog.value = true
}

const downloadImage = (image: ImageGeneration) => {
  if (!image.image_url) return
  window.open(image.image_url, '_blank')
}

const deleteImage = async (id: number) => {
  try {
    await imageAPI.deleteImage(id)
    ElMessage.success('删除成功')
    loadImages()
  } catch (error: any) {
    ElMessage.error(error.message || '删除失败')
  }
}

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

const truncateText = (text: string, length: number) => {
  if (text.length <= length) return text
  return text.substring(0, length) + '...'
}

const formatTime = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`
  return date.toLocaleDateString('zh-CN')
}

const goBack = () => {
  router.back()
}

onMounted(() => {
  const dramaId = route.query.drama_id as string
  if (dramaId) {
    filters.drama_id = dramaId
  }
  
  loadDramas()
  loadImages()
  
  const interval = setInterval(() => {
    const hasProcessing = images.value.some(img => img.status === 'processing')
    if (hasProcessing) {
      loadImages()
    }
  }, 5000)
  
  return () => clearInterval(interval)
})
</script>

<style scoped>
.image-generation-container {
  padding: 24px;
  max-width: 1600px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: 20px;
}

.header-content h2 {
  margin: 0;
  font-size: 24px;
}

.filter-card {
  margin-bottom: 20px;
}

.image-card {
  margin-bottom: 16px;
  transition: all 0.3s;
}

.image-card:hover {
  transform: translateY(-4px);
}

.image-wrapper {
  position: relative;
  width: 100%;
  padding-bottom: 100%;
  overflow: hidden;
  border-radius: 8px;
  background: #f5f7fa;
}

.image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.image-placeholder {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #909399;
  font-size: 14px;
}

.image-placeholder .el-icon {
  font-size: 48px;
  margin-bottom: 8px;
}

.image-placeholder.processing {
  color: #e6a23c;
}

.image-placeholder.failed {
  color: #f56c6c;
}

.loading-icon {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.image-overlay {
  position: absolute;
  top: 8px;
  right: 8px;
}

.image-info {
  padding: 12px 0;
}

.prompt-text {
  font-size: 14px;
  color: #333;
  margin-bottom: 8px;
  line-height: 1.5;
  min-height: 42px;
}

.meta-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #909399;
}

.card-actions {
  display: flex;
  justify-content: space-around;
  gap: 8px;
}

.pagination {
  margin-top: 24px;
  display: flex;
  justify-content: center;
}
</style>
