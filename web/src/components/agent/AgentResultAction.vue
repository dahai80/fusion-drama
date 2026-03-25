<template>
  <Button
    variant="outline"
    size="sm"
    class="agent-apply-btn"
    @click="$emit('apply', { type: agentType, content })"
  >
    <Check :size="14" />
    应用结果
  </Button>
</template>

<script setup lang="ts">
import type { AgentType } from '@/types/agent'
import { Check } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'

defineProps<{
  agentType: AgentType
  content: string
}>()

defineEmits<{
  apply: [data: { type: AgentType; content: string }]
}>()
</script>

<style scoped>
.agent-apply-btn {
  margin-top: 6px;
  font-size: 12px;
}
</style>
