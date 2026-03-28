<template>
  <div class="page">
    <div class="toolbar">
      <span class="toolbar-title">AI 服务配置</span>
    </div>
    <div class="config-scroll">
      <section v-for="st in types" :key="st.type" class="config-section">
        <div class="section-head">
          <span>{{ st.label }}</span>
          <span v-if="countActive(st.type)" class="tag tag-accent">{{ countActive(st.type) }}</span>
          <button class="btn btn-xs" style="margin-left:auto" @click="startAdd(st.type)">+</button>
        </div>
        <div v-for="c in byType(st.type)" :key="c.id" class="config-row">
          <span class="config-provider mono">{{ c.provider }}</span>
          <span class="config-model mono truncate">{{ fmtModel(c.model) }}</span>
          <span :class="['tag', c.api_key ? 'tag-success' : '']">{{ c.api_key ? 'OK' : '无Key' }}</span>
          <label class="toggle"><input type="checkbox" :checked="c.is_active" @change="toggleCfg(c)"><span /></label>
          <button class="btn btn-ghost btn-xs" @click="startEdit(c)">✎</button>
          <button class="btn btn-ghost btn-danger btn-xs" @click="delCfg(c.id)">✕</button>
        </div>
        <div v-if="!byType(st.type).length" class="config-empty">无配置</div>
      </section>
    </div>

    <div v-if="dialogOpen" class="overlay" @click.self="dialogOpen = false">
      <form class="dialog" @submit.prevent="saveCfg">
        <div class="dialog-title">{{ editId ? '编辑' : '添加' }}服务</div>
        <select v-model="form.provider" class="input"><option value="">选择服务商</option><option v-for="p in providers" :key="p" :value="p">{{ p }}</option></select>
        <input v-model="form.api_key" class="input" type="password" placeholder="API Key" />
        <input v-model="form.base_url" class="input" placeholder="Base URL" />
        <input v-model="form.modelStr" class="input" placeholder="模型（逗号分隔）" />
        <div class="dialog-footer">
          <button type="button" class="btn" @click="dialogOpen = false">取消</button>
          <button type="submit" class="btn btn-primary">保存</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
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
function fmtModel(m) { return Array.isArray(m) ? m.join(', ') : m || '-' }

async function load() { try { cfgs.value = await aiConfigAPI.list() } catch (e) { toast.error(e.message) } }
async function toggleCfg(c) { await aiConfigAPI.update(c.id, { is_active: !c.is_active }); load() }
async function delCfg(id) { await aiConfigAPI.del(id); load() }

function startAdd(t) { editId.value = null; Object.assign(form, { provider: '', api_key: '', base_url: '', modelStr: '', service_type: t }); dialogOpen.value = true }
function startEdit(c) { editId.value = c.id; Object.assign(form, { provider: c.provider, api_key: c.api_key || '', base_url: c.base_url || '', modelStr: fmtModel(c.model), service_type: c.service_type }); dialogOpen.value = true }

async function saveCfg() {
  if (!form.provider) { toast.warning('选择服务商'); return }
  const models = form.modelStr.split(',').map(s => s.trim()).filter(Boolean)
  try {
    if (editId.value) await aiConfigAPI.update(editId.value, { provider: form.provider, api_key: form.api_key, base_url: form.base_url, model: models })
    else await aiConfigAPI.create({ service_type: form.service_type, provider: form.provider, name: `${form.provider}-${form.service_type}`, api_key: form.api_key, base_url: form.base_url, model: models })
    dialogOpen.value = false; load()
  } catch (e) { toast.error(e.message) }
}

onMounted(load)
</script>

<style scoped>
.page { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg-panel); flex-shrink: 0; }
.toolbar-title { font-size: 13px; font-weight: 600; }
.config-scroll { flex: 1; overflow-y: auto; padding: 12px 16px; max-width: 600px; margin: 0 auto; width: 100%; }
.config-section { margin-bottom: 16px; }
.section-head { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; margin-bottom: 6px; }
.config-row { display: flex; align-items: center; gap: 6px; padding: 5px 8px; border-radius: var(--radius); font-size: 11px; }
.config-row:hover { background: var(--bg-hover); }
.config-provider { font-weight: 500; min-width: 70px; }
.config-model { flex: 1; font-size: 10px; color: var(--text-muted); }
.config-empty { font-size: 11px; color: var(--text-dim); padding: 8px; }

.toggle { position: relative; width: 28px; height: 16px; cursor: pointer; flex-shrink: 0; }
.toggle input { opacity: 0; width: 0; height: 0; }
.toggle span { position: absolute; inset: 0; background: var(--border); border-radius: 8px; transition: 0.15s; }
.toggle span::before { content: ''; position: absolute; width: 12px; height: 12px; left: 2px; bottom: 2px; background: var(--text-dim); border-radius: 50%; transition: 0.15s; }
.toggle input:checked + span { background: var(--accent); }
.toggle input:checked + span::before { transform: translateX(12px); background: #000; }

.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px; width: 360px; display: flex; flex-direction: column; gap: 8px; }
.dialog-title { font-size: 12px; font-weight: 600; }
.dialog-footer { display: flex; justify-content: flex-end; gap: 6px; }
</style>
