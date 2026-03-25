<template>
  <div class="agent-debug-page">
    <!-- Settings Tab Nav -->
    <div class="settings-tabs">
      <router-link to="/settings/ai-config" class="settings-tab">
        {{ t('aiConfig.title') }}
      </router-link>
      <router-link to="/settings/agent-config" class="settings-tab">
        {{ t('agentConfig.title') }}
      </router-link>
      <router-link to="/settings/agent-debug" class="settings-tab active">
        {{ t('agentDebug.title') }}
      </router-link>
    </div>

    <div class="page-header">
      <h1>{{ t('agentDebug.title') }}</h1>
      <p class="subtitle">{{ t('agentDebug.subtitle') }}</p>
    </div>

    <div class="debug-layout">
      <!-- 左侧：Agent 选择 + Prompt/Skills 编辑 -->
      <div class="debug-sidebar">
        <!-- Agent 类型选择 -->
        <div class="agent-selector">
          <label>Agent</label>
          <el-select v-model="selectedAgent" @change="loadDebugInfo">
            <el-option
              v-for="a in agentTypes"
              :key="a.value"
              :label="a.label"
              :value="a.value"
            />
          </el-select>
        </div>

        <!-- Tabs: Prompt / Skills / Tools -->
        <el-tabs v-model="activeTab" class="debug-tabs">
          <!-- System Prompt -->
          <el-tab-pane :label="t('agentDebug.prompt')" name="prompt">
            <div class="tab-content">
              <div class="tab-toolbar">
                <el-button size="small" @click="resetPrompt">{{ t('agentDebug.resetDefault') }}</el-button>
                <el-button size="small" type="primary" @click="savePrompt" :loading="saving">
                  {{ t('agentDebug.save') }}
                </el-button>
              </div>
              <el-input
                v-model="debugInfo.system_prompt"
                type="textarea"
                :autosize="{ minRows: 10, maxRows: 30 }"
                class="prompt-editor"
              />
            </div>
          </el-tab-pane>

          <!-- Skills -->
          <el-tab-pane :label="t('agentDebug.skills')" name="skills">
            <div class="tab-content">
              <div v-if="debugInfo.skills.length === 0" class="empty-state">
                {{ t('agentDebug.noSkills') }}
              </div>
              <div v-for="(skill, idx) in debugInfo.skills" :key="idx" class="skill-card">
                <div class="skill-header">
                  <span class="skill-name">{{ skill.name }}</span>
                  <el-button size="small" type="primary" @click="saveSkill(skill)" :loading="saving">
                    {{ t('agentDebug.save') }}
                  </el-button>
                </div>
                <el-input
                  v-model="skill.content"
                  type="textarea"
                  :autosize="{ minRows: 8, maxRows: 25 }"
                  class="skill-editor"
                />
              </div>
            </div>
          </el-tab-pane>

          <!-- Tools -->
          <el-tab-pane :label="t('agentDebug.tools')" name="tools">
            <div class="tab-content">
              <div v-if="debugInfo.tools.length === 0" class="empty-state">
                {{ t('agentDebug.noTools') }}
              </div>
              <div v-for="toolName in debugInfo.tools" :key="toolName" class="tool-item">
                <el-icon><Promotion /></el-icon>
                <code>{{ toolName }}</code>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>

      <!-- 右侧：对话测试面板 -->
      <div class="debug-chat">
        <div class="chat-header">
          <span>{{ t('agentDebug.chatTest') }}</span>
          <el-button size="small" text @click="clearChat">{{ t('agentDebug.clear') }}</el-button>
        </div>

        <!-- 剧集选择 -->
        <div class="chat-context">
          <el-input-number v-model="chatContext.drama_id" :min="0" placeholder="Drama ID" size="small" controls-position="right" />
          <el-input-number v-model="chatContext.episode_id" :min="0" placeholder="Episode ID" size="small" controls-position="right" />
        </div>

        <!-- 消息列表 -->
        <div class="chat-messages" ref="messagesRef">
          <div v-for="(msg, idx) in messages" :key="idx" :class="['chat-msg', msg.type]">
            <div v-if="msg.type === 'user'" class="msg-bubble user-bubble">{{ msg.content }}</div>
            <div v-else-if="msg.type === 'content'" class="msg-bubble ai-bubble">{{ msg.content }}</div>
            <div v-else-if="msg.type === 'tool_call'" class="msg-tool">
              <el-icon><Promotion /></el-icon>
              <span>{{ msg.tool }}</span>
              <code v-if="msg.args">{{ msg.args }}</code>
            </div>
            <div v-else-if="msg.type === 'tool_result'" class="msg-tool-result">
              <span class="tool-label">{{ msg.tool }} →</span>
              <code>{{ msg.content }}</code>
            </div>
            <div v-else-if="msg.type === 'error'" class="msg-error">{{ msg.content }}</div>
          </div>
          <div v-if="streaming" class="chat-msg content">
            <div class="msg-bubble ai-bubble streaming">
              <span class="dot-pulse"></span>
            </div>
          </div>
        </div>

        <!-- 输入框 -->
        <div class="chat-input">
          <el-input
            v-model="inputMessage"
            :placeholder="t('agentDebug.inputPlaceholder')"
            @keyup.enter="sendMessage"
            :disabled="streaming"
          >
            <template #append>
              <el-button @click="sendMessage" :loading="streaming" type="primary">
                {{ t('agentDebug.send') }}
              </el-button>
            </template>
          </el-input>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Promotion } from '@element-plus/icons-vue'
