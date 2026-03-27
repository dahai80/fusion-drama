<template>
  <div class="animate-fade-in">
    <!-- Settings Tab Nav -->
    <div class="settings-tabs">
      <router-link to="/settings/ai-config" class="settings-tab active">AI 服务</router-link>
      <router-link to="/settings/agent-config" class="settings-tab">Agent 配置</router-link>
      <router-link to="/settings/agent-debug" class="settings-tab">Agent 调试</router-link>
    </div>

    <!-- Page Header -->
    <div class="page-header">
      <div>
        <h2 class="page-title">AI 服务配置</h2>
        <p class="page-subtitle">管理文本、图片、视频服务的 API 密钥和模型</p>
      </div>
      <Button variant="outline" size="sm" @click="showQuickSetupDialog">
        <Wand2 :size="14" />
        一键配置
      </Button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-wrap">
      <Skeleton v-for="i in 3" :key="i" class="h-32 rounded-lg" />
    </div>

    <!-- Service Sections -->
    <div v-else class="sections">
      <section v-for="svc in serviceSections" :key="svc.type" class="svc-section">
        <!-- Section header -->
        <div class="section-header">
          <div class="section-title-row">
            <component :is="svc.icon" :size="16" class="section-icon" />
            <h3 class="section-title">{{ svc.label }}</h3>
            <span class="section-count" v-if="getActiveCount(svc.type) > 0">
              {{ getActiveCount(svc.type) }} 个已启用
            </span>
          </div>
        </div>

        <!-- Config list -->
        <div class="config-list">
          <div
            v-for="cfg in getConfigsForType(svc.type)"
            :key="cfg.id"
            class="config-row"
          >
            <div class="config-left">
              <div class="provider-dot" :style="{ background: providerColor(cfg.provider) }" />
              <div class="config-info">
                <span class="config-provider">{{ providerName(cfg.provider) }}</span>
                <span class="config-models">{{ formatModels(cfg.model) }}</span>
              </div>
            </div>
            <div class="config-right">
              <span class="config-url">{{ cfg.base_url || '' }}</span>
              <span :class="['key-status', cfg.api_key ? 'has-key' : 'no-key']">
                {{ cfg.api_key ? '已配置' : '无密钥' }}
              </span>
              <Switch
                :checked="cfg.is_active"
                @update:checked="(val: boolean) => toggleConfig(cfg.id, val)"
              />
              <Button variant="ghost" size="icon" class="edit-btn" @click="startEdit(cfg)">
                <Pencil :size="13" />
              </Button>
              <Button variant="ghost" size="icon" class="del-btn" @click="deleteConfig(cfg.id)">
                <Trash2 :size="13" />
              </Button>
            </div>
          </div>

          <!-- Empty -->
          <div v-if="getConfigsForType(svc.type).length === 0" class="config-empty">
            暂无{{ svc.label }}服务
          </div>

          <!-- Add button -->
          <button class="add-config-btn" @click="startCreate(svc.type)">
            <Plus :size="13" />
            添加{{ svc.label }}服务
          </button>
        </div>
      </section>
    </div>

    <!-- Edit/Create Dialog -->
    <Dialog v-model:open="editDialogOpen">
      <DialogContent class="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{{ editingConfig ? '编辑服务' : '添加服务' }}</DialogTitle>
        </DialogHeader>
        <form class="dialog-form" @submit.prevent="saveEdit">
          <div class="form-row">
            <label>服务商</label>
            <Select
              :model-value="editForm.provider"
              @update:model-value="(v: string) => editForm.provider = v"
            >
              <SelectTrigger><SelectValue placeholder="选择服务商" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="p in PROVIDER_GROUPS" :key="p.key" :value="p.ids[0]">
                  {{ p.name }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="form-row">
            <label>API Key</label>
            <Input v-model="editForm.api_key" type="password" placeholder="sk-..." />
          </div>
          <div class="form-row">
            <label>Base URL</label>
            <Input v-model="editForm.base_url" type="text" :placeholder="getDefaultBaseUrl(editForm.provider)" />
          </div>
          <div class="form-row">
            <label>模型（逗号分隔）</label>
            <Input v-model="editForm.modelStr" type="text" placeholder="model-name-1, model-name-2" />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" @click="editDialogOpen = false">取消</Button>
          <Button @click="saveEdit" :disabled="saving">
            <Loader2 v-if="saving" :size="14" class="animate-spin" />
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Quick Setup Dialog -->
    <Dialog v-model:open="quickSetupVisible">
      <DialogContent class="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>一键配置 ChatFire</DialogTitle>
        </DialogHeader>
        <div class="quick-info">
          <p>自动创建文本、图片、视频三项服务配置</p>
          <p class="quick-tip">Base URL: https://api.chatfire.site/v1</p>
        </div>
        <form @submit.prevent="handleQuickSetup">
          <div class="form-row">
            <label>API Key <span class="required">*</span></label>
            <Input v-model="quickSetupApiKey" type="password" placeholder="请输入 ChatFire API Key" />
          </div>
        </form>
        <DialogFooter class="quick-footer">
          <a href="https://api.chatfire.site/login?inviteCode=C4453345" target="_blank" class="register-link">
            没有 API Key？点击注册
          </a>
          <div class="footer-btns">
            <Button variant="outline" @click="quickSetupVisible = false">取消</Button>
            <Button @click="handleQuickSetup" :disabled="quickSetupLoading">
              <Loader2 v-if="quickSetupLoading" :size="14" class="animate-spin" />
              确认
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { Wand2, Loader2, Plus, Pencil, Trash2, Type, ImageIcon, Video, AudioLines } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { aiAPI } from '@/api/ai'
import type { AIServiceConfig, AIServiceProvider, AIServiceType } from '@/types/ai'
import { PROVIDER_GROUPS, buildPresetModels } from '@/constants/ai-providers'

const loading = ref(false)
const allConfigs = ref<AIServiceConfig[]>([])
const allProviders = ref<AIServiceProvider[]>([])
const saving = ref(false)

// Service sections
const serviceSections = [
  { type: 'text' as AIServiceType, label: '文本', icon: Type },
  { type: 'image' as AIServiceType, label: '图片', icon: ImageIcon },
  { type: 'video' as AIServiceType, label: '视频', icon: Video },
  { type: 'audio' as AIServiceType, label: '音频', icon: AudioLines },
]

function getConfigsForType(type: AIServiceType) {
  return allConfigs.value.filter(c => c.service_type === type)
}

function getActiveCount(type: AIServiceType) {
  return allConfigs.value.filter(c => c.service_type === type && c.is_active).length
}

function formatModels(model: string | string[]): string {
  const models = Array.isArray(model) ? model : [model]
  return models.filter(Boolean).join(', ') || '-'
}

const providerNames: Record<string, string> = {
  chatfire: 'ChatFire', openai: 'OpenAI', gemini: 'Gemini', google: 'Google',
  volcengine: '火山引擎', volces: '火山引擎', minimax: 'MiniMax',
  vidu: 'Vidu', openrouter: 'OpenRouter', qwen: '阿里百炼',
}
function providerName(id: string) { return providerNames[id] || id }

const providerColors: Record<string, string> = {
  chatfire: '#f97316', openai: '#10a37f', gemini: '#4285f4', google: '#4285f4',
  volcengine: '#3370ff', volces: '#3370ff', minimax: '#8b5cf6',
  vidu: '#06b6d4', openrouter: '#f59e0b', qwen: '#6366f1',
}
function providerColor(id: string) { return providerColors[id] || '#6366f1' }

// --- Toggle ---
async function toggleConfig(id: number, active: boolean) {
  try {
    await aiAPI.update(id, { is_active: active })
    loadAll()
  } catch { toast.error('操作失败') }
}

// --- Delete ---
async function deleteConfig(id: number) {
  try {
    await aiAPI.delete(id)
    toast.success('已删除')
    loadAll()
  } catch { toast.error('删除失败') }
}

// --- Edit/Create Dialog ---
const editDialogOpen = ref(false)
const editingConfig = ref<AIServiceConfig | null>(null)
const editForm = reactive({ provider: '', api_key: '', base_url: '', modelStr: '', service_type: 'text' as AIServiceType })

function startEdit(cfg: AIServiceConfig) {
  editingConfig.value = cfg
  const models = Array.isArray(cfg.model) ? cfg.model : [cfg.model]
  Object.assign(editForm, {
    provider: cfg.provider || '',
    api_key: cfg.api_key || '',
    base_url: cfg.base_url || '',
    modelStr: models.filter(Boolean).join(', '),
    service_type: cfg.service_type,
  })
  editDialogOpen.value = true
}

function startCreate(type: AIServiceType) {
  editingConfig.value = null
  Object.assign(editForm, { provider: '', api_key: '', base_url: '', modelStr: '', service_type: type })
  editDialogOpen.value = true
}

async function saveEdit() {
  const f = editForm
  if (!f.provider) { toast.warning('请选择服务商'); return }
  const models = f.modelStr.split(',').map(s => s.trim()).filter(Boolean)
  saving.value = true
  try {
    if (editingConfig.value) {
      await aiAPI.update(editingConfig.value.id, {
        provider: f.provider,
        api_key: f.api_key,
        base_url: f.base_url || getDefaultBaseUrl(f.provider),
        model: models,
      })
    } else {
      await aiAPI.create({
        service_type: f.service_type,
        provider: f.provider,
        name: `${providerName(f.provider)}-${serviceSections.find(s => s.type === f.service_type)?.label || f.service_type}`,
        api_key: f.api_key,
        base_url: f.base_url || getDefaultBaseUrl(f.provider),
        model: models,
        priority: 0,
      })
    }
    toast.success('保存成功')
    editDialogOpen.value = false
    loadAll()
  } catch { toast.error('保存失败') }
  finally { saving.value = false }
}

function getDefaultBaseUrl(providerId: string): string {
  const defaults: Record<string, string> = {
    chatfire: 'https://api.chatfire.site/v1', openai: 'https://api.openai.com/v1',
    gemini: 'https://generativelanguage.googleapis.com', google: 'https://generativelanguage.googleapis.com',
    volcengine: 'https://ark.cn-beijing.volces.com/api/v3', volces: 'https://ark.cn-beijing.volces.com/api/v3',
    minimax: 'https://api.minimaxi.com/v1', vidu: 'https://api.vidu.com/v1',
    openrouter: 'https://openrouter.ai/api/v1', qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  }
  return defaults[providerId] || ''
}

// --- Load ---
async function loadAll() {
  loading.value = true
  try {
    const [text, image, video, audio, providers] = await Promise.all([
      aiAPI.list('text'), aiAPI.list('image'), aiAPI.list('video'),
      aiAPI.list('audio'), aiAPI.listProviders(),
    ])
    allConfigs.value = [...text, ...image, ...video, ...audio]
    allProviders.value = providers
  } catch (error: any) { toast.error(error.message || '加载失败') }
  finally { loading.value = false }
}

// --- Quick Setup ---
const quickSetupVisible = ref(false)
const quickSetupApiKey = ref('')
const quickSetupLoading = ref(false)
const presetModelsMap = computed(() => buildPresetModels(allProviders.value))

function chatfireFirstModel(serviceType: AIServiceType): string {
  return presetModelsMap.value['chatfire']?.[serviceType]?.[0] || '-'
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
    const created: string[] = []
    for (const { key, label } of types) {
      if (!allConfigs.value.find(c => c.provider === 'chatfire' && c.service_type === key)) {
        const firstModel = chatfireFirstModel(key)
        await aiAPI.create({
          service_type: key, provider: 'chatfire', name: `ChatFire-${label}`,
          base_url: baseUrl, api_key: apiKey, model: firstModel !== '-' ? [firstModel] : [], priority: 0,
        })
        created.push(label)
      }
    }
    toast.success(created.length > 0 ? `已创建 ${created.join('、')} 配置` : '所有配置已存在')
    quickSetupVisible.value = false; loadAll()
  } catch (error: any) { toast.error(error.message || '配置失败') }
  finally { quickSetupLoading.value = false }
}

