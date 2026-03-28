<template>
  <div class="page">
    <div class="toolbar">
      <span class="toolbar-title">项目</span>
      <span class="tag">{{ dramas.length }}</span>
      <button class="btn btn-primary" style="margin-left:auto" @click="showCreate = true">+ 创建项目</button>
    </div>
    <div class="list">
      <div v-for="d in dramas" :key="d.id" class="row" @click="navigateTo(`/drama/${d.id}`)">
        <div class="row-title">{{ d.title }}</div>
        <span class="tag">{{ d.episodes?.length || 0 }}集</span>
        <span v-if="d.style" class="tag tag-accent">{{ d.style }}</span>
        <span class="row-date mono">{{ fmtDate(d.updated_at || d.updatedAt) }}</span>
        <button class="btn btn-ghost btn-danger btn-xs" @click.stop="delDrama(d)">✕</button>
      </div>
      <div v-if="!dramas.length" class="empty">暂无项目</div>
    </div>

    <div v-if="showCreate" class="overlay" @click.self="showCreate = false">
      <form class="dialog" @submit.prevent="create">
        <div class="dialog-title">创建项目</div>
        <input v-model="form.title" class="input" placeholder="项目名称" required />
        <div class="form-grid">
          <input v-model.number="form.total_episodes" class="input" type="number" min="1" placeholder="集数" />
          <select v-model="form.style" class="input">
            <option value="">风格</option>
            <option v-for="s in styles" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn" @click="showCreate = false">取消</button>
          <button type="submit" class="btn btn-primary">创建</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { dramaAPI } from '~/composables/useApi'

const dramas = ref([])
const showCreate = ref(false)
const form = ref({ title: '', total_episodes: 1, style: '' })
const styles = ['realistic', 'anime', 'ghibli', 'cinematic', 'comic', 'watercolor']

async function load() {
  try { dramas.value = (await dramaAPI.list()).items || [] } catch (e) { toast.error(e.message) }
}

async function create() {
  if (!form.value.title) return
  try {
    const d = await dramaAPI.create(form.value)
    showCreate.value = false
    navigateTo(`/drama/${d.id}`)
  } catch (e) { toast.error(e.message) }
}

async function delDrama(d) {
  if (!confirm(`删除「${d.title}」？`)) return
  await dramaAPI.del(d.id); load()
}

function fmtDate(s) { return s ? new Date(s).toLocaleDateString('zh-CN') : '' }

onMounted(load)
</script>

<style scoped>
.page { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg-panel); flex-shrink: 0; }
.toolbar-title { font-size: 13px; font-weight: 600; }
.list { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 2px; }
.row { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: var(--radius); cursor: pointer; transition: background 0.1s; }
.row:hover { background: var(--bg-hover); }
.row-title { font-size: 12px; font-weight: 500; flex: 1; }
.row-date { font-size: 10px; color: var(--text-dim); }
.empty { padding: 40px; text-align: center; color: var(--text-muted); }

.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 16px; width: 380px; display: flex; flex-direction: column; gap: 10px; }
.dialog-title { font-size: 13px; font-weight: 600; }
.dialog-footer { display: flex; justify-content: flex-end; gap: 6px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
</style>
