<template>
  <div class="animate-fade-in">
    <!-- Settings Tab Nav -->
    <div class="settings-tabs">
      <router-link to="/settings/ai-config" class="settings-tab active">
        {{ $t('aiConfig.title') }}
      </router-link>
      <router-link to="/settings/agent-config" class="settings-tab">
        {{ $t('agentConfig.title') }}
      </router-link>
      <router-link to="/settings/agent-debug" class="settings-tab">
        {{ $t('agentDebug.title') }}
      </router-link>
    </div>

    <!-- Page Header -->
    <PageHeader
      :title="$t('aiConfig.title')"
      :subtitle="$t('aiConfig.subtitle') || '管理 AI 服务配置'"
    >
      <template #actions>
        <Button variant="outline" @click="showQuickSetupDialog">
          <Wand2 :size="16" class="mr-1" />
          <span>一键配置火宝</span>
        </Button>
      </template>
    </PageHeader>

    <!-- Service Type Tabs -->
    <div class="service-type-tabs">
      <button
        v-for="tab in serviceTypeTabs"
        :key="tab.key"
        :class="['svc-tab', { active: activeServiceType === tab.key }]"
        @click="activeServiceType = tab.key"
      >
        <component :is="tab.icon" :size="15" />
        {{ tab.label }}
        <span class="svc-tab-count">{{ getConfigCount(tab.key) }}</span>
      </button>
    </div>

    <!-- Provider List -->
    <div class="provider-list">
      <template v-if="loading">
        <Skeleton v-for="i in 3" :key="i" class="h-16 rounded-lg" />
      </template>
      <template v-else>
        <div
          v-for="group in filteredProviderGroups"
          :key="group.key"
          class="provider-row"
          :class="{ expanded: expandedProvider === group.key }"
        >
          <!-- Row header -->
          <div class="row-header" @click="toggleProvider(group.key)">
            <div class="row-left">
              <div class="provider-avatar" :style="{ background: avatarColor(group.key) }">
                {{ group.name.charAt(0) }}
              </div>
              <div class="row-info">
                <span class="row-name">{{ group.name }}</span>
                <span class="row-models">
                  {{ getActiveModelCount(group) }} 个模型已启用
                </span>
              </div>
            </div>
            <div class="row-right">
              <span :class="['status-dot', hasApiKeyForGroup(group) ? 'connected' : 'disconnected']" />
              <span class="row-url">{{ getBaseUrlForGroup(group) || '未配置' }}</span>
              <ChevronDown :size="14" class="row-chevron" :class="{ rotated: expandedProvider === group.key }" />
            </div>
          </div>

          <!-- Expanded detail -->
          <div v-if="expandedProvider === group.key" class="row-detail">
            <!-- Credentials -->
            <div class="detail-credentials">
              <div class="cred-field">
                <label>API Key</label>
                <div class="cred-input-wrap">
                  <Input
                    v-model="editFields[group.key + '_api_key']"
                    type="password"
                    placeholder="sk-..."
                    class="cred-input"
                  />
                  <Button variant="ghost" size="sm" @click="saveGroupCredential(group, 'api_key')">
                    <Save :size="13" />
                  </Button>
                </div>
              </div>
              <div class="cred-field">
                <label>Base URL</label>
                <div class="cred-input-wrap">
                  <Input
                    v-model="editFields[group.key + '_base_url']"
                    type="text"
                    :placeholder="getDefaultBaseUrl(group.ids[0])"
                    class="cred-input"
                  />
                  <Button variant="ghost" size="sm" @click="saveGroupCredential(group, 'base_url')">
                    <Save :size="13" />
                  </Button>
                </div>
              </div>
            </div>

            <!-- Models for current service type -->
            <div class="detail-models">
              <div class="models-header">
                <span class="models-title">{{ serviceTypeLabel(activeServiceType) }}模型</span>
                <Button variant="ghost" size="sm" class="add-btn" @click="startAddModel(group)">
                  <Plus :size="13" />
                  添加模型
                </Button>
              </div>
              <div class="models-list">
                <div
                  v-for="model in getModelsForGroup(group)"
                  :key="model.name"
                  class="model-item"
                >
                  <span class="model-name">{{ model.name }}</span>
                  <Switch
                    :checked="model.active"
                    @update:checked="(val: boolean) => handleModelToggle(group, model, val)"
                  />
                </div>
                <div v-if="getModelsForGroup(group).length === 0" class="models-empty">
                  该服务商暂无{{ serviceTypeLabel(activeServiceType) }}模型
                </div>
                <!-- Add model input -->
                <div v-if="addingModelGroup === group.key" class="model-item model-add">
                  <Input
                    v-model="newModelName"
                    placeholder="输入模型名称"
                    class="model-add-input"
                    @keyup.enter="confirmAddModel(group)"
                    @keyup.escape="addingModelGroup = null"
                  />
                  <Button variant="ghost" size="sm" @click="confirmAddModel(group)">
                    <Check :size="13" />
                  </Button>
                  <Button variant="ghost" size="sm" @click="addingModelGroup = null">
                    <X :size="13" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="filteredProviderGroups.length === 0" class="empty-state">
          暂无{{ serviceTypeLabel(activeServiceType) }}服务配置
        </div>
      </template>
    </div>

    <!-- Quick Setup Dialog -->
    <Dialog v-model:open="quickSetupVisible">
      <DialogContent class="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>一键配置</DialogTitle>
        </DialogHeader>
        <div class="quick-setup-info">
          <p>将自动创建以下配置：</p>
          <ul>
            <li><strong>文本服务</strong>: {{ chatfireFirstModel('text') }}</li>
            <li><strong>图片服务</strong>: {{ chatfireFirstModel('image') }}</li>
            <li><strong>视频服务</strong>: {{ chatfireFirstModel('video') }}</li>
          </ul>
          <p class="quick-setup-tip">Base URL: https://api.chatfire.site/v1</p>
        </div>
        <div class="form-field">
          <label class="form-label">API Key <span class="required">*</span></label>
          <Input
            v-model="quickSetupApiKey"
            type="password"
            placeholder="请输入 ChatFire API Key"
          />
        </div>
        <DialogFooter class="quick-setup-footer">
          <a
            href="https://api.chatfire.site/login?inviteCode=C4453345"
            target="_blank"
            class="register-link"
          >
            没有 API Key？点击注册
          </a>
          <div class="footer-buttons">
            <Button variant="outline" @click="quickSetupVisible = false">取消</Button>
            <Button @click="handleQuickSetup" :disabled="quickSetupLoading">
              <Loader2 v-if="quickSetupLoading" :size="16" class="animate-spin mr-1" />
              确认配置
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue'
import { toast } from 'vue-sonner'
import {
  Wand2, Loader2, ChevronDown, Save, Plus, Check, X,
  Type, ImageIcon, Video, AudioLines, Mic,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { aiAPI } from '@/api/ai'
import { PageHeader } from '@/components/common'
import type { AIServiceConfig, AIServiceProvider, AIServiceType } from '@/types/ai'
import { PROVIDER_GROUPS, buildPresetModels, type ProviderGroup } from '@/constants/ai-providers'

const loading = ref(false)
const allConfigs = ref<AIServiceConfig[]>([])
const allProviders = ref<AIServiceProvider[]>([])
const quickSetupVisible = ref(false)
const quickSetupApiKey = ref('')
const quickSetupLoading = ref(false)
const activeServiceType = ref<AIServiceType>('text')
const expandedProvider = ref<string | null>(null)
const addingModelGroup = ref<string | null>(null)
const newModelName = ref('')
const editFields = reactive<Record<string, string>>({})

const serviceTypeTabs = [
  { key: 'text' as AIServiceType, label: '文本', icon: Type },
  { key: 'image' as AIServiceType, label: '图片', icon: ImageIcon },
  { key: 'video' as AIServiceType, label: '视频', icon: Video },
  { key: 'audio' as AIServiceType, label: '音频', icon: AudioLines },
  { key: 'lipsync' as AIServiceType, label: '口型同步', icon: Mic },
]

function serviceTypeLabel(t: AIServiceType) {
  return serviceTypeTabs.find(tab => tab.key === t)?.label || t
}

const presetModelsMap = computed(() => buildPresetModels(allProviders.value))

// Filter provider groups that have models or configs for the active service type
const filteredProviderGroups = computed(() => {
  return PROVIDER_GROUPS.filter(group => {
    const presets = presetModelsMap.value[group.key]?.[activeServiceType.value] || []
    const configs = allConfigs.value.filter(
      c => group.ids.includes(c.provider || '') && c.service_type === activeServiceType.value
    )
    return presets.length > 0 || configs.length > 0
  })
})

function getConfigCount(serviceType: AIServiceType) {
  return allConfigs.value.filter(c => c.service_type === serviceType && c.is_active).length
}

function toggleProvider(key: string) {
  if (expandedProvider.value === key) {
    expandedProvider.value = null
  } else {
    expandedProvider.value = key
    // Pre-fill edit fields
    const group = PROVIDER_GROUPS.find(g => g.key === key)!
    const configs = allConfigs.value.filter(c => group.ids.includes(c.provider || ''))
    const apiKey = configs.find(c => c.api_key)?.api_key || ''
    const baseUrl = configs.find(c => c.base_url)?.base_url || ''
    editFields[key + '_api_key'] = apiKey
    editFields[key + '_base_url'] = baseUrl
  }
}

function hasApiKeyForGroup(group: ProviderGroup) {
  return allConfigs.value.some(c => group.ids.includes(c.provider || '') && c.api_key)
}

function getBaseUrlForGroup(group: ProviderGroup) {
  return allConfigs.value.find(c => group.ids.includes(c.provider || '') && c.base_url)?.base_url || ''
}

function getActiveModelCount(group: ProviderGroup) {
  return allConfigs.value.filter(
    c => group.ids.includes(c.provider || '') && c.service_type === activeServiceType.value && c.is_active
  ).length
}

interface ModelItem {
  name: string
  active: boolean
  configId?: number
}

function getModelsForGroup(group: ProviderGroup): ModelItem[] {
  const st = activeServiceType.value
  const presets = presetModelsMap.value[group.key]?.[st] || []
  const configsForType = allConfigs.value.filter(
    c => group.ids.includes(c.provider || '') && c.service_type === st
  )
  const configModelMap = new Map<string, { active: boolean; configId: number }>()
  for (const cfg of configsForType) {
    const models = Array.isArray(cfg.model) ? cfg.model : [cfg.model]
    for (const m of models) {
      configModelMap.set(m, { active: cfg.is_active, configId: cfg.id })
    }
  }
  const allNames = new Set([...presets, ...configModelMap.keys()])
  return Array.from(allNames).map(name => {
    const info = configModelMap.get(name)
    return { name, active: info?.active ?? false, configId: info?.configId }
  })
}

const avatarColors: Record<string, string> = {
  chatfire: 'linear-gradient(135deg, #f97316, #ef4444)',
  gemini: 'linear-gradient(135deg, #4285f4, #34a853)',
  openai: 'linear-gradient(135deg, #10a37f, #1a7f64)',
  volcengine: 'linear-gradient(135deg, #3370ff, #2b5fd9)',
  minimax: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  vidu: 'linear-gradient(135deg, #06b6d4, #0891b2)',
  openrouter: 'linear-gradient(135deg, #f59e0b, #d97706)',
  qwen: 'linear-gradient(135deg, #6366f1, #4f46e5)',
}
function avatarColor(key: string) { return avatarColors[key] || 'linear-gradient(135deg, #6366f1, #8b5cf6)' }

// --- Save credentials ---
async function saveGroupCredential(group: ProviderGroup, field: 'api_key' | 'base_url') {
  const value = editFields[group.key + '_' + field]?.trim()
  if (!value) { toast.warning(field === 'api_key' ? '请输入 API Key' : '请输入 Base URL'); return }
  try {
    const configs = allConfigs.value.filter(c => group.ids.includes(c.provider || ''))
    if (configs.length > 0) {
      await Promise.all(configs.map(c => aiAPI.update(c.id, { [field]: value })))
    } else {
      // No config exists yet — create one for current service type
      await aiAPI.create({
        service_type: activeServiceType.value,
        provider: group.ids[0],
        name: `${group.name}-${serviceTypeLabel(activeServiceType.value)}`,
        base_url: field === 'base_url' ? value : getDefaultBaseUrl(group.ids[0]),
        api_key: field === 'api_key' ? value : '',
        model: [],
        priority: 0,
      })
    }
    toast.success('保存成功')
    loadAll()
  } catch { toast.error('保存失败') }
}

// --- Model toggle ---
async function handleModelToggle(group: ProviderGroup, model: ModelItem, active: boolean) {
  try {
    if (model.configId) {
      await aiAPI.update(model.configId, { is_active: active })
    } else {
      const apiKey = editFields[group.key + '_api_key'] || allConfigs.value.find(c => group.ids.includes(c.provider || '') && c.api_key)?.api_key || ''
      const baseUrl = editFields[group.key + '_base_url'] || getBaseUrlForGroup(group) || getDefaultBaseUrl(group.ids[0])
      await aiAPI.create({
        service_type: activeServiceType.value,
        provider: group.ids[0],
        name: `${group.name}-${serviceTypeLabel(activeServiceType.value)}-${model.name}`,
        base_url: baseUrl,
        api_key: apiKey,
        model: [model.name],
        priority: 0,
      })
    }
    loadAll()
  } catch { toast.error('操作失败') }
}

// --- Add model ---
function startAddModel(group: ProviderGroup) {
  addingModelGroup.value = group.key
  newModelName.value = ''
}

async function confirmAddModel(group: ProviderGroup) {
  const name = newModelName.value.trim()
  if (!name) return
  try {
    const apiKey = allConfigs.value.find(c => group.ids.includes(c.provider || '') && c.api_key)?.api_key || ''
    const baseUrl = getBaseUrlForGroup(group) || getDefaultBaseUrl(group.ids[0])
    await aiAPI.create({
      service_type: activeServiceType.value,
      provider: group.ids[0],
      name: `${group.name}-${serviceTypeLabel(activeServiceType.value)}-${name}`,
      base_url: baseUrl,
      api_key: apiKey,
      model: [name],
      priority: 0,
    })
    toast.success('模型已添加')
    addingModelGroup.value = null
    newModelName.value = ''
    loadAll()
  } catch { toast.error('添加失败') }
}

function getDefaultBaseUrl(providerId: string): string {
  const defaults: Record<string, string> = {
    chatfire: 'https://api.chatfire.site/v1',
    openai: 'https://api.openai.com/v1',
    gemini: 'https://generativelanguage.googleapis.com',
    google: 'https://generativelanguage.googleapis.com',
    volcengine: 'https://ark.cn-beijing.volces.com/api/v3',
    volces: 'https://ark.cn-beijing.volces.com/api/v3',
    minimax: 'https://api.minimaxi.com/v1',
    vidu: 'https://api.vidu.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  }
  return defaults[providerId] || ''
}

// --- Load ---
async function loadAll() {
  loading.value = true
  try {
    const [text, image, video, audio, lipsync, providers] = await Promise.all([
      aiAPI.list('text'), aiAPI.list('image'), aiAPI.list('video'),
      aiAPI.list('audio'), aiAPI.list('lipsync'), aiAPI.listProviders(),
    ])
    allConfigs.value = [...text, ...image, ...video, ...audio, ...lipsync]
    allProviders.value = providers
  } catch (error: any) { toast.error(error.message || '加载失败') }
  finally { loading.value = false }
}

// --- Quick Setup ---
function chatfireFirstModel(serviceType: AIServiceType): string {
  const models = presetModelsMap.value['chatfire']?.[serviceType]
  return models?.[0] || '-'
}

function showQuickSetupDialog() { quickSetupApiKey.value = ''; quickSetupVisible.value = true }

async function handleQuickSetup() {
  if (!quickSetupApiKey.value.trim()) { toast.warning('请输入 API Key'); return }
  quickSetupLoading.value = true
  const baseUrl = 'https://api.chatfire.site/v1'
  const apiKey = quickSetupApiKey.value.trim()
  try {
    const types: { key: AIServiceType; label: string }[] = [
      { key: 'text', label: '文本' }, { key: 'image', label: '图片' }, { key: 'video', label: '视频' },
    ]
    const created: string[] = []; const skipped: string[] = []
    for (const { key, label } of types) {
      const configs = allConfigs.value.filter(c => c.provider === 'chatfire' && c.service_type === key)
      if (configs.length === 0) {
        const firstModel = chatfireFirstModel(key)
        await aiAPI.create({
          service_type: key, provider: 'chatfire',
          name: `ChatFire-${label}`,
          base_url: baseUrl, api_key: apiKey,
          model: firstModel !== '-' ? [firstModel] : [], priority: 0,
        })
        created.push(label)
      } else { skipped.push(label) }
    }
    if (created.length > 0) toast.success(`已创建 ${created.join('、')} 配置`)
    else toast.info('所有配置已存在')
    quickSetupVisible.value = false; loadAll()
  } catch (error: any) { toast.error(error.message || '配置失败') }
  finally { quickSetupLoading.value = false }
}

onMounted(() => { loadAll() })
</script>

<style scoped>
.settings-tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--glass-stroke-soft); padding-bottom: 0; }
.settings-tab { padding: 8px 20px; font-size: 14px; font-weight: 500; color: var(--glass-text-secondary); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.2s; }
.settings-tab:hover { color: var(--glass-accent-from); }
.settings-tab.active, .settings-tab.router-link-exact-active { color: var(--glass-accent-from); border-bottom-color: var(--glass-accent-from); }

