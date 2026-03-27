<template>
  <div class="page fade-in">
    <header class="page-header">
      <div>
        <h1 class="page-title">项目</h1>
        <p class="page-subtitle">{{ dramas.length }} 个项目</p>
      </div>
      <button class="btn btn-primary" @click="showCreate = true">
        <Plus :size="14" /> 创建项目
      </button>
    </header>

    <div class="drama-list">
      <div
        v-for="d in dramas" :key="d.id"
        class="drama-row"
        @click="$router.push(`/drama/${d.id}`)"
      >
        <div class="row-main">
          <span class="row-title">{{ d.title }}</span>
          <span class="badge">{{ d.status }}</span>
          <span v-if="d.style" class="badge badge-accent">{{ d.style }}</span>
        </div>
        <div class="row-meta">
          <span>{{ d.episodes?.length || 0 }} 集</span>
          <span>·</span>
          <span>{{ d.characters?.length || 0 }} 角色</span>
          <span>·</span>
          <span>{{ formatDate(d.updated_at || d.updatedAt) }}</span>
        </div>
      </div>
      <div v-if="dramas.length === 0 && !loading" class="empty">
        暂无项目，点击右上角创建
      </div>
    </div>

    <!-- Create Dialog (simple) -->
    <div v-if="showCreate" class="overlay" @click.self="showCreate = false">
      <div class="dialog">
        <h3>创建项目</h3>
        <input v-model="newTitle" class="input" placeholder="项目名称" @keyup.enter="createDrama" />
        <div class="dialog-actions">
          <button class="btn" @click="showCreate = false">取消</button>
          <button class="btn btn-primary" @click="createDrama">创建</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Plus } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import { dramaAPI } from '@/api'

const router = useRouter()
const dramas = ref<any[]>([])
const loading = ref(false)
const showCreate = ref(false)
const newTitle = ref('')

async function load() {
  loading.value = true
  try {
    const data = await dramaAPI.list()
    dramas.value = data.items || []
  } catch (err: any) { toast.error(err.message) }
  finally { loading.value = false }
}

async function createDrama() {
  if (!newTitle.value.trim()) return
  try {
    const d = await dramaAPI.create({ title: newTitle.value.trim() })
    showCreate.value = false
    newTitle.value = ''
    router.push(`/drama/${d.id}`)
  } catch (err: any) { toast.error(err.message) }
}

function formatDate(s: string) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('zh-CN')
}

onMounted(load)
</script>

<style scoped>
.page { padding: 24px 32px; max-width: 900px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.page-title { font-size: 20px; font-weight: 700; }
.page-subtitle { font-size: 13px; color: var(--text-muted); margin-top: 2px; }

.drama-list { display: flex; flex-direction: column; gap: 6px; }
.drama-row {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.15s;
}
.drama-row:hover { border-color: #44403c; }
.row-main { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.row-title { font-size: 14px; font-weight: 600; }
.row-meta { display: flex; gap: 6px; font-size: 12px; color: var(--text-muted); }
.empty { padding: 60px; text-align: center; color: var(--text-muted); font-size: 14px; }

.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 50; }
.dialog { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 400px; display: flex; flex-direction: column; gap: 16px; }
.dialog h3 { font-size: 16px; font-weight: 600; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
