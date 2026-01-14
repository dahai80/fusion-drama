<template>
  <!-- Drama Create Page / 创建短剧页面 -->
  <div class="page-container">
    <div class="content-wrapper animate-fade-in">
      <!-- Header / 头部 -->
      <PageHeader
        title="创建新项目"
        subtitle="填写基本信息来创建你的短剧项目"
        :show-back="true"
        back-text="返回"
        :show-border="false"
      />

      <!-- Form Card / 表单卡片 -->
      <div class="form-card">

        <el-form 
          ref="formRef" 
          :model="form" 
          :rules="rules" 
          label-position="top"
          class="create-form"
          @submit.prevent="handleSubmit"
        >
          <el-form-item label="项目标题" prop="title" required>
            <el-input 
              v-model="form.title" 
              placeholder="给你的短剧起个名字"
              size="large"
              maxlength="100"
              show-word-limit
            />
          </el-form-item>

          <el-form-item label="项目描述" prop="description">
            <el-input 
              v-model="form.description" 
              type="textarea" 
              :rows="5"
              placeholder="简要描述你的短剧内容、风格或创意（可选）"
              maxlength="500"
              show-word-limit
              resize="none"
            />
          </el-form-item>

          <div class="form-actions">
            <el-button size="large" @click="goBack">取消</el-button>
            <el-button 
              type="primary" 
              size="large"
              :loading="loading"
              @click="handleSubmit"
            >
              <el-icon v-if="!loading"><Plus /></el-icon>
              创建项目
            </el-button>
          </div>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { ArrowLeft, Plus } from '@element-plus/icons-vue'
import { dramaAPI } from '@/api/drama'
import type { CreateDramaRequest } from '@/types/drama'
import { PageHeader } from '@/components/common'

const router = useRouter()
const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive<CreateDramaRequest>({
  title: '',
  description: ''
})

const rules: FormRules = {
  title: [
    { required: true, message: '请输入项目标题', trigger: 'blur' },
    { min: 1, max: 100, message: '标题长度在 1 到 100 个字符', trigger: 'blur' }
  ]
}

// Submit form / 提交表单
const handleSubmit = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        const drama = await dramaAPI.create(form)
        ElMessage.success('创建成功')
        router.push(`/dramas/${drama.id}`)
      } catch (error: any) {
        ElMessage.error(error.message || '创建失败')
      } finally {
        loading.value = false
      }
    }
  })
}

// Go back / 返回上一页
const goBack = () => {
  router.back()
}
</script>

<style scoped>
/* ========================================
   Page Layout / 页面布局 - 紧凑边距
   ======================================== */
.page-container {
  min-height: 100vh;
  background-color: var(--bg-primary);
  padding: var(--space-2) var(--space-3);
  transition: background-color var(--transition-normal);
}

@media (min-width: 768px) {
  .page-container {
    padding: var(--space-3) var(--space-4);
  }
}

.content-wrapper {
  max-width: 640px;
  margin: 0 auto;
}

/* ========================================
   Form Card / 表单卡片
   ======================================== */
.form-card {
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--shadow-card);
}

/* ========================================
   Form Styles / 表单样式 - 紧凑内边距
   ======================================== */
.create-form {
  padding: var(--space-4);
}

.create-form :deep(.el-form-item) {
  margin-bottom: var(--space-4);
}

/* ========================================
   Form Actions / 表单操作区
   ======================================== */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-primary);
  margin-top: var(--space-2);
}

.form-actions .el-button {
  min-width: 100px;
}
</style>
