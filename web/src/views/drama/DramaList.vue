<template>
  <div class="drama-list-container">
    <div class="page-header-wrapper">
      <div class="page-header">
        <div>
          <h2>{{ $t('drama.title') }}</h2>
          <p class="subtitle">{{ $t('drama.totalProjects', { count: total }) }}</p>
        </div>
        <div style="display: flex; gap: 12px; align-items: center;">
          <LanguageSwitcher />
          <el-alert
            type="info"
            :closable="false"
            show-icon
            style="padding: 8px 12px;"
          >
            <template #title>
              <span style="font-size: 13px;">{{ $t('drama.aiConfigTip') }}</span>
            </template>
          </el-alert>
          <el-button type="warning" @click="goToAIConfig" :icon="Setting">{{ $t('drama.aiConfig') }}</el-button>
          <el-button type="primary" @click="handleCreate" :icon="Plus">{{ $t('drama.createNew') }}</el-button>
        </div>
      </div>
    </div>

    <div v-loading="loading" class="dramas-grid">
      <el-empty v-if="!loading && dramas.length === 0" :description="$t('drama.empty')" />
      
      <el-card 
        v-for="drama in dramas" 
        :key="drama.id" 
        class="drama-card" 
        shadow="hover"
        @click="viewDrama(drama.id)"
      >
        <div class="drama-cover">
          <div class="cover-overlay"></div>
          <img v-if="drama.thumbnail" :src="drama.thumbnail" :alt="drama.title" />
          <div v-else class="cover-placeholder">
            <el-icon :size="64"><Film /></el-icon>
            <p>{{ $t('drama.noCover') }}</p>
          </div>
        </div>

        <div class="drama-info">
          <div class="info-header">
            <h3 class="drama-title">{{ drama.title }}</h3>
            <el-tag v-if="drama.genre" class="genre-tag" size="small">{{ drama.genre }}</el-tag>
          </div>
          
          <p class="drama-description">{{ drama.description || $t('drama.noDescription') }}</p>
          
          <div class="drama-footer">
            <div class="meta-info">
              <span class="meta-item">
                <el-icon><Clock /></el-icon>
                {{ formatDate(drama.updated_at) }}
              </span>
            </div>
            
            <div class="drama-actions" @click.stop>
              <el-button size="small" text @click="editDrama(drama.id)">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button size="small" text type="primary" @click="viewDrama(drama.id)">
                <el-icon><View /></el-icon>
              </el-button>
              <el-popconfirm
                :title="$t('drama.deleteConfirm')"
                @confirm="deleteDrama(drama.id)"
              >
                <template #reference>
                  <el-button size="small" text type="danger">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </template>
              </el-popconfirm>
            </div>
          </div>
        </div>
      </el-card>
    </div>

    <el-pagination
      v-if="total > 0"
      v-model:current-page="queryParams.page"
      v-model:page-size="queryParams.page_size"
      :total="total"
      :page-sizes="[12, 24, 36, 48]"
      layout="total, sizes, prev, pager, next, jumper"
      @size-change="loadDramas"
      @current-change="loadDramas"
    />

    <!-- 编辑对话框 -->
    <el-dialog
      v-model="editDialogVisible"
      title="编辑项目"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="editForm" label-width="80px" v-loading="editLoading">
        <el-form-item label="项目名称" required>
          <el-input v-model="editForm.title" placeholder="请输入项目名称" />
        </el-form-item>
        <el-form-item label="项目描述">
          <el-input
            v-model="editForm.description"
            type="textarea"
            :rows="4"
            placeholder="请输入项目描述"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveEdit" :loading="editLoading">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus, Clock, Film, Setting } from '@element-plus/icons-vue'
import { dramaAPI } from '@/api/drama'
import type { Drama, DramaListQuery, DramaStatus } from '@/types/drama'
import LanguageSwitcher from '@/components/LanguageSwitcher.vue'

const router = useRouter()
const loading = ref(false)
const dramas = ref<Drama[]>([])
const total = ref(0)

