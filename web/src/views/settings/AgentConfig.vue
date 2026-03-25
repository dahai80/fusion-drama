<template>
  <div class="agent-config-page">
    <!-- Settings Tab Nav -->
    <div class="settings-tabs">
      <router-link to="/settings/ai-config" class="settings-tab">
        {{ t('aiConfig.title') }}
      </router-link>
      <router-link to="/settings/agent-config" class="settings-tab active">
        {{ t('agentConfig.title') }}
      </router-link>
      <router-link to="/settings/agent-debug" class="settings-tab">
        {{ t('agentDebug.title') }}
      </router-link>
    </div>

    <div class="page-header">
      <div>
        <h1>{{ t('agentConfig.title') }}</h1>
        <p class="subtitle">{{ t('agentConfig.subtitle') }}</p>
      </div>
    </div>

    <div v-loading="loading" class="agent-cards">
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
          <el-switch
            v-model="config.is_active"
            @change="(val: boolean) => updateConfig(config.id, { is_active: val })"
          />
        </div>

        <div class="card-body">
          <!-- Model -->
          <div class="config-row">
            <label>{{ t('agentConfig.model') }}</label>
            <div class="config-input">
              <el-select
                v-if="availableModels.length > 0"
                v-model="config.model"
                filterable
                allow-create
                :placeholder="t('agentConfig.selectModel')"
                @change="updateConfig(config.id, { model: config.model })"
              >
                <el-option
                  v-for="m in availableModels"
                  :key="m"
                  :label="m"
                  :value="m"
                />
              </el-select>
              <el-input
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
              <el-slider
                v-model="config.temperature"
                :min="0"
                :max="2"
                :step="0.1"
                :show-tooltip="true"
                @change="updateConfig(config.id, { temperature: config.temperature })"
              />
              <span class="slider-value">{{ config.temperature.toFixed(1) }}</span>
            </div>
          </div>

          <!-- Max Tokens -->
          <div class="config-row">
            <label>{{ t('agentConfig.maxTokens') }}</label>
            <div class="config-input">
              <el-input-number
                v-model="config.max_tokens"
                :min="256"
                :max="128000"
                :step="1024"
                @change="updateConfig(config.id, { max_tokens: config.max_tokens })"
              />
            </div>
          </div>

          <!-- Max Iterations -->
          <div class="config-row">
            <label>{{ t('agentConfig.maxIterations') }}</label>
            <div class="config-input">
              <el-input-number
                v-model="config.max_iterations"
                :min="1"
                :max="50"
                @change="updateConfig(config.id, { max_iterations: config.max_iterations })"
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
import { agentConfigAPI } from '@/api/agentConfig'
import type { AgentConfig, UpdateAgentConfigRequest } from '@/api/agentConfig'
import { aiAPI } from '@/api/ai'

const { t } = useI18n()
const loading = ref(false)
const configs = ref<AgentConfig[]>([])
const availableModels = ref<string[]>([])

const agentIcons: Record<string, string> = {
  script_rewriter: '📝',
  style_analyzer: '🎨',
  extractor: '🔍',
  voice_assigner: '🎙️',
  storyboard_breaker: '🎬',
  prompt_generator: '✨'
}

function getAgentIcon(agentType: string) {
  return agentIcons[agentType] || '🤖'
}

async function loadConfigs() {
  loading.value = true
  try {
    // 拦截器已解包 res.data，返回值直接是数组
    const data: any = await agentConfigAPI.list()
    configs.value = Array.isArray(data) ? data : []
  } catch (e) {
    toast.error('Failed to load agent configs')
  } finally {
    loading.value = false
  }
}

async function loadModels() {
  try {
    const data: any = await aiAPI.list('text')
    const models: string[] = []
    const configList = Array.isArray(data) ? data : []
    for (const config of configList) {
      const m = config.model
      if (Array.isArray(m)) {
        models.push(...m)
      } else if (m) {
        models.push(m)
      }
    }
    availableModels.value = [...new Set(models)]
  } catch {
    // ignore
  }
}

async function updateConfig(id: number, updates: UpdateAgentConfigRequest) {
  try {
    await agentConfigAPI.update(id, updates)
  } catch (e) {
    toast.error('Failed to update config')
    loadConfigs()
  }
}

onMounted(() => {
  loadConfigs()
  loadModels()
})
</script>

<style scoped lang="scss">
.agent-config-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
}

.settings-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-light);
  padding-bottom: 0;
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
}

.settings-tab:hover {
  color: var(--el-color-primary);
}

.settings-tab.active,
.settings-tab.router-link-exact-active {
  color: var(--el-color-primary);
  border-bottom-color: var(--el-color-primary);
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;

  h1 {
    font-size: 22px;
    font-weight: 600;
    margin: 0;
  }

  .subtitle {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    margin-top: 4px;
  }
}

.agent-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  gap: 16px;
}

.agent-card {
  background: var(--el-bg-color-overlay);
  border: 1px solid var(--el-border-color-light);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.2s;

  &:hover {
    border-color: var(--el-color-primary-light-5);
  }

  &.inactive {
    opacity: 0.55;
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.card-title {
  display: flex;
  align-items: center;
  gap: 12px;

  .agent-icon {
    font-size: 28px;
  }

  h3 {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
  }

  .agent-desc {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin: 2px 0 0;
  }
}

.card-body {
  padding: 16px 20px;
}

.config-row {
  display: flex;
  align-items: center;
  margin-bottom: 12px;

  &:last-child {
    margin-bottom: 0;
  }

  > label {
    width: 100px;
    flex-shrink: 0;
    font-size: 13px;
    color: var(--el-text-color-regular);
  }

  .config-input {
    flex: 1;
  }
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 12px;

  .el-slider {
    flex: 1;
  }

  .slider-value {
    width: 32px;
    text-align: right;
    font-size: 13px;
    font-weight: 500;
    color: var(--el-text-color-primary);
  }
}
</style>