onMounted(() => { loadAll() })
</script>

<style scoped>
/* Tab Nav */
.settings-tabs { display: flex; gap: 4px; margin-bottom: 20px; border-bottom: 1px solid var(--border-primary); padding-bottom: 0; }
.settings-tab { padding: 8px 20px; font-size: 14px; font-weight: 500; color: var(--text-muted); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; transition: all 0.2s; }
.settings-tab:hover { color: var(--accent); }
.settings-tab.active, .settings-tab.router-link-exact-active { color: var(--accent); border-bottom-color: var(--accent); }

/* Page Header */
.page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
.page-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin: 0; }
.page-subtitle { font-size: 13px; color: var(--text-muted); margin: 4px 0 0; }

.loading-wrap { display: flex; flex-direction: column; gap: 16px; }

/* Sections */
.sections { display: flex; flex-direction: column; gap: 24px; }

.svc-section { display: flex; flex-direction: column; gap: 8px; }

.section-header { display: flex; align-items: center; justify-content: space-between; }

.section-title-row { display: flex; align-items: center; gap: 8px; }
.section-icon { color: var(--text-muted); }
.section-title { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0; }
.section-count { font-size: 11px; color: var(--text-muted); background: rgba(255,255,255,0.06); padding: 1px 8px; border-radius: 9999px; }

