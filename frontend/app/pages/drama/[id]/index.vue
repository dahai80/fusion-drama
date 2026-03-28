<template>
  <div class="page" v-if="drama">
    <div class="page-head">
      <div class="flex items-center gap-2">
        <button class="btn btn-ghost btn-sm" @click="navigateTo('/')">
          <ArrowLeft :size="14" /> 返回
        </button>
        <h1 class="page-title">{{ drama.title }}</h1>
        <span v-if="drama.style" class="tag tag-accent">{{ drama.style }}</span>
      </div>
      <div class="flex gap-1">
        <span class="tag"><Users :size="11" /> {{ drama.characters?.length || 0 }} 角色</span>
        <span class="tag"><MapPin :size="11" /> {{ drama.scenes?.length || 0 }} 场景</span>
      </div>
    </div>

    <div class="section-title">剧集</div>
    <div class="ep-grid">
      <div v-for="ep in drama.episodes" :key="ep.id" class="card ep-card"
        @click="navigateTo(`/drama/${drama.id}/episode/${ep.episode_number || ep.episodeNumber}`)">
        <div class="ep-badge">E{{ ep.episode_number || ep.episodeNumber }}</div>
        <div class="ep-body">
          <div class="ep-title">{{ ep.title }}</div>
          <span :class="['tag', hasScript(ep) ? 'tag-success' : '']">
            {{ hasScript(ep) ? '有剧本' : '待编写' }}
          </span>
        </div>
        <ChevronRight :size="14" class="ep-arrow" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ArrowLeft, Users, MapPin, ChevronRight } from 'lucide-vue-next'
import { dramaAPI } from '~/composables/useApi'

const route = useRoute()
const drama = ref(null)

function hasScript(ep) { return !!(ep.script_content || ep.scriptContent) }

onMounted(async () => {
  drama.value = await dramaAPI.get(Number(route.params.id))
})
</script>

<style scoped>
.page { padding: 32px 40px; overflow-y: auto; height: 100%; }
.page-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.page-title { font-size: 18px; font-weight: 700; }

.section-title { font-size: 12px; font-weight: 600; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }

.ep-grid { display: flex; flex-direction: column; gap: 6px; max-width: 600px; }
.ep-card { display: flex; align-items: center; gap: 14px; padding: 14px 16px; cursor: pointer; }
.ep-card:hover { border-color: var(--accent); }
.ep-badge { width: 36px; height: 36px; border-radius: 8px; background: var(--bg-2); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: var(--text-1); flex-shrink: 0; }
.ep-body { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.ep-title { font-size: 14px; font-weight: 500; }
.ep-arrow { color: var(--text-3); flex-shrink: 0; }
</style>
