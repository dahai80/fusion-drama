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
      <div class="topbar-right">
        <button class="btn btn-sm" @click="loadData(); loadPipelineStatus()">
          <RefreshCw :size="12" /> 刷新
        </button>
      </div>
    </header>

    <!-- Panel tabs -->
    <nav class="panel-tabs">
      <button v-for="p in panels" :key="p.id" :class="['panel-tab', { active: activePanel === p.id }]" @click="activePanel = p.id">
        <component :is="p.icon" :size="15" />
        <span>{{ p.label }}</span>
        <span v-if="p.badge" class="tab-badge" :class="p.badgeClass">{{ p.badge }}</span>
      </button>
    </nav>

    <!-- ==================== 剧本面板 ==================== -->
    <div v-if="activePanel === 'script'" class="panel">
      <!-- 子步骤条 -->
      <div class="sub-steps">
        <span :class="['sub-step', rawContent ? 'done' : 'current']">① 原始内容</span>
        <ArrowRight :size="12" class="step-arrow" />
        <span :class="['sub-step', scriptContent ? 'done' : (rawContent ? 'current' : '')]">
          <Loader2 v-if="agentRunningType === 'script_rewriter'" :size="11" class="animate-spin" />
          ② 改写
        </span>
        <ArrowRight :size="12" class="step-arrow" />
        <span :class="['sub-step', characters.length > 0 ? 'done' : (scriptContent ? 'current' : '')]">
          <Loader2 v-if="agentRunningType === 'extractor'" :size="11" class="animate-spin" />
          ③ 提取
        </span>
        <ArrowRight :size="12" class="step-arrow" />
        <span :class="['sub-step', charsWithVoice > 0 ? 'done' : (characters.length > 0 ? 'current' : '')]">
          <Loader2 v-if="agentRunningType === 'voice_assigner'" :size="11" class="animate-spin" />
          ④ 音色
        </span>
      </div>

      <!-- 双栏编辑器 -->
      <div class="dual-editor">
        <div class="editor-col">
          <div class="col-head">原始内容 <span v-if="localRaw.length" class="badge">{{ localRaw.length }}字</span>
            <button class="btn btn-ghost btn-sm" style="margin-left:auto" @click="saveRawContent(localRaw)"><Save :size="12" /></button>
          </div>
          <textarea class="textarea col-text" v-model="localRaw" placeholder="粘贴小说/故事内容..." />
        </div>
        <div class="editor-divider">
          <button class="circle-btn" :disabled="!localRaw.trim() || agentRunning" @click="doRewrite"><Wand2 :size="14" /></button>
          <span class="circle-label">改写</span>
          <button class="circle-btn" :disabled="!localScript.trim() || agentRunning" @click="doExtract"><FileText :size="14" /></button>
          <span class="circle-label">提取</span>
        </div>
        <div class="editor-col">
          <div class="col-head">格式化剧本 <span v-if="localScript.length" class="badge">{{ localScript.length }}字</span>
            <button class="btn btn-ghost btn-sm" style="margin-left:auto" @click="saveScript(localScript)"><Save :size="12" /></button>
          </div>
          <textarea class="textarea col-text" v-model="localScript" placeholder="AI 改写后的剧本..." />
        </div>
      </div>

      <!-- 角色/场景/音色 -->
      <div v-if="characters.length > 0 || scenes.length > 0" class="resources-section">
        <div class="res-block">
          <h4><Users :size="14" /> 角色 ({{ characters.length }})
            <button class="btn btn-ghost btn-sm" style="margin-left:auto" :disabled="agentRunning" @click="doAssignVoice">
              <Loader2 v-if="agentRunningType === 'voice_assigner'" :size="12" class="animate-spin" />
              <Mic v-else :size="12" /> 分配音色
            </button>
          </h4>
          <div class="char-grid">
            <div v-for="c in characters" :key="c.id" class="char-card">
              <div class="char-name">{{ c.name }}</div>
              <div class="char-role">{{ c.role || '-' }}</div>
              <div class="char-voice">
                <Mic :size="11" /> {{ c.voice_style || c.voiceStyle || '未分配' }}
              </div>
              <div v-if="c.voice_sample_url || c.voiceSampleUrl" class="char-audio">
                <audio :src="'/' + (c.voice_sample_url || c.voiceSampleUrl)" controls preload="none" />
              </div>
              <button v-if="c.voice_style || c.voiceStyle" class="btn btn-ghost btn-sm char-gen-btn" @click="generateVoiceSample(c.id)">
                生成试听
              </button>
            </div>
          </div>
        </div>
        <div class="res-block" v-if="scenes.length">
          <h4><MapPin :size="14" /> 场景 ({{ scenes.length }})</h4>
          <div class="scene-list">
            <div v-for="s in scenes" :key="s.id" class="scene-item">
              <span>{{ s.location }}</span>
              <span class="scene-time">{{ s.time }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="panel-footer">
        <button class="btn btn-primary" :disabled="storyboards.length === 0 && !scriptContent" @click="activePanel = 'storyboard'">
          下一步: 分镜 <ArrowRight :size="12" />
        </button>
      </div>
    </div>

    <!-- ==================== 分镜面板 ==================== -->
    <div v-else-if="activePanel === 'storyboard'" class="panel">
      <div class="sb-toolbar">
        <span class="sb-count">镜头 ({{ storyboards.length }})</span>
        <div style="margin-left:auto;display:flex;gap:4px">
          <button class="btn btn-sm" @click="addStoryboard"><Plus :size="12" /> 添加</button>
          <button class="btn btn-sm" :disabled="agentRunning" @click="doBreakdown">
            <Loader2 v-if="agentRunningType === 'storyboard_breaker'" :size="12" class="animate-spin" />
            <Wand2 v-else :size="12" /> 拆解分镜
          </button>
        </div>
      </div>

      <div v-if="storyboards.length" class="sb-table-wrap">
        <table class="sb-table">
          <thead><tr><th>#</th><th>景别</th><th>描述</th><th>视频提示词</th><th>对白</th><th>时长</th></tr></thead>
          <tbody>
            <tr v-for="(sb, idx) in storyboards" :key="sb.id">
              <td class="mono">{{ String(idx+1).padStart(2,'0') }}</td>
              <td>{{ sb.shot_type || sb.shotType || '-' }}</td>
              <td class="cell-text" @dblclick="editCell(sb, 'description')">{{ sb.description || '-' }}</td>
              <td class="cell-text cell-wide" @dblclick="editCell(sb, 'video_prompt')">{{ sb.video_prompt || sb.videoPrompt || '-' }}</td>
              <td class="cell-text" @dblclick="editCell(sb, 'dialogue')">{{ sb.dialogue || '-' }}</td>
              <td class="mono">{{ sb.duration || 10 }}s</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-panel">
        <Clapperboard :size="32" style="color:var(--text-muted)" />
        <p>暂无分镜，先完成剧本步骤</p>
      </div>

      <div class="panel-footer">
        <button class="btn" @click="activePanel = 'script'"><ArrowLeft :size="12" /> 剧本</button>
        <button class="btn btn-primary" :disabled="storyboards.length === 0" @click="activePanel = 'production'">下一步: 制作 <ArrowRight :size="12" /></button>
      </div>
    </div>

    <!-- ==================== 制作面板 ==================== -->
    <div v-else-if="activePanel === 'production'" class="panel">
      <div class="sb-toolbar">
        <span class="sb-count">制作进度</span>
        <div style="margin-left:auto;display:flex;gap:4px">
          <button class="btn btn-sm" @click="batchGenerateImages"><ImageIcon :size="12" /> 批量生成图片</button>
          <button class="btn btn-sm" @click="batchGenerateVideos"><Video :size="12" /> 批量生成视频</button>
          <button class="btn btn-sm" @click="composeAll"><Layers :size="12" /> 批量合成</button>
        </div>
      </div>

      <div class="prod-list">
        <div v-for="(sb, idx) in storyboards" :key="sb.id" class="prod-row">
          <span class="mono prod-num">#{{ String(idx+1).padStart(2,'0') }}</span>
          <div class="prod-thumb">
            <img v-if="sb.composed_image || sb.composedImage" :src="'/' + (sb.composed_image || sb.composedImage)" />
            <div v-else class="prod-thumb-empty"><ImageIcon :size="16" /></div>
          </div>
          <div class="prod-info">
            <div class="prod-desc">{{ sb.description || sb.title || '-' }}</div>
            <div class="prod-status-row">
              <span :class="['badge', (sb.composed_image || sb.composedImage) ? 'badge-success' : '']">图片</span>
              <span :class="['badge', (sb.video_url || sb.videoUrl) ? 'badge-success' : '']">视频</span>
              <span :class="['badge', (sb.composed_video_url || sb.composedVideoUrl) ? 'badge-success' : '']">合成</span>
            </div>
          </div>
          <div class="prod-actions">
            <button class="btn btn-ghost btn-sm" @click="generateImage(sb.id, sb.image_prompt || sb.imagePrompt || sb.description || '')"><ImageIcon :size="12" /></button>
            <button class="btn btn-ghost btn-sm" @click="generateVideo(sb.id, sb.video_prompt || sb.videoPrompt || '')"><Video :size="12" /></button>
            <button class="btn btn-ghost btn-sm" :disabled="!(sb.video_url || sb.videoUrl)" @click="composeShot(sb.id)"><Layers :size="12" /></button>
          </div>
        </div>
      </div>

      <div v-if="storyboards.length === 0" class="empty-panel"><p>暂无镜头数据</p></div>

      <div class="panel-footer">
        <button class="btn" @click="activePanel = 'storyboard'"><ArrowLeft :size="12" /> 分镜</button>
        <button class="btn btn-primary" @click="activePanel = 'export'">下一步: 导出 <ArrowRight :size="12" /></button>
      </div>
    </div>

    <!-- ==================== 导出面板 ==================== -->
    <div v-else class="panel">
      <div class="export-content">
        <div v-if="mergeStatus?.merged_url || mergeStatus?.mergedUrl" class="export-preview">
          <video :src="'/' + (mergeStatus.merged_url || mergeStatus.mergedUrl)" controls class="export-video" />
          <div class="export-info">
            <span class="badge badge-success">已完成</span>
            <span v-if="mergeStatus.duration">{{ mergeStatus.duration }}秒</span>
          </div>
          <a :href="'/' + (mergeStatus.merged_url || mergeStatus.mergedUrl)" download class="btn btn-primary">
            <Download :size="14" /> 下载视频
          </a>
        </div>
        <div v-else class="export-empty">
          <Film :size="40" style="color:var(--text-muted)" />
          <p>点击下方按钮拼接最终视频</p>
          <button class="btn btn-primary" @click="mergeEpisode" :disabled="composedCount === 0">
            <Layers :size="14" /> 拼接全集 ({{ composedCount }}/{{ storyboards.length }} 镜头已合成)
          </button>
        </div>
      </div>

      <div class="panel-footer">
        <button class="btn" @click="activePanel = 'production'"><ArrowLeft :size="12" /> 制作</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  ArrowLeft, ArrowRight, FileText, Clapperboard, Wand2, Save, Plus, Loader2,
  Users, MapPin, Mic, ImageIcon, Video, Layers, Film, Download, RefreshCw,
} from 'lucide-vue-next'
import { useWorkbench } from '@/composables/useWorkbench'