const queryParams = ref<DramaListQuery>({
  page: 1,
  page_size: 12
})

const loadDramas = async () => {
  loading.value = true
  try {
    const res = await dramaAPI.list(queryParams.value)
    dramas.value = res.items || []
    total.value = res.pagination?.total || 0
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

const handleCreate = () => {
  router.push('/dramas/create')
}

const goToAIConfig = () => {
  router.push('/settings/ai-config')
}

const viewDrama = (id: string) => {
  router.push(`/dramas/${id}`)
}

const editDialogVisible = ref(false)
const editLoading = ref(false)
const editForm = ref({
  id: '',
  title: '',
  description: ''
})

const editDrama = async (id: string) => {
  editLoading.value = true
  editDialogVisible.value = true
  try {
    const drama = await dramaAPI.get(id)
    editForm.value = {
      id: drama.id,
      title: drama.title,
      description: drama.description || ''
    }
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
    editDialogVisible.value = false
  } finally {
    editLoading.value = false
  }
}

const saveEdit = async () => {
  if (!editForm.value.title) {
    ElMessage.warning('请输入项目名称')
    return
  }
  
  editLoading.value = true
  try {
    await dramaAPI.update(editForm.value.id, {
      title: editForm.value.title,
      description: editForm.value.description
    })
    ElMessage.success('保存成功')
    editDialogVisible.value = false
    loadDramas()
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    editLoading.value = false
  }
}

const deleteDrama = async (id: string) => {
  try {
    await dramaAPI.delete(id)
    ElMessage.success('删除成功')
    loadDramas()
  } catch (error: any) {
    ElMessage.error(error.message || '删除失败')
  }
}


const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString()
}

onMounted(() => {
  loadDramas()
})
</script>

<style scoped>
.drama-list-container {
  min-height: 100vh;
  background: #f5f5f5;
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.page-header-wrapper {
  margin-bottom: 32px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 0;
}

.page-header h2 {
  margin: 0 0 8px 0;
  font-size: 28px;
  font-weight: 600;
  color: #303133;
  letter-spacing: -0.5px;
}

.subtitle {
  margin: 0;
  color: #64748b;
  font-size: 15px;
  font-weight: 500;
}

.dramas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
  min-height: 400px;
}

.drama-card {
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 8px;
  overflow: hidden;
  background: white;
  border: 1px solid #e8e8e8;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.drama-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  border-color: #409eff;
}

.drama-cover {
  position: relative;
  width: 100%;
  height: 180px;
  overflow: hidden;
  background: linear-gradient(135deg, #409eff 0%, #66b1ff 100%);
}

.cover-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.2) 100%);
  opacity: 0;
  transition: opacity 0.2s ease;
  z-index: 1;
}

.drama-card:hover .cover-overlay {
  opacity: 1;
}

.drama-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.drama-card:hover .drama-cover img {
  transform: scale(1.05);
}

.cover-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: white;
  opacity: 0.8;
}

.cover-placeholder p {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
}

.drama-info {
  padding: 20px;
}

.info-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.drama-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: -0.3px;
  flex: 1;
}

.genre-tag {
  background: #409eff;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 2px 8px;
  font-weight: 500;
  font-size: 11px;
  flex-shrink: 0;
}

.drama-description {
  margin: 0 0 16px 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.6;
  height: 42px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.drama-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid #e0e0e0;
}

.meta-info {
  flex: 1;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

.meta-item .el-icon {
  font-size: 14px;
}

.drama-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.drama-actions .el-button {
  padding: 6px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.drama-actions .el-button:hover {
  background: #f0f0f0;
}

.drama-actions .el-button.is-text[type="primary"]:hover {
  background: #ecf5ff;
  color: #409eff;
}

.drama-actions .el-button.is-text[type="danger"]:hover {
  background: #fef0f0;
  color: #f56c6c;
}


.pagination {
  display: flex;
  justify-content: center;
  margin-top: 32px;
  padding: 20px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e4e7ed;
}
</style>
