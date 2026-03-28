<template>
  <div class="wb" v-if="drama">
    <!-- Header -->
    <header class="wb-header">
      <button class="btn btn-ghost" @click="navigateTo(`/drama/${dramaId}`)">←</button>
      <span class="wb-title mono">{{ drama.title }} / E{{ episodeNumber }}</span>
      <div class="wb-tabs">
        <button v-for="p in panelDefs" :key="p.id" :class="['wb-tab', { active: panel === p.id }]" @click="panel = p.id">
          {{ p.label }}
          <span v-if="p.count" class="tab-count">{{ p.count }}</span>
        </button>
      </div>
      <button class="btn btn-ghost" style="margin-left:auto" @click="refresh">↻</button>
    </header>

    <!-- ====== SCRIPT PANEL ====== -->
    <div v-if="panel === 'script'" class="panel-body">
      <div class="step-bar">
        <span :class="['step', rawContent ? 'done' : 'on']">原始内容</span> →
        <span :class="['step', scriptContent ? 'done' : (rawContent ? 'on' : '')]">
          <span v-if="rt === 'script_rewriter'" class="animate-spin">◌</span> 改写
        </span> →
        <span :class="['step', chars.length ? 'done' : (scriptContent ? 'on' : '')]">
          <span v-if="rt === 'extractor'" class="animate-spin">◌</span> 提取
        </span> →
        <span :class="['step', charsVoiced > 0 ? 'done' : (chars.length ? 'on' : '')]">
          <span v-if="rt === 'voice_assigner'" class="animate-spin">◌</span> 音色
        </span>
      </div>

      <div class="split-editor">
        <div class="editor-pane">
          <div class="pane-head">原始内容 <span v-if="rawLen" class="tag mono">{{ rawLen }}</span>
            <button class="btn btn-xs" style="margin-left:auto" @click="saveRaw">保存</button>
          </div>
          <textarea class="textarea pane-text" v-model="localRaw" placeholder="粘贴小说/故事..." />
        </div>

        <div class="action-rail">
          <button class="rail-btn" :disabled="!localRaw.trim() || rn" @click="doRewrite" title="改写">✦</button>
          <button class="rail-btn" :disabled="!localScript.trim() || rn" @click="doExtract" title="提取">⊕</button>
        </div>

        <div class="editor-pane">
          <div class="pane-head">格式化剧本 <span v-if="scriptLen" class="tag mono">{{ scriptLen }}</span>
            <button class="btn btn-xs" style="margin-left:auto" @click="saveScr">保存</button>
          </div>
          <textarea class="textarea pane-text" v-model="localScript" placeholder="AI 改写剧本..." />
        </div>
      </div>

      <!-- Characters + Scenes -->
      <div v-if="chars.length || scenes.length" class="resource-strip">
        <div class="res-section">
          <div class="res-head">角色 ({{ chars.length }})
            <button class="btn btn-xs" style="margin-left:auto" :disabled="rn" @click="doVoice">分配音色</button>
          </div>
          <div class="char-row" v-for="c in chars" :key="c.id">
            <span class="char-name">{{ c.name }}</span>
            <span class="tag tag-accent mono">{{ c.voice_style || c.voiceStyle || '-' }}</span>
            <audio v-if="c.voice_sample_url || c.voiceSampleUrl" :src="'/' + (c.voice_sample_url || c.voiceSampleUrl)" controls preload="none" class="char-audio" />
            <button v-if="c.voice_style || c.voiceStyle" class="btn btn-ghost btn-xs" @click="genSample(c.id)">试听</button>
          </div>
        </div>
        <div v-if="scenes.length" class="res-section">
          <div class="res-head">场景 ({{ scenes.length }})</div>
          <div class="scene-chips">
            <span v-for="s in scenes" :key="s.id" class="tag">{{ s.location }}{{ s.time ? ' · ' + s.time : '' }}</span>
          </div>
        </div>
      </div>

      <div class="panel-foot">
        <button class="btn btn-primary" @click="panel = 'storyboard'">分镜 →</button>
      </div>
    </div>

    <!-- ====== STORYBOARD PANEL ====== -->
    <div v-else-if="panel === 'storyboard'" class="panel-body">
      <div class="strip-toolbar">
        <span class="mono">镜头 ({{ sbs.length }})</span>
        <div style="margin-left:auto;display:flex;gap:4px">
          <button class="btn btn-xs" @click="addShot">+ 添加</button>
          <button class="btn btn-xs" :disabled="rn" @click="doBreakdown">
            <span v-if="rt === 'storyboard_breaker'" class="animate-spin">◌</span> 拆解分镜
          </button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table" v-if="sbs.length">
          <thead><tr><th>#</th><th>景别</th><th>描述</th><th>视频提示词</th><th>对白</th><th>时长</th></tr></thead>
          <tbody>
            <tr v-for="(sb, i) in sbs" :key="sb.id">
              <td class="mono dim">{{ String(i+1).padStart(2,'0') }}</td>
              <td>{{ sb.shot_type || sb.shotType || '' }}</td>
              <td class="cell-clip" @dblclick="editCell(sb,'description')">{{ sb.description || '' }}</td>
              <td class="cell-clip cell-wide" @dblclick="editCell(sb,'video_prompt')">{{ sb.video_prompt || sb.videoPrompt || '' }}</td>
              <td class="cell-clip" @dblclick="editCell(sb,'dialogue')">{{ sb.dialogue || '' }}</td>
              <td class="mono dim">{{ sb.duration || 10 }}s</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty-msg">暂无分镜</div>
      </div>
      <div class="panel-foot">
        <button class="btn" @click="panel = 'script'">← 剧本</button>
        <button class="btn btn-primary" :disabled="!sbs.length" @click="panel = 'production'">制作 →</button>
      </div>
    </div>

    <!-- ====== PRODUCTION PANEL ====== -->
    <div v-else-if="panel === 'production'" class="panel-body">
      <div class="strip-toolbar">
        <span class="mono">制作</span>
        <div style="margin-left:auto;display:flex;gap:4px">
          <button class="btn btn-xs" @click="batchImages">批量图片</button>
          <button class="btn btn-xs" @click="batchVideos">批量视频</button>
          <button class="btn btn-xs" @click="batchCompose">批量合成</button>
          <button class="btn btn-xs" @click="refresh">↻ 刷新</button>
        </div>
      </div>
      <div class="prod-scroll">
        <div v-for="(sb, i) in sbs" :key="sb.id" class="prod-row">
          <span class="mono dim prod-idx">#{{ String(i+1).padStart(2,'0') }}</span>
          <div class="prod-thumb">
            <img v-if="sb.composed_image || sb.composedImage" :src="'/' + (sb.composed_image || sb.composedImage)" />
          </div>
          <div class="prod-meta">
            <div class="truncate">{{ sb.description || sb.title || '-' }}</div>
            <div class="prod-tags">
              <span :class="['tag', hasImg(sb) ? 'tag-success' : '']">图</span>
              <span :class="['tag', hasVid(sb) ? 'tag-success' : '']">视频</span>
              <span :class="['tag', hasComposed(sb) ? 'tag-success' : '']">合成</span>
            </div>
          </div>
          <div class="prod-btns">
            <button class="btn btn-ghost btn-xs" @click="genImg(sb)">🖼</button>
            <button class="btn btn-ghost btn-xs" @click="genVid(sb)">🎬</button>
            <button class="btn btn-ghost btn-xs" :disabled="!hasVid(sb)" @click="doCompose(sb)">⊞</button>
          </div>
        </div>
      </div>
      <div class="panel-foot">
        <button class="btn" @click="panel = 'storyboard'">← 分镜</button>
        <button class="btn btn-primary" @click="panel = 'export'">导出 →</button>
      </div>
    </div>

    <!-- ====== EXPORT PANEL ====== -->
    <div v-else class="panel-body">
      <div class="export-center">
        <template v-if="mergeUrl">
          <video :src="'/' + mergeUrl" controls class="export-player" />
          <div style="display:flex;gap:8px;margin-top:12px">
            <span class="tag tag-success">已完成</span>
            <a :href="'/' + mergeUrl" download class="btn btn-primary">下载视频</a>
          </div>
        </template>
        <template v-else>
          <div class="export-empty">
            <div style="font-size:24px;color:var(--text-dim)">▶</div>
            <p>{{ composedCount }}/{{ sbs.length }} 镜头已合成</p>
            <button class="btn btn-primary" :disabled="composedCount === 0" @click="doMerge">拼接全集</button>
          </div>
        </template>
      </div>
      <div class="panel-foot">
        <button class="btn" @click="panel = 'production'">← 制作</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import { dramaAPI, episodeAPI, storyboardAPI, characterAPI, imageAPI, videoAPI, composeAPI, mergeAPI } from '~/composables/useApi'
