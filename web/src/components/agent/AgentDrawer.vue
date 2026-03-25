<template>
  <Sheet :open="open" @update:open="$emit('update:open', $event)">
    <SheetContent side="right" class="agent-drawer">
      <SheetHeader>
        <SheetTitle>AI Agent</SheetTitle>
      </SheetHeader>
      <div class="agent-drawer-switcher">
        <AgentTypeSwitcher v-model="agentType" />
      </div>
      <AgentChat
        :messages="messages"
        :streaming="streaming"
        :current-stream-content="currentStreamContent"
        @send="sendMessage"
        @apply="$emit('apply', $event)"
        @clear="clearMessages"
      />
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
import { toRef } from 'vue'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import AgentTypeSwitcher from './AgentTypeSwitcher.vue'
import AgentChat from './AgentChat.vue'
import { useAgentChat } from '@/composables/useAgentChat'
import type { AgentType } from '@/types/agent'

const props = defineProps<{
  open: boolean
  dramaId: number
  episodeId: number
}>()

defineEmits<{
  'update:open': [value: boolean]
  apply: [data: { type: AgentType; content: string }]
}>()

const { agentType, messages, streaming, currentStreamContent, sendMessage, clearMessages } = useAgentChat(props.dramaId, toRef(props, 'episodeId'))
</script>

<style scoped>
.agent-drawer {
  display: flex;
  flex-direction: column;
  width: 400px !important;
  max-width: 400px !important;
}

.agent-drawer-switcher {
  padding: 0 0 12px;
}
</style>
