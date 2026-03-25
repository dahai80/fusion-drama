<template>
  <div class="agent-config-page">
    <!-- Settings Tab Nav -->
    <div class="settings-tabs">
      <router-link to="/settings/ai-config" class="settings-tab">{{ t('aiConfig.title') }}</router-link>
      <router-link to="/settings/agent-config" class="settings-tab active">{{ t('agentConfig.title') }}</router-link>
      <router-link to="/settings/agent-debug" class="settings-tab">{{ t('agentDebug.title') }}</router-link>
    </div>

    <div class="page-header">
      <div>
        <h1>{{ t('agentConfig.title') }}</h1>
        <p class="subtitle">{{ t('agentConfig.subtitle') }}</p>
      </div>
    </div>

    <div class="agent-cards">
      <template v-if="loading">
        <Skeleton v-for="i in 4" :key="i" class="h-48 rounded-xl" />
      </template>
      <div
        v-for="config in configs"
        :key="config.id"
        class="agent-card"
        :class="{ inactive: !config.is_active }"
      >
        <div class="card-header">
          <div class="card-title">
            <span class="agent-icon">{{ getAgentIcon(config.agent_type) }}</span>
            <div>
              <h3>{{ config.name }}</h3>
              <p class="agent-desc">{{ config.description }}</p>
            </div>
          </div>
          <Switch
            :checked="config.is_active"
            @update:checked="(val: boolean) => updateConfig(config.id, { is_active: val })"
          />
        </div>

        <div class="card-body">
          <!-- Model -->
          <div class="config-row">
            <label>{{ t('agentConfig.model') }}</label>
            <div class="config-input">
              <Select
                v-if="availableModels.length > 0"
                :model-value="config.model"
                @update:model-value="(val: string) => { config.model = val; updateConfig(config.id, { model: val }) }"
              >
                <SelectTrigger>
                  <SelectValue :placeholder="t('agentConfig.selectModel')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="m in availableModels" :key="m" :value="m">{{ m }}</SelectItem>
                </SelectContent>
              </Select>
              <Input
                v-else
                v-model="config.model"
                :placeholder="t('agentConfig.modelPlaceholder')"
                @blur="updateConfig(config.id, { model: config.model })"
                @keyup.enter="updateConfig(config.id, { model: config.model })"
              />
            </div>
          </div>

          <!-- Temperature -->
          <div class="config-row">
            <label>{{ t('agentConfig.temperature') }}</label>
            <div class="config-input slider-row">
              <input
                type="range"
                class="custom-slider"
                :value="config.temperature"
                min="0"
                max="2"
                step="0.1"
                @input="(e: Event) => { config.temperature = parseFloat((e.target as HTMLInputElement).value); }"
                @change="updateConfig(config.id, { temperature: config.temperature })"
              />
              <span class="slider-value">{{ config.temperature.toFixed(1) }}</span>
            </div>
          </div>

          <!-- Max Tokens -->
          <div class="config-row">
            <label>{{ t('agentConfig.maxTokens') }}</label>
            <div class="config-input">
              <Input
                type="number"
                :model-value="String(config.max_tokens)"
                @update:model-value="(val: string) => { config.max_tokens = Number(val) }"
                @blur="updateConfig(config.id, { max_tokens: config.max_tokens })"
                class="w-36"
              />
            </div>
          </div>

          <!-- Max Iterations -->
          <div class="config-row">
            <label>{{ t('agentConfig.maxIterations') }}</label>
            <div class="config-input">
              <Input
                type="number"
                :model-value="String(config.max_iterations)"
                @update:model-value="(val: string) => { config.max_iterations = Number(val) }"
                @blur="updateConfig(config.id, { max_iterations: config.max_iterations })"
                class="w-24"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { agentConfigAPI } from '@/api/agentConfig'
import type { AgentConfig, UpdateAgentConfigRequest } from '@/api/agentConfig'
import { aiAPI } from '@/api/ai'

const { t } = useI18n()
const loading = ref(false)
const configs = ref<AgentConfig[]>([])
const availableModels = ref<string[]>([])

const agentIcons: Record<string, string> = {
  script_rewriter: '📝', style_analyzer: '🎨', extractor: '🔍',
  voice_assigner: '🎙️', storyboard_breaker: '🎬', prompt_generator: '✨'
}

function getAgentIcon(agentType: string) { return agentIcons[agentType] || '🤖' }

async function loadConfigs() {
  loading.value = true
  try {
    const data: any = await agentConfigAPI.list()
    configs.value = Array.isArray(data) ? data : []
  } catch { toast.error('Failed to load agent configs') }
  finally { loading.value = false }
}

async function loadModels() {
  try {
    const data: any = await aiAPI.list('text')
    const models: string[] = []
    const configList = Array.isArray(data) ? data : []
    for (const config of configList) {
      const m = config.model
      if (Array.isArray(m)) models.push(...m)
      else if (m) models.push(m)
    }
    availableModels.value = [...new Set(models)]
  } catch { /* ignore */ }
}

async function updateConfig(id: number, updates: UpdateAgentConfigRequest) {
  try { await agentConfigAPI.update(id, updates) }
  catch { toast.error('Failed to update config'); loadConfigs() }
}

onMounted(() => { loadConfigs(); loadModels() })
</script>

<style scoped lang="scss">
.agent-config-page { max-width: 960px; margin: 0 auto; padding: 24px; }

.settings-tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--glass-stroke-soft); padding-bottom: 0; }
.settings-tab { padding: 8px 20px; font-size: 14px; font-weight: 500; color: var(--glass-text-secondary); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.2s; }
.settings-tab:hover { color: var(--glass-accent-from); }
.settings-tab.active, .settings-tab.router-link-exact-active { color: var(--glass-accent-from); border-bottom-color: var(--glass-accent-from); }

.page-header {
  display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;
  h1 { font-size: 22px; font-weight: 600; margin: 0; }
  .subtitle { color: var(--glass-text-secondary); font-size: 13px; margin-top: 4px; }
}

.agent-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 16px; }

.agent-card {
  background: var(--glass-bg-surface); border: 1px solid var(--glass-stroke-soft); border-radius: 12px; overflow: hidden; transition: all 0.2s;
  &:hover { border-color: var(--glass-stroke-focus); }
  &.inactive { opacity: 0.55; }
}

.card-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--glass-stroke-soft); }

.card-title {
  display: flex; align-items: center; gap: 12px;
  .agent-icon { font-size: 28px; }
  h3 { font-size: 15px; font-weight: 600; margin: 0; }
  .agent-desc { font-size: 12px; color: var(--glass-text-secondary); margin: 2px 0 0; }
}

.card-body { padding: 16px 20px; }

.config-row {
  display: flex; align-items: center; margin-bottom: 12px;
  &:last-child { margin-bottom: 0; }
  > label { width: 100px; flex-shrink: 0; font-size: 13px; color: var(--glass-text-secondary); }
  .config-input { flex: 1; }
}

.slider-row {
  display: flex; align-items: center; gap: 12px;
  .custom-slider { flex: 1; accent-color: var(--glass-accent-from); }
  .slider-value { width: 32px; text-align: right; font-size: 13px; font-weight: 500; color: var(--glass-text-primary); }
}

.w-36 { width: 144px; }
.w-24 { width: 96px; }
</style>