/* Config list */
.config-list { display: flex; flex-direction: column; gap: 4px; }

.config-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--bg-card);
  transition: border-color 0.15s;
}

.config-row:hover { border-color: rgba(255,255,255,0.12); }

.config-left { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }

.provider-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
}

.config-info { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.config-provider { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.config-models { font-size: 11px; color: var(--text-muted); font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.config-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.config-url { font-size: 10px; color: var(--text-muted); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.key-status { font-size: 10px; padding: 1px 6px; border-radius: 9999px; }
.key-status.has-key { background: rgba(34,197,94,0.1); color: rgba(34,197,94,0.8); }
.key-status.no-key { background: rgba(234,179,8,0.1); color: rgba(234,179,8,0.8); }

.edit-btn, .del-btn { width: 26px !important; height: 26px !important; padding: 0 !important; color: var(--text-muted) !important; }
.edit-btn:hover { color: var(--accent) !important; }
.del-btn:hover { color: #ef4444 !important; }

.config-empty { padding: 20px; text-align: center; font-size: 12px; color: var(--text-muted); }

.add-config-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 8px; border: 1px dashed var(--border-primary); border-radius: 8px;
  background: transparent; color: var(--text-muted); font-size: 12px; cursor: pointer;
  transition: all 0.15s;
}
.add-config-btn:hover { border-color: var(--accent); color: var(--text-primary); }

/* Dialog form */
.dialog-form { display: flex; flex-direction: column; gap: 12px; }
.form-row { display: flex; flex-direction: column; gap: 4px; }
.form-row label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }

/* Quick Setup */
.quick-info { margin-bottom: 12px; padding: 10px 14px; background: var(--bg-primary); border-radius: 8px; font-size: 13px; color: var(--text-secondary); }
.quick-info p { margin: 0 0 4px; }
.quick-tip { font-size: 11px; color: var(--text-muted); }
.quick-footer { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.register-link { font-size: 11px; color: var(--text-muted); text-decoration: none; }
.register-link:hover { color: var(--accent); }
.footer-btns { display: flex; gap: 8px; }
.required { color: #ef4444; }
</style>
