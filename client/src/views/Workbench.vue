<template>
  <div class="workbench" v-if="!loading">
    <!-- Top bar -->
    <header class="topbar">
      <div class="topbar-left">
        <button class="btn btn-ghost btn-sm" @click="$router.push(`/drama/${dramaId}`)">
          <ArrowLeft :size="14" /> 返回
        </button>
        <span class="topbar-title">{{ drama?.title }} — 第{{ episodeNumber }}集</span>
      </div>
      <div class="topbar-center">
        <button :class="['tab-btn', { active: activeTab === 'script' }]" @click="activeTab = 'script'">
          <FileText :size="14" /> 剧本
        </button>
        <button :class="['tab-btn', { active: activeTab === 'storyboard' }]" @click="activeTab = 'storyboard'">
          <Clapperboard :size="14" /> 分镜
        </button>
      </div>
      <div class="topbar-right">
        <span v-if="storyboards.length" class="badge badge-accent">{{ storyboards.length }} 镜头</span>
        <button class="btn btn-primary btn-sm" @click="$router.push(`/drama/${dramaId}/episode/${episodeNumber}/compose`)">
          合成 <ArrowRight :size="12" />
        </button>
      </div>
    </header>

    <!-- Script Tab -->
    <div v-if="activeTab === 'script'" class="script-tab">
      <!-- Pipeline -->
      <div class="pipeline">
        <div :class="['step', { done: hasRaw, current: !hasRaw }]">
          <span class="step-dot">{{ hasRaw ? '✓' : '1' }}</span>
          <span>原始内容</span>
        </div>
        <ArrowRight :size="12" class="step-arrow" />
        <div :class="['step', { done: hasScript, current: hasRaw && !hasScript }]">
          <span class="step-dot">
            <Loader2 v-if="agentRunningType === 'script_rewriter'" :size="10" class="animate-spin" />
            <template v-else>{{ hasScript ? '✓' : '2' }}</template>
          </span>
          <span>AI 改写</span>
        </div>
        <ArrowRight :size="12" class="step-arrow" />
        <div :class="['step', { done: hasCharacters && hasScenes, current: hasScript && !hasCharacters }]">
          <span class="step-dot">
            <Loader2 v-if="agentRunningType === 'extractor'" :size="10" class="animate-spin" />
            <template v-else>{{ (hasCharacters && hasScenes) ? '✓' : '3' }}</template>
          </span>
          <span>提取角色&场景</span>
          <span v-if="hasCharacters" class="badge badge-accent" style="margin-left:4px">{{ characters.length }}</span>
        </div>
      </div>

      <!-- Two panels -->
      <div class="panels">
        <div class="panel">
          <div class="panel-head">
            <span>原始内容</span>
            <span v-if="rawWordCount" class="badge">{{ rawWordCount }}字</span>
            <button class="btn btn-ghost btn-sm" style="margin-left:auto" @click="saveRawContent(localRaw)">
              <Save :size="12" /> 保存
            </button>
          </div>
          <textarea class="textarea panel-text" v-model="localRaw" placeholder="粘贴小说/故事内容..." />
        </div>

        <div class="panel-divider">
          <button class="action-circle" :disabled="!localRaw.trim() || agentRunning" @click="doRewrite">
            <Loader2 v-if="agentRunningType === 'script_rewriter'" :size="16" class="animate-spin" />
            <Wand2 v-else :size="16" />
          </button>
          <span class="action-label">改写</span>
          <button class="action-circle" :disabled="!localScript.trim() || agentRunning" @click="doExtract">
            <Loader2 v-if="agentRunningType === 'extractor'" :size="16" class="animate-spin" />
            <FileText v-else :size="16" />
          </button>
          <span class="action-label">提取</span>
        </div>

        <div class="panel">
          <div class="panel-head">
            <span>格式化剧本</span>
            <span v-if="scriptWordCount" class="badge">{{ scriptWordCount }}字</span>
            <button class="btn btn-ghost btn-sm" style="margin-left:auto" @click="saveScript(localScript)">
              <Save :size="12" /> 保存
            </button>
          </div>
          <textarea class="textarea panel-text" v-model="localScript" placeholder="AI 改写后的剧本..." />
        </div>
      </div>
    </div>

    <!-- Storyboard Tab -->
    <div v-else class="storyboard-tab">
      <div class="sb-toolbar">
        <span class="sb-toolbar-title">镜头 ({{ storyboards.length }})</span>
        <div style="display:flex;gap:4px;margin-left:auto">
          <button class="btn btn-sm" @click="addStoryboard"><Plus :size="12" /> 添加</button>
          <button class="btn btn-sm" :disabled="agentRunning" @click="doBreakdown">
            <Loader2 v-if="agentRunningType === 'storyboard_breaker'" :size="12" class="animate-spin" />
            <Wand2 v-else :size="12" />
            拆解分镜
          </button>
        </div>
      </div>

      <div v-if="storyboards.length" class="sb-table-wrap">
        <table class="sb-table">
          <thead>
            <tr>
              <th>#</th><th>景别</th><th>描述</th><th>视频提示词</th><th>对白</th><th>时长</th><th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(sb, idx) in storyboards" :key="sb.id">
              <td class="mono">{{ String(idx+1).padStart(2,'0') }}</td>
              <td>{{ sb.shot_type || sb.shotType || '-' }}</td>
              <td class="cell-text" @dblclick="editCell(sb, 'description')">
                {{ sb.description || '-' }}
              </td>
              <td class="cell-text cell-prompt" @dblclick="editCell(sb, 'video_prompt')">
                {{ sb.video_prompt || sb.videoPrompt || '-' }}
              </td>
              <td class="cell-text" @dblclick="editCell(sb, 'dialogue')">
                {{ sb.dialogue || '-' }}
              </td>
              <td class="mono">{{ sb.duration || 10 }}s</td>
              <td>
                <span :class="['badge', statusBadge(sb)]">{{ statusText(sb) }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="empty-sb">
        <Clapperboard :size="32" style="color:var(--text-muted)" />
        <p>暂无分镜</p>
        <p style="font-size:12px;color:var(--text-muted)">先在剧本页完成改写和提取，然后点击「拆解分镜」</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  ArrowLeft, ArrowRight, FileText, Clapperboard, Wand2,
  Save, Plus, Loader2
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useWorkbench } from '@/composables/useWorkbench'