import { useAgent } from '~/composables/useAgent'

definePageMeta({ layout: 'studio' })

const route = useRoute()
const dramaId = Number(route.params.id)
const episodeNumber = Number(route.params.episodeNumber)

const drama = ref(null)
const episode = ref(null)
const chars = ref([])
const scenes = ref([])
const sbs = ref([])
const mergeData = ref(null)
const panel = ref('script')

const { running: rn, runningType: rt, run: runAgent } = useAgent()

const localRaw = ref('')
const localScript = ref('')

const rawContent = computed(() => episode.value?.content || '')
const scriptContent = computed(() => episode.value?.script_content || episode.value?.scriptContent || '')
const epId = computed(() => episode.value?.id || 0)
const rawLen = computed(() => localRaw.value.replace(/\s/g, '').length || 0)
const scriptLen = computed(() => localScript.value.replace(/\s/g, '').length || 0)
const charsVoiced = computed(() => chars.value.filter(c => c.voice_style || c.voiceStyle).length)
const composedCount = computed(() => sbs.value.filter(s => s.composed_video_url || s.composedVideoUrl).length)
const mergeUrl = computed(() => mergeData.value?.merged_url || mergeData.value?.mergedUrl || null)

const panelDefs = computed(() => [
  { id: 'script', label: '剧本', count: chars.value.length ? `${chars.value.length}角色` : '' },
  { id: 'storyboard', label: '分镜', count: sbs.value.length || '' },
  { id: 'production', label: '制作', count: composedCount.value ? `${composedCount.value}/${sbs.value.length}` : '' },
  { id: 'export', label: '导出', count: mergeUrl.value ? '✓' : '' },
])

