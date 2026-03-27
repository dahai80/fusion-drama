<template>
  <div class="page fade-in">
    <header class="page-header">
      <h1 class="page-title">AI 服务配置</h1>
    </header>

    <div class="sections">
      <section v-for="svc in serviceTypes" :key="svc.type" class="svc-section">
        <div class="section-head">
          <component :is="svc.icon" :size="15" style="color:var(--text-muted)" />
          <h3>{{ svc.label }}</h3>
          <span v-if="getCount(svc.type)" class="badge badge-accent">{{ getCount(svc.type) }}</span>
        </div>

        <div class="config-list">
          <div v-for="cfg in getConfigs(svc.type)" :key="cfg.id" class="config-row">
            <div class="config-left">
              <span class="config-name">{{ cfg.provider }}</span>
              <span class="config-model mono">{{ formatModel(cfg.model) }}</span>
            </div>
            <div class="config-right">
              <span class="badge" :class="cfg.api_key || cfg.apiKey ? 'badge-success' : ''">
                {{ cfg.api_key || cfg.apiKey ? '已配置' : '无密钥' }}
              </span>
              <label class="switch">
                <input type="checkbox" :checked="cfg.is_active ?? cfg.isActive" @change="toggleActive(cfg)">
                <span class="slider" />
              </label>
              <button class="btn btn-ghost btn-sm" @click="delConfig(cfg.id)">
                <Trash2 :size="12" />
              </button>
            </div>
          </div>

          <button class="add-btn" @click="startAdd(svc.type)">
            <Plus :size="12" /> 添加{{ svc.label }}服务
          </button>
        </div>
      </section>
    </div>

    <!-- Add dialog -->
    <div v-if="adding" class="overlay" @click.self="adding = false">
      <form class="dialog" @submit.prevent="doAdd">
        <h3>添加服务</h3>
        <input v-model="form.provider" class="input" placeholder="服务商 (chatfire / openai / gemini)" />
        <input v-model="form.api_key" class="input" type="password" placeholder="API Key" />
        <input v-model="form.base_url" class="input" placeholder="Base URL" />
        <input v-model="form.model" class="input" placeholder="模型名称" />
        <div class="dialog-actions">
          <button type="button" class="btn" @click="adding = false">取消</button>
          <button type="submit" class="btn btn-primary">保存</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Type, ImageIcon, Video, AudioLines, Plus, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { aiConfigAPI } from '@/api'

const configs = ref<any[]>([])
const adding = ref(false)
const form = ref({ provider: '', api_key: '', base_url: '', model: '', service_type: 'text' })

const serviceTypes = [
  { type: 'text', label: '文本', icon: Type },
  { type: 'image', label: '图片', icon: ImageIcon },
  { type: 'video', label: '视频', icon: Video },
  { type: 'audio', label: '音频', icon: AudioLines },
]

function getConfigs(type: string) {
  return configs.value.filter(c => (c.service_type || c.serviceType) === type)
}

function getCount(type: string) {
  return getConfigs(type).filter(c => c.is_active ?? c.isActive).length
}

function formatModel(m: any) {
  if (Array.isArray(m)) return m.join(', ')
  return m || '-'
}

async function load() {
  try { configs.value = await aiConfigAPI.list() } catch (e: any) { toast.error(e.message) }
}

async function toggleActive(cfg: any) {
  const active = !(cfg.is_active ?? cfg.isActive)
  await aiConfigAPI.update(cfg.id, { is_active: active })
  load()
}

async function delConfig(id: number) {
  await aiConfigAPI.del(id)
  toast.success('已删除')
  load()
}

function startAdd(type: string) {
  form.value = { provider: '', api_key: '', base_url: '', model: '', service_type: type }
  adding.value = true
}

async function doAdd() {
  const f = form.value
  if (!f.provider) { toast.warning('请填写服务商'); return }
  try {
    await aiConfigAPI.create({
      service_type: f.service_type,
      provider: f.provider,
      name: `${f.provider}-${f.service_type}`,
      api_key: f.api_key,
      base_url: f.base_url,
      model: f.model ? [f.model] : [],
    })
    adding.value = false
    toast.success('已添加')
    load()
  } catch (e: any) { toast.error(e.message) }
}

onMounted(load)
</script>

<style scoped>
.page { padding: 24px 32px; max-width: 700px; }
.page-header { margin-bottom: 24px; }
.page-title { font-size: 18px; font-weight: 700; }

.sections { display: flex; flex-direction: column; gap: 24px; }
.section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.section-head h3 { font-size: 14px; font-weight: 600; }

.config-list { display: flex; flex-direction: column; gap: 4px; }
.config-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg-card); }
.config-left { display: flex; align-items: center; gap: 10px; }
.config-name { font-size: 13px; font-weight: 600; }
.config-model { font-size: 11px; color: var(--text-muted); }
.config-right { display: flex; align-items: center; gap: 8px; }
.mono { font-family: monospace; }

.switch { position: relative; width: 32px; height: 18px; cursor: pointer; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; inset: 0; background: var(--border); border-radius: 9px; transition: 0.2s; }
.slider::before { content: ''; position: absolute; height: 14px; width: 14px; left: 2px; bottom: 2px; background: var(--text-muted); border-radius: 50%; transition: 0.2s; }
.switch input:checked + .slider { background: var(--accent); }
.switch input:checked + .slider::before { transform: translateX(14px); background: #fff; }

.add-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 8px; border: 1px dashed var(--border); border-radius: var(--radius); background: transparent; color: var(--text-muted); font-size: 12px; cursor: pointer; transition: all 0.15s; }
.add-btn:hover { border-color: var(--accent); color: var(--text); }

.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 420px; display: flex; flex-direction: column; gap: 12px; }
.dialog h3 { font-size: 16px; font-weight: 600; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