/* Service Type Tabs */
.service-type-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  padding: 3px;
  background: var(--glass-bg-muted, rgba(255,255,255,0.04));
  border-radius: 10px;
  width: fit-content;
}

.svc-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.svc-tab:hover { color: var(--text-primary); }

.svc-tab.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.15);
}

.svc-tab-count {
  font-size: 11px;
  padding: 0 5px;
  border-radius: 9999px;
  background: rgba(255,255,255,0.06);
  color: var(--text-muted);
}

.svc-tab.active .svc-tab-count {
  background: rgba(232, 162, 67, 0.15);
  color: rgba(232, 162, 67, 0.9);
}

/* Provider List */
.provider-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.provider-row {
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  background: var(--bg-card);
  overflow: hidden;
  transition: border-color 0.15s;
}

.provider-row:hover {
  border-color: rgba(255,255,255,0.12);
}

.provider-row.expanded {
  border-color: var(--accent, #e8a243);
}

/* Row header */
.row-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.1s;
}

.row-header:hover {
  background: rgba(255,255,255,0.02);
}

.row-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.provider-avatar {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  color: #fff;
  flex-shrink: 0;
}

.row-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.row-models {
  font-size: 11px;
  color: var(--text-muted);
}

.row-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.connected {
  background: #22c55e;
  box-shadow: 0 0 4px rgba(34, 197, 94, 0.4);
}

