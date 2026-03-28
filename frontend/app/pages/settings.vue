<template>
  <div class="page">
    <div class="page-head">
      <h1 class="page-title">AI 服务配置</h1>
    </div>
    <div class="sections">
      <section v-for="st in types" :key="st.type">
        <div class="section-head">
          <span class="section-title">{{ st.label }}</span>
          <span v-if="countActive(st.type)" class="tag tag-accent">{{ countActive(st.type) }}</span>
          <button class="btn btn-ghost btn-sm ml-auto" @click="startAdd(st.type)"><Plus :size="13" /> 添加</button>
        </div>
        <div class="config-list">
          <div v-for="c in byType(st.type)" :key="c.id" class="card config-row">
            <div class="config-info">
              <span class="config-provider">{{ c.provider }}</span>
              <span class="config-model mono truncate">{{ fmtModel(c.model) }}</span>
            </div>
            <span :class="['tag', c.api_key ? 'tag-success' : 'tag-error']">{{ c.api_key ? '已配置' : '无密钥' }}</span>
            <label class="toggle"><input type="checkbox" :checked="c.is_active" @change="toggleCfg(c)"><span /></label>
            <button class="btn btn-ghost btn-icon" @click="startEdit(c)"><Pencil :size="13" /></button>
            <button class="btn btn-ghost btn-icon" @click="delCfg(c.id)"><Trash2 :size="13" /></button>
          </div>
          <p v-if="!byType(st.type).length" class="config-empty">暂无配置</p>
        </div>
      </section>
    </div>

    <div v-if="dialogOpen" class="overlay" @click.self="dialogOpen = false">
      <form class="modal card" @submit.prevent="saveCfg">
        <h2 class="modal-title">{{ editId ? '编辑' : '添加' }}服务</h2>
        <label class="field"><span class="field-label">服务商</span>
          <select v-model="form.provider" class="input"><option value="">选择</option><option v-for="p in providers" :key="p" :value="p">{{ p }}</option></select>
        </label>
        <label class="field"><span class="field-label">API Key</span><input v-model="form.api_key" class="input" type="password" placeholder="sk-..." /></label>
        <label class="field"><span class="field-label">Base URL</span><input v-model="form.base_url" class="input" placeholder="https://..." /></label>
        <label class="field"><span class="field-label">模型（逗号分隔）</span><input v-model="form.modelStr" class="input" placeholder="model-name" /></label>
        <div class="modal-actions">
          <button type="button" class="btn" @click="dialogOpen = false">取消</button>
          <button type="submit" class="btn btn-primary">保存</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { Plus, Pencil, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { aiConfigAPI } from '~/composables/useApi'

const cfgs = ref([])
const dialogOpen = ref(false)
const editId = ref(null)
const form = reactive({ provider: '', api_key: '', base_url: '', modelStr: '', service_type: 'text' })
const types = [{ type: 'text', label: '文本' }, { type: 'image', label: '图片' }, { type: 'video', label: '视频' }, { type: 'audio', label: '音频' }]
const providers = ['chatfire', 'openai', 'gemini', 'volcengine', 'minimax', 'openrouter', 'qwen']

function byType(t) { return cfgs.value.filter(c => c.service_type === t) }
function countActive(t) { return byType(t).filter(c => c.is_active).length }
function fmtModel(m) { return Array.isArray(m) ? m.join(', ') : m || '—' }

async function load() { try { cfgs.value = await aiConfigAPI.list() } catch (e) { toast.error(e.message) } }
async function toggleCfg(c) { await aiConfigAPI.update(c.id, { is_active: !c.is_active }); load() }
async function delCfg(id) { await aiConfigAPI.del(id); toast.success('已删除'); load() }
function startAdd(t) { editId.value = null; Object.assign(form, { provider: '', api_key: '', base_url: '', modelStr: '', service_type: t }); dialogOpen.value = true }
function startEdit(c) { editId.value = c.id; Object.assign(form, { provider: c.provider, api_key: c.api_key || '', base_url: c.base_url || '', modelStr: fmtModel(c.model), service_type: c.service_type }); dialogOpen.value = true }
async function saveCfg() {
  if (!form.provider) { toast.warning('选择服务商'); return }
  const models = form.modelStr.split(',').map(s => s.trim()).filter(Boolean)
  try {
    if (editId.value) await aiConfigAPI.update(editId.value, { provider: form.provider, api_key: form.api_key, base_url: form.base_url, model: models })
    else await aiConfigAPI.create({ service_type: form.service_type, provider: form.provider, name: `${form.provider}-${form.service_type}`, api_key: form.api_key, base_url: form.base_url, model: models })
    dialogOpen.value = false; toast.success('已保存'); load()
  } catch (e) { toast.error(e.message) }
}
onMounted(load)
</script>

<style scoped>
.page { padding: 32px 40px; overflow-y: auto; height: 100%; max-width: 700px; margin: 0 auto; }
.page-head { margin-bottom: 28px; }
.page-title { font-size: 22px; font-weight: 700; }

.sections { display: flex; flex-direction: column; gap: 24px; }
.section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.section-title { font-size: 13px; font-weight: 600; }

.config-list { display: flex; flex-direction: column; gap: 6px; }
.config-row { display: flex; align-items: center; gap: 8px; padding: 10px 14px; }
.config-info { flex: 1; display: flex; align-items: center; gap: 10px; min-width: 0; }
.config-provider { font-size: 13px; font-weight: 600; }
.config-model { font-size: 11px; color: var(--text-2); }
.config-empty { font-size: 12px; color: var(--text-3); padding: 12px 0; }

.toggle { position: relative; width: 30px; height: 17px; cursor: pointer; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle span { position: absolute; inset: 0; background: var(--bg-3); border-radius: 99px; transition: 0.2s; }
.toggle span::before { content: ''; position: absolute; width: 13px; height: 13px; left: 2px; bottom: 2px; background: var(--bg-0); border-radius: 50%; transition: 0.2s; box-shadow: var(--shadow); }
.toggle input:checked + span { background: var(--accent); }
.toggle input:checked + span::before { transform: translateX(13px); }

.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { padding: 24px; width: 400px; }
.modal-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
.field { display: flex; flex-direction: column; gap: 5px; margin-bottom: 12px; }
.field-label { font-size: 12px; font-weight: 500; color: var(--text-1); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 8px; }
</style>
