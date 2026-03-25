<template>
  <div class="agent-chat">
    <!-- Message list -->
    <div ref="messageListRef" class="agent-messages">
      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="agent-msg"
        :class="`agent-msg--${msg.role}`"
      >
        <div class="agent-msg-icon">
          <User v-if="msg.role === 'user'" :size="14" />
          <Bot v-else-if="msg.role === 'assistant'" :size="14" />
          <AlertCircle v-else :size="14" />
        </div>
        <div class="agent-msg-body">
          <div class="agent-msg-content" v-text="msg.content" />

          <!-- Tool calls (collapsible) -->
          <details v-if="msg.toolCalls?.length" class="agent-tools">
            <summary class="agent-tools-summary">
              <Wrench :size="12" />
              {{ msg.toolCalls.length }} 个工具调用
            </summary>
            <div
              v-for="(tc, j) in msg.toolCalls"
              :key="j"
              class="agent-tool-item"
            >
              <span class="agent-tool-name">{{ tc.name }}</span>
              <pre v-if="tc.result" class="agent-tool-result">{{ tc.result }}</pre>
            </div>
          </details>

          <!-- Apply button for assistant messages -->
          <AgentResultAction
            v-if="msg.role === 'assistant' && msg.agentType"
            :agent-type="msg.agentType"
            :content="msg.content"
            @apply="$emit('apply', $event)"
          />
        </div>
      </div>

      <!-- Streaming content -->
      <div v-if="streaming && currentStreamContent" class="agent-msg agent-msg--assistant">
        <div class="agent-msg-icon">
          <Bot :size="14" />
        </div>
        <div class="agent-msg-body">
          <div class="agent-msg-content">
            {{ currentStreamContent }}<span class="agent-cursor" />
          </div>
        </div>
      </div>

      <!-- Streaming indicator (no content yet) -->
      <div v-else-if="streaming" class="agent-msg agent-msg--assistant">
        <div class="agent-msg-icon">
          <Bot :size="14" />
        </div>
        <div class="agent-msg-body">
          <div class="agent-msg-content agent-thinking">
            <Loader2 :size="14" class="animate-spin" />
            思考中...
          </div>
        </div>
      </div>
    </div>

    <!-- Input area -->
    <div class="agent-input-area">
      <Button
        v-if="messages.length > 0"
        variant="ghost"
        size="sm"
        class="agent-clear-btn"
        @click="$emit('clear')"
      >
        <Trash2 :size="14" />
      </Button>
      <input
        v-model="inputText"
        class="agent-input"
        placeholder="输入消息..."
        :disabled="streaming"
        @keydown.enter.prevent="handleSend"
      />
      <Button
        size="sm"
        :disabled="!inputText.trim() || streaming"
        @click="handleSend"
      >
        <Send :size="14" />
      </Button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { User, Bot, AlertCircle, Wrench, Send, Trash2, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import AgentResultAction from './AgentResultAction.vue'
import type { AgentMessage, AgentType } from '@/types/agent'

const props = defineProps<{
  messages: AgentMessage[]
  streaming: boolean
  currentStreamContent: string
}>()

const emit = defineEmits<{
  send: [text: string]
  apply: [data: { type: AgentType; content: string }]
  clear: []
}>()

const inputText = ref('')
const messageListRef = ref<HTMLElement>()

function handleSend() {
  const text = inputText.value.trim()
  if (!text) return
  inputText.value = ''
  emit('send', text)
}

// Auto-scroll to bottom when messages change or streaming content updates
watch(
  () => [props.messages.length, props.currentStreamContent],
  () => {
    nextTick(() => {
      if (messageListRef.value) {
        messageListRef.value.scrollTop = messageListRef.value.scrollHeight
      }
    })
  },
)
</script>

<style scoped>
.agent-chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.agent-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.agent-msg {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.agent-msg-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary, hsl(var(--muted)));
  color: var(--text-muted, hsl(var(--muted-foreground)));
}

.agent-msg--user .agent-msg-icon {
  background: var(--accent, hsl(var(--primary)));
  color: var(--glass-text-on-accent, hsl(var(--primary-foreground)));
}

.agent-msg-body {
  flex: 1;
  min-width: 0;
}

.agent-msg-content {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary, hsl(var(--foreground)));
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-msg--system .agent-msg-content {
  color: hsl(var(--destructive, 0 84% 60%));
  font-size: 12px;
}

.agent-thinking {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted, hsl(var(--muted-foreground)));
}

.agent-cursor {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: var(--accent, hsl(var(--primary)));
  margin-left: 1px;
  vertical-align: middle;
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.agent-tools {
  margin-top: 6px;
  font-size: 12px;
}

.agent-tools-summary {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: var(--text-muted, hsl(var(--muted-foreground)));
  user-select: none;
}

.agent-tool-item {
  margin-top: 4px;
  padding: 6px 8px;
  background: var(--bg-tertiary, hsl(var(--muted)));
  border-radius: 4px;
}

.agent-tool-name {
  font-weight: 600;
  font-size: 11px;
  color: var(--accent, hsl(var(--primary)));
}

.agent-tool-result {
  margin-top: 4px;
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-secondary, hsl(var(--muted-foreground)));
  max-height: 120px;
  overflow-y: auto;
}

.agent-input-area {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-primary, hsl(var(--border)));
}

.agent-input {
  flex: 1;
  min-width: 0;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid var(--border-primary, hsl(var(--border)));
  border-radius: 6px;
  background: var(--bg-primary, hsl(var(--background)));
  color: var(--text-primary, hsl(var(--foreground)));
  outline: none;
  transition: border-color 0.2s;
}

.agent-input:focus {
  border-color: var(--accent, hsl(var(--primary)));
}

.agent-input:disabled {
  opacity: 0.5;
}

.agent-clear-btn {
  flex-shrink: 0;
}
</style>