.status-dot.disconnected {
  background: #eab308;
}

.row-url {
  font-size: 11px;
  color: var(--text-muted);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-chevron {
  color: var(--text-muted);
  transition: transform 0.2s;
  flex-shrink: 0;
}

.row-chevron.rotated {
  transform: rotate(180deg);
}

/* Detail panel */
.row-detail {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid var(--border-primary);
}

.detail-credentials {
  display: flex;
  gap: 12px;
  padding-top: 12px;
}

.cred-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cred-field label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.cred-input-wrap {
  display: flex;
  gap: 4px;
}

.cred-input {
  flex: 1;
  height: 32px !important;
  font-size: 12px !important;
}

/* Models */
.detail-models {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.models-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.models-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.add-btn {
  font-size: 11px !important;
  height: 26px !important;
  color: var(--text-muted) !important;
}

.models-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 200px;
  overflow-y: auto;
}

.model-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  border-radius: 6px;
  transition: background 0.1s;
}

.model-item:hover {
  background: rgba(255,255,255,0.03);
}

.model-name {
  font-size: 13px;
  color: var(--text-primary);
  font-family: monospace;
}

.models-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

.model-add {
  gap: 4px;
}

.model-add-input {
  flex: 1;
  height: 28px !important;
  font-size: 12px !important;
}

/* Empty */
.empty-state {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

/* Quick Setup */
.quick-setup-info { margin-bottom: 16px; padding: 12px 16px; background: var(--glass-bg-muted); border-radius: 8px; font-size: 14px; color: var(--glass-text-primary); }
.quick-setup-info p { margin: 0 0 8px 0; }
.quick-setup-info ul { margin: 8px 0; padding-left: 20px; }
.quick-setup-info li { margin: 4px 0; color: var(--glass-text-secondary); }
.quick-setup-info .quick-setup-tip { margin-top: 12px; font-size: 12px; color: var(--glass-text-tertiary); }
.quick-setup-footer { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.register-link { font-size: 12px; color: var(--glass-text-tertiary); text-decoration: none; transition: color 0.2s; }
.register-link:hover { color: var(--glass-accent-from); }
.footer-buttons { display: flex; gap: 8px; }
.form-field { display: flex; flex-direction: column; gap: 0.5rem; }
.form-label { font-size: 0.875rem; font-weight: 500; color: var(--glass-text-primary); }
.required { color: #ef4444; }
.mr-1 { margin-right: 0.25rem; }
</style>
