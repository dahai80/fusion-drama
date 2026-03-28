<template>
  <div class="page" v-if="drama">
    <div class="toolbar">
      <button class="btn btn-ghost" @click="navigateTo('/')">← 返回</button>
      <span class="toolbar-title">{{ drama.title }}</span>
      <span v-if="drama.style" class="tag tag-accent">{{ drama.style }}</span>
      <span class="tag">{{ drama.characters?.length || 0 }} 角色</span>
      <span class="tag">{{ drama.scenes?.length || 0 }} 场景</span>
    </div>
    <div class="ep-list">
      <div v-for="ep in drama.episodes" :key="ep.id" class="ep-card" @click="navigateTo(`/drama/${drama.id}/episode/${ep.episode_number || ep.episodeNumber}`)">
        <div class="ep-num">第{{ ep.episode_number || ep.episodeNumber }}集</div>
        <div class="ep-title">{{ ep.title }}</div>
        <span :class="['tag', (ep.script_content || ep.scriptContent) ? 'tag-success' : '']">
          {{ (ep.script_content || ep.scriptContent) ? '有剧本' : '待编写' }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { dramaAPI } from '~/composables/useApi'

const route = useRoute()
const drama = ref(null)

onMounted(async () => {
  drama.value = await dramaAPI.get(Number(route.params.id))
})
</script>

<style scoped>
.page { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.toolbar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg-panel); flex-shrink: 0; }
.toolbar-title { font-size: 13px; font-weight: 600; }
.ep-list { flex: 1; overflow-y: auto; padding: 12px; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; align-content: start; }
.ep-card { padding: 12px; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg-panel); cursor: pointer; transition: border-color 0.1s; }
.ep-card:hover { border-color: var(--accent); }
.ep-num { font-size: 10px; color: var(--text-muted); margin-bottom: 4px; }
.ep-title { font-size: 12px; font-weight: 500; margin-bottom: 6px; }
</style>