const wb = useWorkbench()
const {
  dramaId, episodeNumber, drama, characters, scenes, storyboards,
  loading, activePanel, agentRunning, agentRunningType, mergeStatus,
  rawContent, scriptContent,
  loadData, loadPipelineStatus, loadMergeStatus,
  saveRawContent, saveScript, generateVoiceSample,
  saveStoryboardField, addStoryboard,
  generateImage, generateVideo, composeShot, composeAll,
  mergeEpisode, runAgent,
} = wb

const localRaw = ref('')
const localScript = ref('')
watch(rawContent, v => { localRaw.value = v }, { immediate: true })
watch(scriptContent, v => { localScript.value = v }, { immediate: true })

const charsWithVoice = computed(() => characters.value.filter((c: any) => c.voice_style || c.voiceStyle).length)
const composedCount = computed(() => storyboards.value.filter((s: any) => s.composed_video_url || s.composedVideoUrl).length)

const panels = computed(() => [
  { id: 'script' as const, label: '剧本', icon: FileText, badge: characters.value.length ? `${characters.value.length}角色` : '', badgeClass: 'badge-accent' },
  { id: 'storyboard' as const, label: '分镜', icon: Clapperboard, badge: storyboards.value.length ? String(storyboards.value.length) : '', badgeClass: '' },
  { id: 'production' as const, label: '制作', icon: Video, badge: composedCount.value ? `${composedCount.value}/${storyboards.value.length}` : '', badgeClass: composedCount.value ? 'badge-success' : '' },
  { id: 'export' as const, label: '导出', icon: Film, badge: mergeStatus.value?.status === 'completed' ? '✓' : '', badgeClass: 'badge-success' },
])

