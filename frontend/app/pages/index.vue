<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h1 class="page-title">项目</h1>
        <p class="page-desc">{{ dramas.length }} 个短剧项目</p>
      </div>
      <button class="btn btn-primary" @click="showCreate = true">
        <Plus :size="14" /> 新建项目
      </button>
    </div>

    <div class="grid">
      <div v-for="d in dramas" :key="d.id" class="card project-card" @click="navigateTo(`/drama/${d.id}`)">
        <div class="project-header">
          <h3 class="project-title">{{ d.title }}</h3>
          <button class="btn btn-ghost btn-icon" @click.stop="delDrama(d)" title="删除">
            <Trash2 :size="14" />
          </button>
        </div>
        <div class="project-meta">
          <span class="tag">{{ (d.episodes?.length || 0) }} 集</span>
          <span class="tag">{{ (d.characters?.length || 0) }} 角色</span>
          <span v-if="d.style" class="tag tag-accent">{{ d.style }}</span>
        </div>
        <div class="project-footer">
          <span class="project-date">{{ fmtDate(d.updated_at || d.updatedAt) }}</span>
        </div>
      </div>

      <div v-if="!dramas.length && !loading" class="empty-card card" @click="showCreate = true">
        <Plus :size="24" style="color:var(--text-3)" />
        <p>新建第一个项目</p>
      </div>
    </div>

    <!-- Create Dialog -->
    <div v-if="showCreate" class="overlay" @click.self="showCreate = false">
      <div class="modal card">
        <h2 class="modal-title">新建项目</h2>
        <form @submit.prevent="create" class="modal-form">
          <label class="field">
            <span class="field-label">项目名称</span>
            <input v-model="form.title" class="input" placeholder="输入项目名称" required />
          </label>
          <div class="field-row">
            <label class="field">
              <span class="field-label">集数</span>
              <input v-model.number="form.total_episodes" class="input" type="number" min="1" />
            </label>
            <label class="field">
              <span class="field-label">风格</span>
              <select v-model="form.style" class="input">
                <option value="">不限</option>
                <option v-for="s in styles" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn" @click="showCreate = false">取消</button>
            <button type="submit" class="btn btn-primary">创建</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Plus, Trash2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { dramaAPI } from '~/composables/useApi'

const dramas = ref([])
const loading = ref(false)
const showCreate = ref(false)
const form = ref({ title: '', total_episodes: 1, style: '' })
const styles = ['realistic', 'anime', 'ghibli', 'cinematic', 'comic', 'watercolor']

async function load() {
  loading.value = true
  try { dramas.value = (await dramaAPI.list()).items || [] } catch (e) { toast.error(e.message) }
  finally { loading.value = false }
}
async function create() {
  if (!form.value.title) return
  try { const d = await dramaAPI.create(form.value); showCreate.value = false; navigateTo(`/drama/${d.id}`) }
  catch (e) { toast.error(e.message) }
}
async function delDrama(d) {
  if (!confirm(`确定删除「${d.title}」？`)) return
  await dramaAPI.del(d.id); load()
}
function fmtDate(s) { return s ? new Date(s).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }) : '' }

onMounted(load)
</script>

<style scoped>
.page { padding: 32px 40px; overflow-y: auto; height: 100%; }
.page-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
.page-title { font-size: 22px; font-weight: 700; }
.page-desc { font-size: 13px; color: var(--text-2); margin-top: 2px; }

.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }

.project-card { padding: 18px; cursor: pointer; display: flex; flex-direction: column; gap: 10px; }
.project-card:hover { border-color: var(--accent); }
.project-header { display: flex; justify-content: space-between; align-items: flex-start; }
.project-title { font-size: 15px; font-weight: 600; }
.project-meta { display: flex; gap: 6px; flex-wrap: wrap; }
.project-footer { display: flex; }
.project-date { font-size: 11px; color: var(--text-3); }

.empty-card { padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 8px; cursor: pointer; color: var(--text-2); font-size: 13px; border-style: dashed; }

.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { padding: 24px; width: 420px; }
.modal-title { font-size: 16px; font-weight: 600; margin-bottom: 18px; }
.modal-form { display: flex; flex-direction: column; gap: 14px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 12px; font-weight: 500; color: var(--text-1); }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; padding-top: 6px; }
</style>