import { toast } from 'vue-sonner'
import { agentConfigAPI } from '@/api/agentConfig'
import type { AgentDebugInfo, SkillFileInfo } from '@/api/agentConfig'

const { t } = useI18n()

const agentTypes = [
  { value: 'script_rewriter', label: '📝 剧本改写' },
  { value: 'style_analyzer', label: '🎨 风格分析' },
  { value: 'extractor', label: '🔍 角色场景提取' },
  { value: 'voice_assigner', label: '🎙️ 角色音色' },
  { value: 'storyboard_breaker', label: '🎬 分镜拆解' },
  { value: 'prompt_generator', label: '✨ 提示词生成' }
]

const selectedAgent = ref('script_rewriter')
const activeTab = ref('prompt')
const saving = ref(false)
const streaming = ref(false)
const inputMessage = ref('')
const messagesRef = ref<HTMLElement>()

interface ChatMessage {
  type: 'user' | 'content' | 'tool_call' | 'tool_result' | 'error'
  content?: string
  tool?: string
  args?: string
}

const messages = ref<ChatMessage[]>([])
const chatContext = reactive({ drama_id: 0, episode_id: 0 })

const debugInfo = reactive<AgentDebugInfo>({
  agent_type: '',
  system_prompt: '',
  default_prompt: '',
  skills: [],
  tools: []
})

// 获取对应 agent 的 config id（用于保存 prompt）
const configId = ref<number | null>(null)

async function loadDebugInfo() {
  try {
    const data: any = await agentConfigAPI.getDebugInfo(selectedAgent.value)
    Object.assign(debugInfo, data)
  } catch {
    toast.error('Failed to load debug info')
  }

  // 同时获取 config id
  try {
    const configs: any = await agentConfigAPI.list()
    const list = Array.isArray(configs) ? configs : []
    const match = list.find((c: any) => c.agent_type === selectedAgent.value)
    configId.value = match?.id || null
  } catch {
    // ignore
  }
}

function resetPrompt() {
  debugInfo.system_prompt = debugInfo.default_prompt
}

async function savePrompt() {
  if (!configId.value) {
    toast.warning('No config found for this agent')
    return
  }
  saving.value = true
  try {
    await agentConfigAPI.update(configId.value, { system_prompt: debugInfo.system_prompt })
    toast.success('Prompt saved')
  } catch {
    toast.error('Failed to save prompt')
  } finally {
    saving.value = false
  }
}

async function saveSkill(skill: SkillFileInfo) {
  saving.value = true
  try {
    await agentConfigAPI.updateSkill(selectedAgent.value, skill.name, skill.dir, skill.content)
    toast.success(`Skill "${skill.name}" saved`)
  } catch {
    toast.error('Failed to save skill')
  } finally {
    saving.value = false
  }
}