watch(rawContent, v => { localRaw.value = v }, { immediate: true })
watch(scriptContent, v => { localScript.value = v }, { immediate: true })

async function refresh() {
  drama.value = await dramaAPI.get(dramaId)
  const ep = drama.value.episodes?.find(e => (e.episode_number || e.episodeNumber) === episodeNumber)
  if (ep) {
    episode.value = ep; chars.value = drama.value.characters || []; scenes.value = drama.value.scenes || []
    sbs.value = await episodeAPI.storyboards(ep.id)
  }
  try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
}

function saveRaw() { episodeAPI.update(epId.value, { content: localRaw.value }); episode.value.content = localRaw.value }
function saveScr() { episodeAPI.update(epId.value, { script_content: localScript.value }); episode.value.script_content = localScript.value }

function doRewrite() { saveRaw(); runAgent('script_rewriter', '请读取剧本并改写为格式化剧本，然后保存', dramaId, epId.value, refresh) }
function doExtract() { saveScr(); runAgent('extractor', '请从剧本中提取所有角色和场景信息', dramaId, epId.value, refresh) }
function doVoice() { runAgent('voice_assigner', '请为所有角色分配合适的音色', dramaId, epId.value, refresh) }
function doBreakdown() { runAgent('storyboard_breaker', '请拆解分镜并生成视频提示词', dramaId, epId.value, () => { refresh(); panel.value = 'storyboard' }) }
async function genSample(id) { try { await characterAPI.voiceSample(id); toast.success('试听已生成'); refresh() } catch (e) { toast.error(e.message) } }
async function addShot() { await storyboardAPI.create({ episode_id: epId.value, storyboard_number: sbs.value.length + 1, title: `镜头${sbs.value.length + 1}`, duration: 10 }); refresh() }
function editCell(sb, f) { const v = prompt(f, sb[f] || ''); if (v !== null) { storyboardAPI.update(sb.id, { [f]: v }); sb[f] = v } }

function hasImg(s) { return !!(s.composed_image || s.composedImage) }
function hasVid(s) { return !!(s.video_url || s.videoUrl) }
function hasComposed(s) { return !!(s.composed_video_url || s.composedVideoUrl) }

async function genImg(sb) { await imageAPI.generate({ storyboard_id: sb.id, drama_id: dramaId, prompt: sb.image_prompt || sb.imagePrompt || sb.description || '' }); toast.success('开始生成') }
async function genVid(sb) { await videoAPI.generate({ storyboard_id: sb.id, drama_id: dramaId, prompt: sb.video_prompt || sb.videoPrompt || '' }); toast.success('开始生成') }
async function doCompose(sb) { try { await composeAPI.shot(sb.id); toast.success('合成完成'); refresh() } catch (e) { toast.error(e.message) } }

function batchImages() { sbs.value.filter(s => !hasImg(s)).forEach(s => genImg(s)) }
function batchVideos() { sbs.value.filter(s => !hasVid(s)).forEach(s => genVid(s)) }
async function batchCompose() { await composeAPI.all(epId.value); toast.success('批量合成已开始') }

async function doMerge() {
  await mergeAPI.merge(epId.value); toast.success('拼接中...')
  const poll = setInterval(async () => {
    try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
    if (mergeData.value?.status === 'completed' || mergeData.value?.status === 'failed') {
      clearInterval(poll)
      mergeData.value.status === 'completed' ? toast.success('拼接完成') : toast.error('拼接失败')
    }
  }, 3000)
}

