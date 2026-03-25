<template>
  <slot v-if="!error" />
  <div v-else class="error-boundary">
    <div class="error-boundary__content">
      <AlertTriangle :size="48" style="color: var(--error)" />
      <h3>{{ $t('common.error') }}</h3>
      <p>{{ error.message }}</p>
      <Button @click="reset">{{ $t('common.reset') }}</Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

const error = ref<Error | null>(null)

onErrorCaptured((err: Error) => {
  error.value = err
  return false
})

function reset() {
  error.value = null
}
</script>

<style scoped>
.error-boundary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 2rem;
}

.error-boundary__content {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.error-boundary__content h3 {
  color: var(--text-primary);
  margin: 0;
}

.error-boundary__content p {
  color: var(--text-secondary);
  margin: 0;
}
</style>
