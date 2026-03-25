<template>
  <Select :model-value="modelValue" @update:model-value="(v) => $emit('update:modelValue', v as AgentType)">
    <SelectTrigger class="w-full">
      <SelectValue placeholder="选择 Agent 类型" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="opt in options" :key="opt.value" :value="opt.value">
        {{ opt.label }}
      </SelectItem>
    </SelectContent>
  </Select>
</template>

<script setup lang="ts">
import type { AgentType } from '@/types/agent'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

defineProps<{
  modelValue: AgentType
}>()

defineEmits<{
  'update:modelValue': [value: AgentType]
}>()

const options: { value: AgentType; label: string }[] = [
  { value: 'script_rewriter', label: '剧本改写' },
  { value: 'style_analyzer', label: '风格分析' },
  { value: 'extractor', label: '角色场景提取' },
  { value: 'voice_assigner', label: '声音分配' },
  { value: 'storyboard_breaker', label: '分镜拆解' },
  { value: 'prompt_generator', label: 'Prompt 生成' },
]
</script>