function doRewrite() {
  if (localRaw.value !== rawContent.value) saveRawContent(localRaw.value)
  runAgent('script_rewriter', '请读取剧本并改写为格式化剧本，然后保存', () => loadData())
}
function doExtract() {
  if (localScript.value !== scriptContent.value) saveScript(localScript.value)
  runAgent('extractor', '请从剧本中提取所有角色和场景信息', () => loadData())
}
function doAssignVoice() {
  runAgent('voice_assigner', '请为所有角色分配合适的音色', () => loadData())
}
function doBreakdown() {
  runAgent('storyboard_breaker', '请拆解分镜并生成视频提示词', () => { loadData(); activePanel.value = 'storyboard' })
}
function editCell(sb: any, field: string) {
  const value = prompt(`编辑 ${field}`, sb[field] || '')
  if (value !== null) { saveStoryboardField(sb.id, field, value); sb[field] = value }
}
function batchGenerateImages() {
  for (const sb of storyboards.value) {
    if (!(sb.composed_image || sb.composedImage)) generateImage(sb.id, sb.image_prompt || sb.imagePrompt || sb.description || '')
  }
}
function batchGenerateVideos() {
  for (const sb of storyboards.value) {
    if (!(sb.video_url || sb.videoUrl)) generateVideo(sb.id, sb.video_prompt || sb.videoPrompt || '')
  }
}
</script>