const wb = useWorkbench()
const {
  dramaId, episodeNumber, drama, episode, characters, scenes, storyboards,
  loading, activeTab, agentRunning, agentRunningType,
  rawContent, scriptContent, hasRaw, hasScript, hasCharacters, hasScenes,
  loadData, saveRawContent, saveScript, saveStoryboardField, addStoryboard, runAgent,
} = wb

const localRaw = ref('')
const localScript = ref('')

watch(rawContent, v => { localRaw.value = v }, { immediate: true })
watch(scriptContent, v => { localScript.value = v }, { immediate: true })

const rawWordCount = computed(() => localRaw.value.replace(/\s/g, '').length || 0)
const scriptWordCount = computed(() => localScript.value.replace(/\s/g, '').length || 0)

function doRewrite() {
  if (localRaw.value !== rawContent.value) saveRawContent(localRaw.value)
  runAgent('script_rewriter', '请读取剧本并改写为格式化剧本，然后保存', () => loadData())
}

function doExtract() {
  if (localScript.value !== scriptContent.value) saveScript(localScript.value)
  runAgent('extractor', '请从剧本中提取所有角色和场景信息', () => loadData())
}

function doBreakdown() {
  runAgent('storyboard_breaker', '请拆解分镜并生成视频提示词', () => {
    loadData()
    activeTab.value = 'storyboard'
  })
}

function editCell(sb: any, field: string) {
  const current = sb[field] || ''
  const value = prompt(`编辑 ${field}`, current)
  if (value !== null && value !== current) {
    saveStoryboardField(sb.id, field, value)
    sb[field] = value
  }
}

function statusText(sb: any) {
  const s = sb.status || 'pending'
  if (s === 'completed' || sb.video_url || sb.videoUrl) return '完成'
  if (sb.composed_image || sb.composedImage || sb.image_url || sb.imageUrl) return '有图'
  if (s === 'processing' || s === 'generating') return '生成中'
  return '待处理'
}

function statusBadge(sb: any) {
  const t = statusText(sb)
  if (t === '完成') return 'badge-success'
  if (t === '有图') return 'badge-accent'
  if (t === '生成中') return 'badge-info'
  return ''
}
</script>

<style scoped>
.workbench { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* Topbar */
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg-card); flex-shrink: 0; }
.topbar-left, .topbar-right { display: flex; align-items: center; gap: 8px; }
.topbar-center { display: flex; gap: 2px; background: var(--bg); border-radius: 8px; padding: 2px; }
.topbar-title { font-size: 14px; font-weight: 600; }
.tab-btn { display: flex; align-items: center; gap: 5px; padding: 5px 14px; border: none; border-radius: 6px; background: transparent; color: var(--text-muted); font-size: 13px; cursor: pointer; transition: all 0.15s; }
.tab-btn:hover { color: var(--text); }
.tab-btn.active { background: var(--bg-card); color: var(--text); box-shadow: 0 1px 3px rgba(0,0,0,0.2); }

/* Pipeline */
.pipeline { display: flex; align-items: center; gap: 6px; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--bg-card); flex-shrink: 0; }
.step { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); }
.step.done { color: var(--success); }
.step.current { color: var(--accent); }
.step-dot { width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; background: rgba(255,255,255,0.06); border: 1.5px solid var(--border); }
.step.done .step-dot { background: rgba(34,197,94,0.15); border-color: rgba(34,197,94,0.5); color: var(--success); }
.step.current .step-dot { background: rgba(232,162,67,0.15); border-color: var(--accent); color: var(--accent); }
.step-arrow { color: var(--text-muted); }

/* Panels */
.script-tab { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.panels { flex: 1; display: flex; min-height: 0; }
.panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.panel-head { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid var(--border); font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.panel-text { flex: 1; border: none; border-radius: 0; background: transparent; }
.panel-divider { width: 52px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border-left: 1px solid var(--border); border-right: 1px solid var(--border); background: var(--bg-card); }
.action-circle { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--border); background: transparent; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; }
.action-circle:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.action-circle:disabled { opacity: 0.3; cursor: not-allowed; }
.action-label { font-size: 10px; color: var(--text-muted); }

/* Storyboard Tab */
.storyboard-tab { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.sb-toolbar { display: flex; align-items: center; padding: 8px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.sb-toolbar-title { font-size: 13px; font-weight: 600; }
.sb-table-wrap { flex: 1; overflow: auto; }
.sb-table { width: 100%; border-collapse: collapse; }
.sb-table th { padding: 6px 10px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-align: left; text-transform: uppercase; letter-spacing: 0.3px; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg-card); z-index: 1; }
.sb-table td { padding: 8px 10px; font-size: 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
.sb-table tr:hover { background: rgba(255,255,255,0.02); }
.mono { font-family: monospace; color: var(--text-muted); }
.cell-text { max-width: 200px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; cursor: default; }
.cell-prompt { max-width: 300px; }
.empty-sb { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text-secondary); }
</style>
