<template>
  <!-- Drama Create Page / 创建短剧页面 -->
  <div class="drama-create animate-fade-in">
    <PageHeader
      :title="$t('drama.createNew')"
      :subtitle="$t('drama.createDesc')"
    >
      <template #actions>
        <Button variant="outline" @click="goBack">
          <ArrowLeft :size="16" class="mr-1" />
          {{ $t('common.back') }}
        </Button>
      </template>
    </PageHeader>

    <!-- Form Card / 表单卡片 -->
    <div class="form-card">
      <form class="create-form" @submit.prevent="handleSubmit">
        <div class="form-field">
          <label class="form-label">{{ $t('drama.projectName') }} <span class="required">*</span></label>
          <Input
            v-model="form.title"
            :placeholder="$t('drama.projectNamePlaceholder')"
            maxlength="100"
          />
        </div>

        <div class="form-field">
          <label class="form-label">{{ $t('drama.projectDesc') }}</label>
          <textarea
            v-model="form.description"
            class="glass-input-base form-textarea"
            :rows="5"
            :placeholder="$t('drama.projectDescPlaceholder')"
            maxlength="500"
          />
        </div>

        <div class="form-actions">
          <Button variant="outline" type="button" @click="goBack">{{ $t('common.cancel') }}</Button>
          <Button
            type="submit"
            :disabled="loading || !form.title.trim()"
          >
            <Loader2 v-if="loading" :size="16" class="animate-spin mr-1" />
            <Plus v-else :size="16" class="mr-1" />
            {{ $t('drama.create') }}
          </Button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { ArrowLeft, Plus, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { dramaAPI } from '@/api/drama'
import type { CreateDramaRequest } from '@/types/drama'
import { PageHeader } from '@/components/common'

const { t } = useI18n()
const router = useRouter()
const loading = ref(false)

const form = reactive<CreateDramaRequest>({
  title: '',
  description: ''
})

// Submit form / 提交表单
const handleSubmit = async () => {
  if (!form.title.trim()) {
    toast.warning(t('drama.validation.titleRequired'))
    return
  }

  loading.value = true
  try {
    const drama = await dramaAPI.create(form)
    toast.success(t('common.success'))
    router.push(`/dramas/${drama.id}`)
  } catch (error: any) {
    toast.error(error.message || t('common.failed'))
  } finally {
    loading.value = false
  }
}

// Go back / 返回上一页
const goBack = () => {
  router.back()
}
</script>

<style scoped>
.drama-create {
  max-width: 640px;
  margin: 0 auto;
}

.form-card {
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-xl);
  overflow: hidden;
  box-shadow: var(--shadow-card);
}

.create-form {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary);
}

.required {
  color: #ef4444;
}

.form-textarea {
  width: 100%;
  min-height: 120px;
  resize: none;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border-primary);
  margin-top: var(--space-2);
}

.mr-1 {
  margin-right: 0.25rem;
}
</style>
