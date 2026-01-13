<template>
  <div class="ai-config-container">
    <el-page-header @back="goBack" title="返回">
      <template #content>
        <div class="page-header">
          <h2>AI 服务配置</h2>
          <el-button type="primary" @click="showCreateDialog" :icon="Plus">添加配置</el-button>
        </div>
      </template>
    </el-page-header>

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="文本生成" name="text">
        <ConfigList 
          :configs="configs" 
          :loading="loading"
          :show-test-button="true"
          @edit="handleEdit"
          @delete="handleDelete"
          @toggle-active="handleToggleActive"
          @test="handleTest"
        />
      </el-tab-pane>
      
      <el-tab-pane label="图片生成" name="image">
        <ConfigList 
          :configs="configs" 
          :loading="loading"
          :show-test-button="false"
          @edit="handleEdit"
          @delete="handleDelete"
          @toggle-active="handleToggleActive"
        />
      </el-tab-pane>
      
      <el-tab-pane label="视频生成" name="video">
        <ConfigList 
          :configs="configs" 
          :loading="loading"
          :show-test-button="false"
          @edit="handleEdit"
          @delete="handleDelete"
          @toggle-active="handleToggleActive"
        />
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? '编辑配置' : '添加配置'"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="100px"
      >
        <el-form-item label="配置名称" prop="name">
          <el-input v-model="form.name" placeholder="例如：OpenAI GPT-4" />
        </el-form-item>

        <el-form-item label="厂商" prop="provider">
          <el-select 
            v-model="form.provider" 
            placeholder="请选择厂商"
            @change="handleProviderChange"
            style="width: 100%"
          >
            <el-option
              v-for="provider in availableProviders"
              :key="provider.id"
              :label="provider.name"
              :value="provider.id"
              :disabled="provider.disabled"
            />
          </el-select>
          <div class="form-tip">选择AI服务提供商</div>
        </el-form-item>

        <el-form-item label="优先级" prop="priority">
          <el-input-number 
            v-model="form.priority" 
            :min="0" 
            :max="100"
            :step="1"
            style="width: 100%"
          />
          <div class="form-tip">数值越大优先级越高，相同模型时优先使用高优先级配置</div>
        </el-form-item>

        <el-form-item label="模型" prop="model">
          <el-select 
            v-model="form.model" 
            placeholder="输入或选择模型名称"
            multiple
            filterable
            allow-create
            default-first-option
            collapse-tags
            collapse-tags-tooltip
            style="width: 100%"
          >
            <el-option
              v-for="model in availableModels"
              :key="model"
              :label="model"
              :value="model"
            />
          </el-select>
          <div class="form-tip">可直接输入模型名称或从列表选择，支持多个模型</div>
        </el-form-item>

        <el-form-item label="Base URL" prop="base_url">
          <el-input v-model="form.base_url" placeholder="https://api.openai.com" />
          <div class="form-tip">
            API 服务的基础地址，如 Chatfire: https://api.chatfire.site/v1，Gemini: https://generativelanguage.googleapis.com（无需 /v1）
            <br>
            完整调用路径: {{ fullEndpointExample }}
          </div>
        </el-form-item>

        <el-form-item label="API Key" prop="api_key">
          <el-input 
            v-model="form.api_key" 
            type="password" 
            show-password
            placeholder="sk-..."
          />
          <div class="form-tip">您的 API 密钥</div>
        </el-form-item>

        <el-form-item v-if="isEdit" label="启用状态">
          <el-switch v-model="form.is_active" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button v-if="form.service_type === 'text'" @click="testConnection" :loading="testing">测试连接</el-button>
        <el-button type="primary" @click="handleSubmit" :loading="submitting">
          {{ isEdit ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { aiAPI } from '@/api/ai'
import type { AIServiceConfig, AIServiceType, CreateAIConfigRequest, UpdateAIConfigRequest } from '@/types/ai'
import ConfigList from './components/ConfigList.vue'

const router = useRouter()

const activeTab = ref<AIServiceType>('text')
const loading = ref(false)
const configs = ref<AIServiceConfig[]>([])
const dialogVisible = ref(false)
const isEdit = ref(false)
const editingId = ref<number>()
const formRef = ref<FormInstance>()
const submitting = ref(false)
const testing = ref(false)

const form = reactive<CreateAIConfigRequest & { is_active?: boolean, provider?: string }>({
  service_type: 'text',
  provider: '',
  name: '',
  base_url: '',
  api_key: '',
  model: [],  // 改为数组支持多选
  priority: 0,  // 默认优先级为0
  is_active: true
})

// 厂商和模型配置
interface ProviderConfig {
  id: string
  name: string
  models: string[]
  disabled?: boolean
}

const providerConfigs: Record<AIServiceType, ProviderConfig[]> = {
  text: [
    { id: 'openai', name: 'OpenAI', models: ['gpt-5.2', 'gemini-3-pro-preview'] },
    { 
      id: 'chatfire', 
      name: 'Chatfire', 
      models: [
        'gpt-4o',
        'claude-sonnet-4-5-20250929',
        'doubao-seed-1-8-251228',
        'kimi-k2-thinking',
        'gemini-3-pro',
        'gemini-2.5-pro',
        'gemini-3-pro-preview'
      ]
    },
    { 
      id: 'gemini', 
      name: 'Google Gemini', 
      models: [
        'gemini-2.5-pro',
        'gemini-3-pro-preview'
      ]
    }
  ],
  image: [
    { 
      id: 'volcengine', 
      name: '火山引擎', 
      models: [
        'doubao-seedream-4-5-251128',
        'doubao-seedream-4-0-250828',
      ]
    },
    { 
      id: 'chatfire', 
      name: 'Chatfire', 
      models: [
        'doubao-seedream-4-5-251128',
        'nano-banana-pro',
      ]
    },
    { 
      id: 'gemini', 
      name: 'Google Gemini', 
      models: [
        'gemini-3-pro-image-preview',
      ]
    },
    { id: 'openai', name: 'OpenAI', models: ['dall-e-3', 'dall-e-2'] }
  ],
  video: [
    { 
      id: 'volces', 
      name: '火山引擎', 
      models: [
        'doubao-seedance-1-5-pro-251215',
        'doubao-seedance-1-0-lite-i2v-250428',
        'doubao-seedance-1-0-lite-t2v-250428',
        'doubao-seedance-1-0-pro-250528',
        'doubao-seedance-1-0-pro-fast-251015'
      ]
    },
    { 
      id: 'chatfire', 
      name: 'Chatfire', 
      models: [
        'doubao-seedance-1-5-pro-251215',
        'doubao-seedance-1-0-lite-i2v-250428',
        'doubao-seedance-1-0-lite-t2v-250428',
        'doubao-seedance-1-0-pro-250528',
        'doubao-seedance-1-0-pro-fast-251015',
        'sora',
        'sora-pro'
      ]
    },
    { id: 'openai', name: 'OpenAI', models: ['sora-2', 'sora-2-pro'] },
//    { id: 'minimax', name: 'MiniMax', models: ['MiniMax-Hailuo-2.3', 'MiniMax-Hailuo-2.3-Fast', 'MiniMax-Hailuo-02'] }
  ]
}

// 当前可用的厂商列表
const availableProviders = computed(() => {
  return providerConfigs[form.service_type] || []
})

// 当前可用的模型列表
const availableModels = computed(() => {
  if (!form.provider) return []
  const provider = availableProviders.value.find(p => p.id === form.provider)
  return provider?.models || []
})

// 完整端点示例
const fullEndpointExample = computed(() => {
  const baseUrl = form.base_url || 'https://api.example.com'
  const provider = form.provider
  const serviceType = form.service_type
  
  let endpoint = ''
  
  if (serviceType === 'text') {
    if (provider === 'gemini' || provider === 'google') {
      endpoint = '/v1beta/models/{model}:generateContent'
    } else {
      endpoint = '/chat/completions'
    }
  } else if (serviceType === 'image') {
    if (provider === 'gemini' || provider === 'google') {
      endpoint = '/v1beta/models/{model}:generateContent'
    } else {
      endpoint = '/images/generations'
    }
  } else if (serviceType === 'video') {
    if (provider === 'chatfire') {
      endpoint = '/video/generations'
    } else if (provider === 'doubao' || provider === 'volcengine' || provider === 'volces') {
      endpoint = '/contents/generations/tasks'
    } else if (provider === 'openai') {
      endpoint = '/videos'
    } else {
      endpoint = '/video/generations'
    }
  }
  
  return baseUrl + endpoint
})

const rules: FormRules = {
  name: [
    { required: true, message: '请输入配置名称', trigger: 'blur' }
  ],
  provider: [
    { required: true, message: '请选择厂商', trigger: 'change' }
  ],
  base_url: [
    { required: true, message: '请输入 Base URL', trigger: 'blur' },
    { type: 'url', message: '请输入正确的 URL 格式', trigger: 'blur' }
  ],
  api_key: [
    { required: true, message: '请输入 API Key', trigger: 'blur' }
  ],
  model: [
    { 
      required: true, 
      message: '请至少选择一个模型', 
      trigger: 'change',
      validator: (rule: any, value: any, callback: any) => {
        if (Array.isArray(value) && value.length > 0) {
          callback()
        } else if (typeof value === 'string' && value.length > 0) {
          callback()
        } else {
          callback(new Error('请至少选择一个模型'))
        }
      }
    }
  ]
}

const loadConfigs = async () => {
  loading.value = true
  try {
    configs.value = await aiAPI.list(activeTab.value)
  } catch (error: any) {
    ElMessage.error(error.message || '加载失败')
  } finally {
    loading.value = false
  }
}

// 生成随机配置名称
const generateConfigName = (provider: string, serviceType: AIServiceType): string => {
  const providerNames: Record<string, string> = {
    'chatfire': 'ChatFire',
    'openai': 'OpenAI',
    'gemini': 'Gemini',
    'google': 'Google'
  }
  
  const serviceNames: Record<AIServiceType, string> = {
    'text': '文本',
    'image': '图片',
    'video': '视频'
  }
  
  const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  const providerName = providerNames[provider] || provider
  const serviceName = serviceNames[serviceType] || serviceType
  
  return `${providerName}-${serviceName}-${randomNum}`
}

const showCreateDialog = () => {
  isEdit.value = false
  editingId.value = undefined
  resetForm()
  form.service_type = activeTab.value
  // 默认选择 chatfire
  form.provider = 'chatfire'
  // 设置默认 base_url
  form.base_url = 'https://api.chatfire.site/v1'
  // 自动生成随机配置名称
  form.name = generateConfigName('chatfire', activeTab.value)
  dialogVisible.value = true
}

const handleEdit = (config: AIServiceConfig) => {
  isEdit.value = true
  editingId.value = config.id
  
  Object.assign(form, {
    service_type: config.service_type,
    provider: config.provider || 'chatfire',  // 直接使用配置中的 provider，默认为 chatfire
    name: config.name,
    base_url: config.base_url,
    api_key: config.api_key,
    model: Array.isArray(config.model) ? config.model : [config.model],  // 统一转换为数组
    priority: config.priority || 0,
    is_active: config.is_active
  })
  dialogVisible.value = true
}

const handleDelete = async (config: AIServiceConfig) => {
  try {
    await ElMessageBox.confirm('确定要删除该配置吗？', '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    await aiAPI.delete(config.id)
    ElMessage.success('删除成功')
    loadConfigs()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

const handleToggleActive = async (config: AIServiceConfig) => {
  try {
    const newActiveState = !config.is_active
    await aiAPI.update(config.id, { is_active: newActiveState })
    ElMessage.success(newActiveState ? '已启用配置' : '已禁用配置')
    await loadConfigs()
  } catch (error: any) {
    ElMessage.error(error.message || '操作失败')
  }
}

const testConnection = async () => {
  if (!formRef.value) return
  
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  
  testing.value = true
  try {
    await aiAPI.testConnection({
      base_url: form.base_url,
      api_key: form.api_key,
      model: form.model,
      provider: form.provider
    })
    ElMessage.success('连接测试成功！')
  } catch (error: any) {
    ElMessage.error(error.message || '连接测试失败')
  } finally {
    testing.value = false
  }
}

const handleTest = async (config: AIServiceConfig) => {
  testing.value = true
  try {
    await aiAPI.testConnection({
      base_url: config.base_url,
      api_key: config.api_key,
      model: config.model,
      provider: config.provider
    })
    ElMessage.success('连接测试成功！')
  } catch (error: any) {
    ElMessage.error(error.message || '连接测试失败')
  } finally {
    testing.value = false
  }
}

const handleSubmit = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (!valid) return
    
    submitting.value = true
    try {
      if (isEdit.value && editingId.value) {
        const updateData: UpdateAIConfigRequest = {
          name: form.name,
          provider: form.provider,
          base_url: form.base_url,
          api_key: form.api_key,
          model: form.model,
          priority: form.priority,
          is_active: form.is_active
        }
        await aiAPI.update(editingId.value, updateData)
        ElMessage.success('更新成功')
      } else {
        await aiAPI.create(form)
        ElMessage.success('创建成功')
      }
      
      dialogVisible.value = false
      loadConfigs()
    } catch (error: any) {
      ElMessage.error(error.message || '操作失败')
    } finally {
      submitting.value = false
    }
  })
}

const handleTabChange = (tabName: string | number) => {
  // 标签页切换时重新加载对应服务类型的配置
  activeTab.value = tabName as AIServiceType
  loadConfigs()
}

const handleProviderChange = () => {
  // 切换厂商时清空已选模型
  form.model = []
  
  // 根据厂商自动设置默认 base_url
  if (form.provider === 'gemini' || form.provider === 'google') {
    form.base_url = 'https://api.chatfire.site'
  } else {
    // openai, chatfire 等其他厂商
    form.base_url = 'https://api.chatfire.site/v1'
  }
  
  // 仅在新建配置时自动更新名称
  if (!isEdit.value) {
    form.name = generateConfigName(form.provider, form.service_type)
  }
}

// getDefaultEndpoint 已移除，端点由后端根据 provider 自动设置
// 保留该函数定义以避免编译错误
const getDefaultEndpoint = (serviceType: AIServiceType): string => {
  switch (serviceType) {
    case 'text':
      return ''
    case 'image':
      return '/v1/images/generations'
    case 'video':
      return '/v1/video/generations'
    default:
      return '/v1/chat/completions'
  }
}

const resetForm = () => {
  const serviceType = form.service_type || 'text'
  Object.assign(form, {
    service_type: serviceType,
    provider: '',
    name: '',
    base_url: '',
    api_key: '',
    model: [],  // 改为空数组
    priority: 0,
    is_active: true
  })
  formRef.value?.resetFields()
}

const goBack = () => {
  router.back()
}

onMounted(() => {
  loadConfigs()
})
</script>

<style scoped>
.ai-config-container {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

:deep(.el-page-header__header) {
  display: flex;
  align-items: center;
  padding-bottom: 20px;
}

:deep(.el-page-header__left) {
  display: flex;
  align-items: center;
  height: 100%;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 24px;
  width: 100%;
}

.page-header h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: #303133;
  flex: 1;
}

.form-tip {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
}
</style>
