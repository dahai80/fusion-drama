<template>
  <!-- Create Drama Dialog / 创建短剧弹窗 -->
  <Dialog v-model:open="visible">
    <DialogContent class="sm:max-w-[520px]">
      <DialogHeader>
        <DialogTitle>{{ $t('drama.createNew') }}</DialogTitle>
      </DialogHeader>

      <div class="dialog-desc">{{ $t("drama.createDesc") }}</div>

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
            :rows="4"
            :placeholder="$t('drama.projectDescPlaceholder')"
            maxlength="500"
          />
        </div>

        <div class="form-field">
          <label class="form-label">{{ $t('drama.style') }} <span class="required">*</span></label>
          <Select v-model="form.style">
            <SelectTrigger>
              <SelectValue :placeholder="$t('drama.stylePlaceholder')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ghibli">{{ $t('drama.styles.ghibli') }}</SelectItem>
              <SelectItem value="guoman">{{ $t('drama.styles.guoman') }}</SelectItem>
              <SelectItem value="wasteland">{{ $t('drama.styles.wasteland') }}</SelectItem>
              <SelectItem value="nostalgia">{{ $t('drama.styles.nostalgia') }}</SelectItem>
              <SelectItem value="pixel">{{ $t('drama.styles.pixel') }}</SelectItem>
              <SelectItem value="voxel">{{ $t('drama.styles.voxel') }}</SelectItem>
              <SelectItem value="urban">{{ $t('drama.styles.urban') }}</SelectItem>
              <SelectItem value="guoman3d">{{ $t('drama.styles.guoman3d') }}</SelectItem>
              <SelectItem value="chibi3d">{{ $t('drama.styles.chibi3d') }}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </form>

      <DialogFooter>
        <Button variant="outline" @click="handleClose">
          {{ $t("common.cancel") }}
        </Button>
        <Button
          :disabled="loading || !form.title.trim()"
          @click="handleSubmit"
        >
          <Loader2 v-if="loading" :size="16" class="animate-spin mr-2" />
          <Plus v-else :size="16" class="mr-2" />
          {{ $t("drama.createNew") }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { toast } from 'vue-sonner'
import { Plus, Loader2 } from "lucide-vue-next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { dramaAPI } from "@/api/drama";
import type { CreateDramaRequest } from "@/types/drama";

/**
 * CreateDramaDialog - Reusable dialog for creating new drama projects
 * 创建短剧弹窗 - 可复用的创建短剧项目弹窗
 */
const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  created: [id: string];
}>();

const router = useRouter();
const loading = ref(false);

// v-model binding / 双向绑定
const visible = ref(props.modelValue);
watch(
  () => props.modelValue,
  (val) => {
    visible.value = val;
  },
);
watch(visible, (val) => {
  emit("update:modelValue", val);
  if (!val) {
    // Reset form when dialog closes
    form.title = "";
    form.description = "";
    form.style = "ghibli";
  }
});

// Form data / 表单数据
const form = reactive<CreateDramaRequest>({
  title: "",
  description: "",
  style: "ghibli",
});

// Close dialog / 关闭弹窗
const handleClose = () => {
  visible.value = false;
};

// Submit form / 提交表单
const handleSubmit = async () => {
  if (!form.title.trim()) {
    toast.warning("请输入项目标题");
    return;
  }

  loading.value = true;
  try {
    const drama = await dramaAPI.create(form);
    toast.success("创建成功");
    visible.value = false;
    emit("created", drama.id);
    // Navigate to drama detail page / 跳转到短剧详情页
    router.push(`/dramas/${drama.id}`);
  } catch (error: any) {
    toast.error(error.message || "创建失败");
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.dialog-desc {
  margin-bottom: 1.5rem;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.create-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
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
  min-height: 100px;
  resize: none;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
}

.mr-2 {
  margin-right: 0.5rem;
}
</style>