<style scoped>
.workbench { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

.topbar { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg-card); flex-shrink: 0; }
.topbar-left, .topbar-right { display: flex; align-items: center; gap: 8px; }
.topbar-title { font-size: 14px; font-weight: 600; }

/* Panel tabs */
.panel-tabs { display: flex; gap: 2px; padding: 6px 16px; background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.panel-tab { display: flex; align-items: center; gap: 6px; padding: 8px 18px; border: none; border-radius: 6px; background: transparent; color: var(--text-muted); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
.panel-tab:hover { color: var(--text); background: var(--bg-hover); }
.panel-tab.active { color: var(--text); background: var(--bg); box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
.tab-badge { font-size: 10px; padding: 0 6px; border-radius: 9999px; background: rgba(255,255,255,0.06); }

.panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.panel-footer { flex-shrink: 0; display: flex; justify-content: space-between; padding: 10px 16px; border-top: 1px solid var(--border); background: var(--bg-card); }

/* Sub-steps */
.sub-steps { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg-card); flex-shrink: 0; font-size: 12px; color: var(--text-muted); }
.sub-step { display: inline-flex; align-items: center; gap: 3px; }
.sub-step.done { color: var(--success); }
.sub-step.current { color: var(--accent); font-weight: 600; }
.step-arrow { color: var(--text-muted); flex-shrink: 0; }

/* Dual editor */
.dual-editor { display: flex; flex: 1; min-height: 0; }
.editor-col { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.col-head { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid var(--border); font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.col-text { flex: 1; border: none; border-radius: 0; background: transparent; }
.editor-divider { width: 48px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; border-left: 1px solid var(--border); border-right: 1px solid var(--border); background: var(--bg-card); }
.circle-btn { width: 34px; height: 34px; border-radius: 50%; border: 1px solid var(--border); background: transparent; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; }
.circle-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.circle-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.circle-label { font-size: 9px; color: var(--text-muted); }

/* Resources */
.resources-section { flex-shrink: 0; max-height: 280px; overflow-y: auto; border-top: 1px solid var(--border); padding: 12px 16px; display: flex; gap: 16px; }
.res-block { flex: 1; }
.res-block h4 { display: flex; align-items: center; gap: 6px; font-size: 13px; margin: 0 0 8px; }
.char-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.char-card { padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); min-width: 140px; display: flex; flex-direction: column; gap: 3px; }
.char-name { font-size: 13px; font-weight: 600; }
.char-role { font-size: 11px; color: var(--text-muted); }
.char-voice { font-size: 11px; color: var(--accent); display: flex; align-items: center; gap: 3px; }
.char-audio audio { width: 100%; height: 28px; margin-top: 4px; }
.char-gen-btn { margin-top: 4px; font-size: 10px !important; }
.scene-list { display: flex; flex-wrap: wrap; gap: 6px; }
.scene-item { padding: 4px 10px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; }
.scene-time { color: var(--text-muted); margin-left: 4px; }

/* Storyboard table */
.sb-toolbar { display: flex; align-items: center; padding: 8px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.sb-count { font-size: 13px; font-weight: 600; }
.sb-table-wrap { flex: 1; overflow: auto; }
.sb-table { width: 100%; border-collapse: collapse; }
.sb-table th { padding: 6px 10px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-align: left; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg-card); z-index: 1; }
.sb-table td { padding: 8px 10px; font-size: 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
.sb-table tr:hover { background: rgba(255,255,255,0.02); }
.cell-text { max-width: 180px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; cursor: pointer; }
.cell-wide { max-width: 280px; }
.mono { font-family: monospace; color: var(--text-muted); }

/* Production */
.prod-list { flex: 1; overflow-y: auto; padding: 8px 16px; display: flex; flex-direction: column; gap: 6px; }
.prod-row { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg-card); }
.prod-num { width: 30px; flex-shrink: 0; }
.prod-thumb { width: 80px; height: 45px; border-radius: 4px; overflow: hidden; background: var(--bg); flex-shrink: 0; }
.prod-thumb img { width: 100%; height: 100%; object-fit: cover; }
.prod-thumb-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-muted); }
.prod-info { flex: 1; min-width: 0; }
.prod-desc { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prod-status-row { display: flex; gap: 4px; margin-top: 4px; }
.prod-actions { display: flex; gap: 2px; flex-shrink: 0; }

/* Export */
.export-content { flex: 1; display: flex; align-items: center; justify-content: center; padding: 32px; }
.export-preview { display: flex; flex-direction: column; align-items: center; gap: 16px; max-width: 640px; width: 100%; }
.export-video { width: 100%; border-radius: 8px; background: #000; }
.export-info { display: flex; gap: 8px; align-items: center; }
.export-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; color: var(--text-secondary); }

.empty-panel { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text-muted); }
</style>
