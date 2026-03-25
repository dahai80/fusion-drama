<template>
  <Dialog v-model:open="visible">
    <DialogContent class="sm:max-w-[900px] max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <div class="dialog-header">
          <DialogTitle>{{ $t("aiConfig.title") }}</DialogTitle>
          <Button variant="outline" size="sm" @click="showQuickSetupDialog">
            <Wand2 :size="16" class="mr-1" />
            <span>一键配置火宝</span>
          </Button>
        </div>
      </DialogHeader>

      <!-- Provider Cards Grid -->
      <div class="dialog-provider-grid">
        <template v-if="loading">
          <Skeleton v-for="i in 4" :key="i" class="h-64 rounded-lg" />
        </template>
        <ProviderCard
          v-for="group in providerGroupsWithConfigs"
          :key="group.key"
          :provider-group="group"
          :configs="group.configs"
          :preset-models="group.presetModels"
          @refresh="loadAll"
        />
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
            <a href="https://api.chatfire.site/login?inviteCode=C4453345" target="_blank" class="register-link">没有 API Key？点击注册</a>
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
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Wand2, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { aiAPI } from '@/api/ai'
import type { AIServiceConfig, AIServiceProvider, AIServiceType } from '@/types/ai'
import { PROVIDER_GROUPS, buildPresetModels } from '@/constants/ai-providers'
import ProviderCard from '@/views/settings/components/ProviderCard.vue'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; 'config-updated': [] }>()

const visible = computed({ get: () => props.modelValue, set: (val) => emit('update:modelValue', val) })

const loading = ref(false)
const allConfigs = ref<AIServiceConfig[]>([])
const allProviders = ref<AIServiceProvider[]>([])
const quickSetupVisible = ref(false)
const quickSetupApiKey = ref('')
const quickSetupLoading = ref(false)

const presetModelsMap = computed(() => buildPresetModels(allProviders.value))

const providerGroupsWithConfigs = computed(() => {
  return PROVIDER_GROUPS.map(group => {
    const configs = allConfigs.value.filter(c => group.ids.includes(c.provider || ''))
    const presetModels = presetModelsMap.value[group.key] || { text: [], image: [], video: [], audio: [], lipsync: [] }
    return { ...group, configs, presetModels }
  })
})

function chatfireFirstModel(serviceType: AIServiceType): string {
  const models = presetModelsMap.value['chatfire']?.[serviceType]
  return models?.[0] || '-'
}

async function loadAll() {
  loading.value = true
  try {
    const [text, image, video, audio, lipsync, providers] = await Promise.all([
      aiAPI.list('text'), aiAPI.list('image'), aiAPI.list('video'),
      aiAPI.list('audio'), aiAPI.list('lipsync'), aiAPI.listProviders(),
    ])
    allConfigs.value = [...text, ...image, ...video, ...audio, ...lipsync]
    allProviders.value = providers
    emit('config-updated')
  } catch (error: any) { toast.error(error.message || '加载失败') }
  finally { loading.value = false }
}

function showQuickSetupDialog() { quickSetupApiKey.value = ''; quickSetupVisible.value = true }

const generateConfigName = (provider: string, serviceType: AIServiceType): string => {
  const providerNames: Record<string, string> = { chatfire: 'ChatFire', openai: 'OpenAI', gemini: 'Gemini', google: 'Google' }
  const serviceNames: Record<AIServiceType, string> = { text: '文本', image: '图片', video: '视频', audio: '音频', lipsync: '口型同步' }
  const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `${providerNames[provider] || provider}-${serviceNames[serviceType]}-${randomNum}`
}

async function handleQuickSetup() {
  if (!quickSetupApiKey.value.trim()) { toast.warning('请输入 API Key'); return }
  quickSetupLoading.value = true
  const baseUrl = 'https://api.chatfire.site/v1'
  const apiKey = quickSetupApiKey.value.trim()
  try {
    const [textConfigs, imageConfigs, videoConfigs] = await Promise.all([aiAPI.list('text'), aiAPI.list('image'), aiAPI.list('video')])
    const createdServices: string[] = []; const skippedServices: string[] = []
    const types: { key: AIServiceType; label: string; configs: AIServiceConfig[] }[] = [
      { key: 'text', label: '文本', configs: textConfigs },
      { key: 'image', label: '图片', configs: imageConfigs },
      { key: 'video', label: '视频', configs: videoConfigs },
    ]
    for (const { key, label, configs } of types) {
      if (!configs.find(c => c.base_url === baseUrl)) {
        const firstModel = chatfireFirstModel(key)
        await aiAPI.create({ service_type: key, provider: 'chatfire', name: generateConfigName('chatfire', key), base_url: baseUrl, api_key: apiKey, model: firstModel !== '-' ? [firstModel] : [], priority: 0 })
        createdServices.push(label)
      } else { skippedServices.push(label) }
    }
    if (createdServices.length > 0 && skippedServices.length > 0) toast.success(`已创建 ${createdServices.join('、')} 配置，${skippedServices.join('、')} 配置已存在`)
    else if (createdServices.length > 0) toast.success(`一键配置成功！已创建 ${createdServices.join('、')} 服务配置`)
    else toast.info('所有配置已存在，无需重复创建')
    quickSetupVisible.value = false; loadAll()
  } catch (error: any) { toast.error(error.message || '配置失败') }
  finally { quickSetupLoading.value = false }
}

watch(visible, (val) => { if (val) loadAll() })
</script>

<style scoped>
.dialog-header { display: flex; align-items: center; justify-content: space-between; width: 100%; }
.dialog-provider-grid { display: grid; grid-template-columns: 1fr; gap: 16px; min-height: 200px; }
@media (min-width: 640px) { .dialog-provider-grid { grid-template-columns: repeat(2, 1fr); } }
.quick-setup-info { margin-bottom: 16px; padding: 12px 16px; background: var(--bg-secondary); border-radius: 8px; font-size: 14px; color: var(--text-primary); }
.quick-setup-info p { margin: 0 0 8px 0; }
.quick-setup-info ul { margin: 8px 0; padding-left: 20px; }
.quick-setup-info li { margin: 4px 0; color: var(--text-secondary); }
.quick-setup-info .quick-setup-tip { margin-top: 12px; font-size: 12px; color: var(--text-muted); }
.quick-setup-footer { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.register-link { font-size: 12px; color: var(--text-muted); text-decoration: none; transition: color 0.2s; }
.register-link:hover { color: var(--accent); }
.footer-buttons { display: flex; gap: 8px; }
.form-field { display: flex; flex-direction: column; gap: 0.5rem; }
.form-label { font-size: 0.875rem; font-weight: 500; color: var(--text-primary); }
.required { color: #ef4444; }
.mr-1 { margin-right: 0.25rem; }
</style>