onMounted(refresh)
</script>

<style scoped>
.wb { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

/* Header */
.wb-header { display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 36px; border-bottom: 1px solid var(--border); background: var(--bg-panel); flex-shrink: 0; }
.wb-title { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
.wb-tabs { display: flex; gap: 1px; margin-left: 16px; }
.wb-tab { padding: 6px 14px; font-size: 11px; font-weight: 500; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.1s; }
.wb-tab:hover { color: var(--text-secondary); }
.wb-tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab-count { font-size: 9px; margin-left: 4px; padding: 0 4px; border-radius: 3px; background: var(--bg-elevated); }

.panel-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.panel-foot { flex-shrink: 0; display: flex; justify-content: space-between; padding: 6px 12px; border-top: 1px solid var(--border); background: var(--bg-panel); }

/* Step bar */
.step-bar { display: flex; align-items: center; gap: 6px; padding: 5px 12px; border-bottom: 1px solid var(--border); background: var(--bg-panel); font-size: 11px; color: var(--text-dim); flex-shrink: 0; }
.step { display: inline-flex; align-items: center; gap: 2px; }
.step.done { color: var(--success); }
.step.on { color: var(--accent); font-weight: 600; }

/* Split editor */
.split-editor { flex: 1; display: flex; min-height: 0; }
.editor-pane { flex: 1; display: flex; flex-direction: column; }
.pane-head { display: flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 11px; font-weight: 600; color: var(--text-muted); border-bottom: 1px solid var(--border); }
.pane-text { flex: 1; padding: 8px 10px; font-size: 11px; border: none; background: transparent; }
.action-rail { width: 36px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; border-left: 1px solid var(--border); border-right: 1px solid var(--border); background: var(--bg-panel); }
.rail-btn { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--border); background: transparent; color: var(--text-muted); font-size: 12px; cursor: pointer; transition: all 0.1s; display: flex; align-items: center; justify-content: center; }
.rail-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.rail-btn:disabled { opacity: 0.25; }

/* Resource strip */
.resource-strip { flex-shrink: 0; max-height: 200px; overflow-y: auto; border-top: 1px solid var(--border); padding: 8px 12px; display: flex; gap: 16px; }
.res-section { flex: 1; }
.res-head { font-size: 11px; font-weight: 600; display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }
.char-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 11px; }
.char-name { font-weight: 500; min-width: 40px; }
.char-audio { height: 24px; max-width: 120px; }
.scene-chips { display: flex; flex-wrap: wrap; gap: 4px; }

/* Table */
.strip-toolbar { display: flex; align-items: center; padding: 6px 12px; border-bottom: 1px solid var(--border); background: var(--bg-panel); flex-shrink: 0; font-size: 12px; font-weight: 600; }
.table-wrap { flex: 1; overflow: auto; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th { padding: 4px 8px; font-size: 10px; font-weight: 600; color: var(--text-dim); text-align: left; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg-panel); z-index: 1; text-transform: uppercase; letter-spacing: 0.5px; }
.data-table td { padding: 6px 8px; font-size: 11px; border-bottom: 1px solid var(--border); vertical-align: top; }
.data-table tr:hover { background: var(--bg-hover); }
.cell-clip { max-width: 160px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; cursor: pointer; }
.cell-wide { max-width: 260px; }
.dim { color: var(--text-dim); }
.empty-msg { padding: 40px; text-align: center; color: var(--text-muted); font-size: 12px; }

/* Production */
.prod-scroll { flex: 1; overflow-y: auto; padding: 6px 8px; display: flex; flex-direction: column; gap: 3px; }
.prod-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: var(--radius); transition: background 0.1s; }
.prod-row:hover { background: var(--bg-hover); }
.prod-idx { width: 28px; font-size: 10px; }
.prod-thumb { width: 64px; height: 36px; border-radius: 3px; overflow: hidden; background: var(--bg-elevated); flex-shrink: 0; }
.prod-thumb img { width: 100%; height: 100%; object-fit: cover; }
.prod-meta { flex: 1; min-width: 0; font-size: 11px; }
.prod-tags { display: flex; gap: 3px; margin-top: 3px; }
.prod-btns { display: flex; gap: 2px; flex-shrink: 0; }

/* Export */
.export-center { flex: 1; display: flex; align-items: center; justify-content: center; }
.export-player { max-width: 560px; width: 100%; border-radius: var(--radius-md); background: #000; }
.export-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--text-muted); font-size: 12px; }
</style>
