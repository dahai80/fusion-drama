<template>
  <div class="page fade-in" v-if="drama">
    <header class="page-header">
      <div class="header-left">
        <button class="btn btn-ghost btn-sm" @click="$router.push('/')">
          <ArrowLeft :size="14" /> 返回
        </button>
        <h1 class="page-title">{{ drama.title }}</h1>
        <span class="badge badge-accent" v-if="drama.style">{{ drama.style }}</span>
      </div>
    </header>

    <!-- Resources summary -->
    <div class="resource-bar">
      <div class="resource-item">
        <Users :size="14" />
        <span>角色 {{ drama.characters?.length || 0 }}</span>
      </div>
      <div class="resource-item">
        <MapPin :size="14" />
        <span>场景 {{ drama.scenes?.length || 0 }}</span>
      </div>
    </div>

    <!-- Episodes -->
    <div class="episodes">
      <h3 class="section-title">剧集</h3>
      <div class="ep-grid">
        <div
          v-for="ep in drama.episodes" :key="ep.id"
          class="ep-card"
          @click="goToWorkbench(ep)"
        >
          <div class="ep-number">第{{ ep.episode_number || ep.episodeNumber }}集</div>
          <div class="ep-title">{{ ep.title }}</div>
          <div class="ep-meta">
            <span :class="['badge', ep.script_content || ep.scriptContent ? 'badge-success' : '']">
              {{ ep.script_content || ep.scriptContent ? '有剧本' : '无剧本' }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Users, MapPin } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { dramaAPI } from '@/api'

const route = useRoute()
const router = useRouter()
const drama = ref<any>(null)

async function load() {
  try {
    drama.value = await dramaAPI.get(Number(route.params.id))
  } catch (err: any) { toast.error(err.message) }
}

function goToWorkbench(ep: any) {
  const epNum = ep.episode_number || ep.episodeNumber
  router.push(`/drama/${route.params.id}/episode/${epNum}/workbench`)
}

onMounted(load)
</script>

<style scoped>
.page { padding: 24px 32px; max-width: 900px; }
.page-header { margin-bottom: 20px; }
.header-left { display: flex; align-items: center; gap: 12px; }
.page-title { font-size: 18px; font-weight: 700; }

.resource-bar { display: flex; gap: 16px; margin-bottom: 24px; padding: 12px 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius); }
.resource-item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-secondary); }

.section-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; }
.ep-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.ep-card {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.15s;
}
.ep-card:hover { border-color: var(--accent); }
.ep-number { font-size: 12px; color: var(--text-muted); margin-bottom: 4px; }
.ep-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; }
.ep-meta { display: flex; gap: 6px; }
</style>