function clearChat() {
  messages.value = []
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

async function sendMessage() {
  const msg = inputMessage.value.trim()
  if (!msg || streaming.value) return

  messages.value.push({ type: 'user', content: msg })
  inputMessage.value = ''
  streaming.value = true
  scrollToBottom()

  try {
    const response = await fetch(`/api/v1/agent/${selectedAgent.value}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' },
      body: JSON.stringify({
        message: msg,
        drama_id: chatContext.drama_id || 0,
        episode_id: chatContext.episode_id || 0
      })
    })

    if (!response.ok || !response.body) {
      messages.value.push({ type: 'error', content: `HTTP ${response.status}` })
      streaming.value = false
      return
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      let eventType = ''
      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          const dataStr = line.slice(5).trim()
          if (!dataStr) continue
          try {
            const data = JSON.parse(dataStr)
            handleSSEEvent(eventType, data)
          } catch {
            // 某些 data 是字符串（SSEvent 用 gin 发送的）
            try {
              const parsed = JSON.parse(JSON.parse(dataStr))
              handleSSEEvent(eventType, parsed)
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    }
  } catch (e: any) {
    messages.value.push({ type: 'error', content: e.message || 'Connection error' })
  } finally {
    streaming.value = false
    scrollToBottom()
  }
}

function handleSSEEvent(eventType: string, data: any) {
  switch (eventType) {
    case 'tool_call':
      messages.value.push({
        type: 'tool_call',
        tool: data.tool,
        args: typeof data.arguments === 'string' ? data.arguments : JSON.stringify(data.arguments)
      })
      break
    case 'tool_result':
      messages.value.push({
        type: 'tool_result',
        tool: data.tool,
        content: typeof data.result === 'string'
          ? (data.result.length > 300 ? data.result.slice(0, 300) + '...' : data.result)
          : JSON.stringify(data.result).slice(0, 300)
      })
      break
    case 'content':
      // 合并连续内容
      const last = messages.value[messages.value.length - 1]
      if (last && last.type === 'content') {
        last.content = (last.content || '') + (data.content || '')
      } else {
        messages.value.push({ type: 'content', content: data.content || '' })
      }
      break
    case 'error':
      messages.value.push({ type: 'error', content: data.message || 'Unknown error' })
      break
    case 'done':
      break
  }
  scrollToBottom()
}

onMounted(() => {
  loadDebugInfo()
})
</script>

<style scoped lang="scss">
.agent-debug-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px;
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.settings-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.settings-tab {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: all 0.2s;
  &:hover { color: var(--el-color-primary); }
  &.active, &.router-link-exact-active {
    color: var(--el-color-primary);
    border-bottom-color: var(--el-color-primary);
  }
}

.page-header {
  margin-bottom: 16px;
  h1 { font-size: 22px; font-weight: 600; margin: 0; }
  .subtitle { color: var(--el-text-color-secondary); font-size: 13px; margin-top: 4px; }
}

.debug-layout {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.debug-sidebar {
  width: 480px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.agent-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  label { font-weight: 600; font-size: 14px; }
  .el-select { flex: 1; }
}

.debug-tabs {
  flex: 1;
  :deep(.el-tabs__content) { overflow-y: auto; }
}

.tab-content { padding: 4px 0; }

.tab-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 8px;
}

.prompt-editor :deep(textarea),
.skill-editor :deep(textarea) {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.6;
}

.skill-card {
  margin-bottom: 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  padding: 12px;
}

.skill-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  .skill-name { font-weight: 600; font-size: 14px; }
}

.tool-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  margin-bottom: 6px;
  code { font-size: 13px; }
}

.empty-state {
  text-align: center;
  color: var(--el-text-color-secondary);
  padding: 40px 0;
}

// 右侧对话面板
.debug-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  overflow: hidden;
  background: var(--el-bg-color-overlay);
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-weight: 600;
  font-size: 14px;
}

.chat-context {
  display: flex;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-lighter);
  .el-input-number { width: 140px; }
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.msg-bubble {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.user-bubble {
  align-self: flex-end;
  background: var(--el-color-primary);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.ai-bubble {
  align-self: flex-start;
  background: var(--el-fill-color);
  border-bottom-left-radius: 4px;
}

.msg-tool, .msg-tool-result {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 12px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  code {
    font-size: 11px;
    background: var(--el-fill-color);
    padding: 2px 6px;
    border-radius: 4px;
    max-width: 400px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: inline-block;
  }
}

.msg-tool-result .tool-label {
  font-weight: 500;
  white-space: nowrap;
}

.msg-error {
  color: var(--el-color-danger);
  font-size: 13px;
  padding: 8px 12px;
  background: var(--el-color-danger-light-9);
  border-radius: 8px;
}

.streaming .dot-pulse {
  display: inline-block;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--el-text-color-secondary);
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

.chat-input {
  padding: 12px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.chat-msg.user { display: flex; justify-content: flex-end; }
.chat-msg.content { display: flex; justify-content: flex-start; }
</style>
