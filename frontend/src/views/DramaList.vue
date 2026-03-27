<template>
  <div class="page fade-in">
    <header class="page-header">
      <div>
        <h1 class="page-title">项目</h1>
        <p class="page-subtitle">{{ dramas.length }} 个项目</p>
      </div>
      <button class="btn btn-primary" @click="openCreate">
        <Plus :size="14" /> 创建项目
      </button>
    </header>

    <div class="drama-list">
      <div
        v-for="d in dramas" :key="d.id"
        class="drama-row"
        @click="$router.push(`/drama/${d.id}`)"
      >
        <div class="row-left">
          <div class="row-title-line">
            <span class="row-title">{{ d.title }}</span>
            <span class="badge">{{ statusLabel(d.status) }}</span>
            <span v-if="d.style" class="badge badge-accent">{{ d.style }}</span>
          </div>
          <div class="row-meta">
            <span>{{ d.episodes?.length || 0 }} 集</span>
            <span>·</span>
            <span>{{ d.characters?.length || 0 }} 角色</span>
            <span v-if="getVideoModel(d)">·</span>
            <span v-if="getVideoModel(d)" class="mono">{{ getVideoModel(d) }}</span>
            <span>·</span>
            <span>{{ formatDate(d.updated_at || d.updatedAt) }}</span>
          </div>
        </div>
        <div class="row-right">
          <button class="btn btn-ghost btn-sm" @click.stop="confirmDelete(d)">
            <Trash2 :size="13" />
          </button>
        </div>
      </div>
      <div v-if="dramas.length === 0 && !loading" class="empty">
        <Film :size="40" style="color:var(--text-muted);margin-bottom:12px" />
        <p>暂无项目</p>
        <button class="btn btn-primary" @click="openCreate">创建第一个项目</button>
      </div>
    </div>

    <!-- Create Dialog -->
    <div v-if="showCreate" class="overlay" @click.self="showCreate = false">
      <form class="dialog" @submit.prevent="createDrama">
        <h3>创建项目</h3>
        <div class="form-field">
          <label>项目名称 <span class="required">*</span></label>
          <input v-model="form.title" class="input" placeholder="输入项目名称" />
        </div>
        <div class="form-field">
          <label>描述</label>
          <input v-model="form.description" class="input" placeholder="项目简介（可选）" />
        </div>
        <div class="form-row-2">
          <div class="form-field">
            <label>集数</label>
            <input v-model.number="form.total_episodes" class="input" type="number" min="1" max="100" />
          </div>
          <div class="form-field">
            <label>风格</label>
            <select v-model="form.style" class="input">
              <option value="">不限</option>
              <option v-for="s in styles" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </div>
        </div>
        <div class="form-field">
          <label>视频模型</label>
          <select v-model="form.video_model" class="input">
            <option value="">使用默认</option>
            <option v-for="m in videoModels" :key="m" :value="m">{{ m }}</option>
          </select>
          <span class="form-hint">分镜拆解时将根据视频模型的能力调整镜头时长和数量</span>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn" @click="showCreate = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="!form.title.trim()">创建</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus, Trash2, Film } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { dramaAPI, aiConfigAPI } from '@/api'

const router = useRouter()
const dramas = ref<any[]>([])
const loading = ref(false)
const showCreate = ref(false)
const videoModels = ref<string[]>([])

const form = ref({
  title: '',
  description: '',
  total_episodes: 1,
  style: '',
  video_model: '',
})

const styles = [
  { value: 'realistic', label: '写实' },
  { value: 'anime', label: '动漫' },
  { value: 'ghibli', label: '吉卜力' },
  { value: 'cinematic', label: '电影' },
  { value: 'comic', label: '漫画' },
  { value: 'watercolor', label: '水彩' },
  { value: 'pixel', label: '像素' },
]

async function load() {
  loading.value = true
  try {
    const data = await dramaAPI.list()
    dramas.value = data.items || []
  } catch (err: any) { toast.error(err.message) }
  finally { loading.value = false }
}

async function loadVideoModels() {
  try {
    const configs = await aiConfigAPI.list('video')
    const models: string[] = []
    for (const cfg of configs) {
      const m = Array.isArray(cfg.model) ? cfg.model : [cfg.model]
      models.push(...m.filter(Boolean))
    }
    videoModels.value = [...new Set(models)]
  } catch {}
}

function openCreate() {
  form.value = { title: '', description: '', total_episodes: 1, style: '', video_model: '' }
  showCreate.value = true
}

async function createDrama() {
  if (!form.value.title.trim()) return
  try {
    const metadata: Record<string, any> = {}
    if (form.value.video_model) metadata.video_model = form.value.video_model

    const d = await dramaAPI.create({
      title: form.value.title.trim(),
      description: form.value.description,
      total_episodes: form.value.total_episodes,
      style: form.value.style || undefined,
      metadata: Object.keys(metadata).length ? JSON.stringify(metadata) : undefined,
    })
    showCreate.value = false
    router.push(`/drama/${d.id}`)
  } catch (err: any) { toast.error(err.message) }
}

async function confirmDelete(d: any) {
  if (!confirm(`确定删除「${d.title}」？`)) return
  try {
    await dramaAPI.del(d.id)
    toast.success('已删除')
    load()
  } catch (err: any) { toast.error(err.message) }
}

function getVideoModel(d: any) {
  try {
    const meta = typeof d.metadata === 'string' ? JSON.parse(d.metadata) : d.metadata
    return meta?.video_model || ''
  } catch { return '' }
}

function statusLabel(s: string) {
  const map: Record<string, string> = { draft: '草稿', production: '制作中', completed: '已完成' }
  return map[s] || s
}

function formatDate(s: string) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('zh-CN')
}

onMounted(() => { load(); loadVideoModels() })
</script>

<style scoped>
.page { padding: 24px 32px; max-width: 800px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.page-title { font-size: 20px; font-weight: 700; }
.page-subtitle { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

.drama-list { display: flex; flex-direction: column; gap: 6px; }
.drama-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.15s;
}
.drama-row:hover { border-color: #44403c; }
.row-left { flex: 1; min-width: 0; }
.row-title-line { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.row-title { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-meta { display: flex; gap: 6px; font-size: 12px; color: var(--text-muted); }
.row-right { flex-shrink: 0; }
.mono { font-family: monospace; }

.empty { display: flex; flex-direction: column; align-items: center; padding: 60px; gap: 8px; color: var(--text-muted); font-size: 14px; }

.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 460px; display: flex; flex-direction: column; gap: 14px; }
.dialog h3 { font-size: 16px; font-weight: 600; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }

.form-field { display: flex; flex-direction: column; gap: 4px; }
.form-field label { font-size: 12px; font-weight: 500; color: var(--text-secondary); }
.form-field select { appearance: none; }
.form-hint { font-size: 11px; color: var(--text-muted); }
.form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.required { color: var(--danger); }
</style>
