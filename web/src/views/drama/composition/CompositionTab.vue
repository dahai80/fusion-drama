<template>
  <div class="composition-tab">
    <div v-if="loadingMerges" class="flex items-center justify-center py-8">
      <Loader2 class="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
    <div v-else-if="videoMerges.length === 0" class="empty-state">
      <Film class="w-8 h-8 text-muted-foreground" />
      <p class="text-sm text-muted-foreground mt-2">{{ t('editor.noCompositions') }}</p>
    </div>
    <div v-else class="merge-list">
      <div
        v-for="merge in videoMerges"
        :key="merge.id"
        class="merge-item"
      >
        <div class="merge-info">
          <div class="merge-status">
            <Badge :variant="merge.status === 'completed' ? 'default' : 'secondary'">
              {{ merge.status }}
            </Badge>
          </div>
          <div class="merge-date text-xs text-muted-foreground">
            {{ formatDate(merge.created_at) }}
          </div>
        </div>
        <div class="merge-actions" v-if="merge.status === 'completed'">
          <Button size="icon" variant="ghost" class="h-7 w-7" @click="$emit('preview', merge)">
            <Eye class="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" class="h-7 w-7" @click="$emit('download', merge)">
            <Download class="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" class="h-7 w-7" @click="$emit('delete', merge)">
            <Trash2 class="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Eye, Download, Trash2, Film, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const { t } = useI18n()

defineProps<{
  videoMerges: any[]
  loadingMerges: boolean
}>()

defineEmits<{
  (e: 'download', merge: any): void
  (e: 'preview', merge: any): void
  (e: 'delete', merge: any): void
}>()

const formatDate = (dateStr: string) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString()
}
</script>

<style scoped>
.composition-tab {
  padding: 8px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}

.merge-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.merge-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
}

.merge-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.merge-actions {
  display: flex;
  gap: 2px;
}
</style>
