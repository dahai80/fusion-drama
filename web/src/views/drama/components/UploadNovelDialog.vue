<template>
  <Dialog :open="modelValue" @update:open="$emit('update:modelValue', $event)">
    <DialogContent class="sm:max-w-[500px]">
      <DialogHeader>
        <DialogTitle>{{ t('common.upload') }}</DialogTitle>
      </DialogHeader>
      <div class="space-y-4">
        <div>
          <label class="text-sm font-medium text-foreground">{{ t('common.upload') }}</label>
          <div class="mt-2">
            <input
              ref="fileInput"
              type="file"
              accept=".txt,.md"
              class="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              @change="handleFileChange"
            />
          </div>
        </div>
        <div v-if="fileName" class="text-sm text-muted-foreground">
          {{ fileName }}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" @click="$emit('update:modelValue', false)">
          {{ t('common.cancel') }}
        </Button>
        <Button @click="handleUpload" :disabled="!selectedFile || uploading">
          <Loader2 v-if="uploading" class="w-4 h-4 mr-1 animate-spin" />
          {{ t('common.confirm') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

const { t } = useI18n()

defineProps<{
  modelValue: boolean
  dramaId: number | string
  existingEpisodeCount: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'success'): void
}>()

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const fileName = ref('')
const uploading = ref(false)

const handleFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files[0]) {
    selectedFile.value = target.files[0]
    fileName.value = target.files[0].name
  }
}

const handleUpload = async () => {
  if (!selectedFile.value) return

  uploading.value = true
  try {
    // TODO: Implement novel upload API
    toast.info('Upload feature coming soon')
    emit('update:modelValue', false)
  } catch (error: any) {
    toast.error(error.message || 'Upload failed')
  } finally {
    uploading.value = false
  }
}
</script>
