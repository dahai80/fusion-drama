<template>
  <div class="wb" v-if="drama">
    <!-- Header -->
    <header class="wb-head">
      <button class="btn btn-ghost btn-sm" @click="navigateTo(`/drama/${dramaId}`)">
        <ArrowLeft :size="14" />
      </button>
      <span class="wb-title">{{ drama.title }}</span>
      <span class="tag">E{{ episodeNumber }}</span>
      <div class="wb-tabs">
        <button v-for="p in panelDefs" :key="p.id" :class="['wb-tab', { active: panel === p.id }]" @click="panel = p.id">
          <component :is="p.icon" :size="14" />
          {{ p.label }}
          <span v-if="p.badge" :class="['tab-badge', p.badgeType]">{{ p.badge }}</span>
        </button>
      </div>
      <button class="btn btn-ghost btn-sm ml-auto" @click="refresh">
        <RefreshCw :size="13" />
      </button>
    </header>

    <!-- ===== SCRIPT PANEL ===== -->
    <section v-if="panel === 'script'" class="panel">
      <div class="pipeline">
        <template v-for="(s, i) in scriptSteps" :key="i">
          <span v-if="i > 0" class="pipe-sep">→</span>
          <span :class="['pipe-step', s.state]">
            <Loader2 v-if="s.spinning" :size="12" class="animate-spin" />
            <span v-else-if="s.state === 'done'" style="color:var(--success)">✓</span>
            {{ s.label }}
          </span>
        </template>
      </div>

      <div class="split">
        <div class="split-pane">
          <div class="pane-head">
            <span>原始内容</span>
            <span v-if="rawLen" class="tag mono">{{ rawLen }}字</span>
            <button class="btn btn-ghost btn-sm ml-auto" @click="saveRaw">保存</button>
          </div>
          <textarea class="textarea split-text" v-model="localRaw" placeholder="粘贴小说/故事原文..." />
        </div>

        <div class="split-actions">
          <button class="action-pill" :disabled="!localRaw.trim() || rn" @click="doRewrite" title="AI 改写">
            <Wand2 :size="14" />
          </button>
          <button class="action-pill" :disabled="!localScript.trim() || rn" @click="doExtract" title="提取角色场景">
            <Scan :size="14" />
          </button>
        </div>

        <div class="split-pane">
          <div class="pane-head">
            <span>格式化剧本</span>
            <span v-if="scriptLen" class="tag mono">{{ scriptLen }}字</span>
            <button class="btn btn-ghost btn-sm ml-auto" @click="saveScr">保存</button>
          </div>
          <textarea class="textarea split-text" v-model="localScript" placeholder="AI 改写后的格式化剧本..." />
        </div>
      </div>

      <!-- Resources -->
      <div v-if="chars.length || scenes.length" class="resources">
        <div class="res-col">
          <div class="res-title">
            <Users :size="13" /> 角色 ({{ chars.length }})
            <button class="btn btn-ghost btn-sm ml-auto" :disabled="rn" @click="doVoice">
              <Mic :size="12" /> 分配音色
            </button>
          </div>
          <div class="char-list">
            <div v-for="c in chars" :key="c.id" class="char-item card">
              <div class="char-top">
                <span class="char-name">{{ c.name }}</span>
                <span class="tag tag-accent mono">{{ c.voice_style || c.voiceStyle || '—' }}</span>
              </div>
              <div v-if="c.role" class="char-role">{{ c.role }}</div>
              <div v-if="c.voice_sample_url || c.voiceSampleUrl" class="char-audio">
                <audio :src="'/' + (c.voice_sample_url || c.voiceSampleUrl)" controls preload="none" />
              </div>
              <button v-if="c.voice_style || c.voiceStyle" class="btn btn-ghost btn-sm" @click="genSample(c.id)">生成试听</button>
            </div>
          </div>
        </div>
        <div v-if="scenes.length" class="res-col">
          <div class="res-title"><MapPin :size="13" /> 场景 ({{ scenes.length }})</div>
          <div class="scene-chips">
            <span v-for="s in scenes" :key="s.id" class="tag">{{ s.location }}{{ s.time ? ' · ' + s.time : '' }}</span>
          </div>
        </div>
      </div>

      <div class="panel-foot">
        <div />
        <button class="btn btn-primary" @click="panel = 'storyboard'">分镜 →</button>
      </div>
    </section>

    <!-- ===== STORYBOARD PANEL ===== -->
    <section v-else-if="panel === 'storyboard'" class="panel">
      <div class="bar">
        <span class="bar-title">镜头列表</span>
        <span class="tag">{{ sbs.length }}</span>
        <div class="ml-auto flex gap-1">
          <button class="btn btn-sm" @click="addShot"><Plus :size="12" /> 添加</button>
          <button class="btn btn-primary btn-sm" :disabled="rn" @click="doBreakdown">
            <Loader2 v-if="rt === 'storyboard_breaker'" :size="12" class="animate-spin" />
            <Wand2 v-else :size="12" /> 拆解分镜
          </button>
        </div>
      </div>
      <div v-if="sbs.length" class="table-wrap">
        <table class="table">
          <thead><tr><th style="width:40px">#</th><th style="width:60px">景别</th><th>描述</th><th style="min-width:200px">视频提示词</th><th>对白</th><th style="width:50px">时长</th></tr></thead>
          <tbody>
            <tr v-for="(sb, i) in sbs" :key="sb.id" @dblclick="editRow(sb)">
              <td class="mono dim">{{ String(i+1).padStart(2,'0') }}</td>
              <td>{{ sb.shot_type || sb.shotType || '' }}</td>
              <td class="cell-clip">{{ sb.description || '' }}</td>
              <td class="cell-clip">{{ sb.video_prompt || sb.videoPrompt || '' }}</td>
              <td class="cell-clip">{{ sb.dialogue || '' }}</td>
              <td class="mono dim">{{ sb.duration || 10 }}s</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-state">
        <Clapperboard :size="28" style="color:var(--text-3)" />
        <p>暂无分镜，点击「拆解分镜」自动生成</p>
      </div>
      <div class="panel-foot">
        <button class="btn" @click="panel = 'script'">← 剧本</button>
        <button class="btn btn-primary" :disabled="!sbs.length" @click="panel = 'production'">制作 →</button>
      </div>
    </section>

    <!-- ===== PRODUCTION PANEL ===== -->
    <section v-else-if="panel === 'production'" class="panel">
      <div class="bar">
        <span class="bar-title">制作进度</span>
        <span class="tag tag-success" v-if="composedCount">{{ composedCount }}/{{ sbs.length }} 已合成</span>
        <div class="ml-auto flex gap-1">
          <button class="btn btn-sm" @click="batchImages"><ImageIcon :size="12" /> 批量图片</button>
          <button class="btn btn-sm" @click="batchVideos"><Video :size="12" /> 批量视频</button>
          <button class="btn btn-primary btn-sm" @click="batchCompose"><Layers :size="12" /> 批量合成</button>
        </div>
      </div>
      <div class="prod-scroll">
        <div v-for="(sb, i) in sbs" :key="sb.id" class="prod-row card">
          <span class="mono dim" style="width:28px;text-align:center">#{{ String(i+1).padStart(2,'0') }}</span>
          <div class="prod-thumb">
            <img v-if="hasImg(sb)" :src="'/' + (sb.composed_image || sb.composedImage)" />
            <ImageIcon v-else :size="16" style="color:var(--text-3)" />
          </div>
          <div class="prod-info">
            <div class="truncate" style="font-size:12px">{{ sb.description || sb.title || '—' }}</div>
            <div class="flex gap-1" style="margin-top:4px">
              <span :class="['tag', hasImg(sb) ? 'tag-success' : '']">图片</span>
              <span :class="['tag', hasVid(sb) ? 'tag-success' : '']">视频</span>
              <span :class="['tag', hasComposed(sb) ? 'tag-success' : '']">合成</span>
            </div>
          </div>
          <div class="flex gap-1">
            <button class="btn btn-ghost btn-icon" @click="genImg(sb)" title="生成图片"><ImageIcon :size="13" /></button>
            <button class="btn btn-ghost btn-icon" @click="genVid(sb)" title="生成视频"><Video :size="13" /></button>
            <button class="btn btn-ghost btn-icon" :disabled="!hasVid(sb)" @click="doCompose(sb)" title="合成"><Layers :size="13" /></button>
          </div>
        </div>
      </div>
      <div class="panel-foot">
        <button class="btn" @click="panel = 'storyboard'">← 分镜</button>
        <button class="btn btn-primary" @click="panel = 'export'">导出 →</button>
      </div>
    </section>

    <!-- ===== EXPORT PANEL ===== -->
    <section v-else class="panel">
      <div class="export-center">
        <template v-if="mergeUrl">
          <video :src="'/' + mergeUrl" controls class="export-video" />
          <div class="flex items-center gap-2" style="margin-top:16px">
            <span class="tag tag-success">拼接完成</span>
            <a :href="'/' + mergeUrl" download class="btn btn-primary"><Download :size="14" /> 下载视频</a>
          </div>
        </template>
        <template v-else>
          <div class="export-placeholder">
            <Film :size="36" style="color:var(--text-3)" />
            <p style="font-size:14px;color:var(--text-1)">{{ composedCount }}/{{ sbs.length }} 镜头已合成</p>
            <button class="btn btn-primary" :disabled="composedCount === 0" @click="doMerge">
              <Layers :size="14" /> 拼接全集视频
            </button>
          </div>
        </template>
      </div>
      <div class="panel-foot">
        <button class="btn" @click="panel = 'production'">← 制作</button>
        <div />
      </div>
    </section>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import {
  ArrowLeft, RefreshCw, Wand2, Scan, Users, MapPin, Mic,
  Plus, Clapperboard, ImageIcon, Video, Layers, Film, Download, Loader2,
  FileText,
} from 'lucide-vue-next'
import { dramaAPI, episodeAPI, storyboardAPI, characterAPI, imageAPI, videoAPI, composeAPI, mergeAPI } from '~/composables/useApi'
import { useAgent } from '~/composables/useAgent'

definePageMeta({ layout: 'studio' })

const route = useRoute()
const dramaId = Number(route.params.id)
const episodeNumber = Number(route.params.episodeNumber)

const drama = ref(null), episode = ref(null), chars = ref([]), scenes = ref([]), sbs = ref([]), mergeData = ref(null)
const panel = ref('script')
const { running: rn, runningType: rt, run: runAgent } = useAgent()

const localRaw = ref(''), localScript = ref('')
const rawContent = computed(() => episode.value?.content || '')
const scriptContent = computed(() => episode.value?.script_content || episode.value?.scriptContent || '')
const epId = computed(() => episode.value?.id || 0)
const rawLen = computed(() => localRaw.value.replace(/\s/g, '').length || 0)
const scriptLen = computed(() => localScript.value.replace(/\s/g, '').length || 0)
const charsVoiced = computed(() => chars.value.filter(c => c.voice_style || c.voiceStyle).length)
const composedCount = computed(() => sbs.value.filter(s => s.composed_video_url || s.composedVideoUrl).length)
const mergeUrl = computed(() => mergeData.value?.merged_url || mergeData.value?.mergedUrl || null)

const panelDefs = computed(() => [
  { id: 'script', label: '剧本', icon: FileText, badge: chars.value.length ? `${chars.value.length}` : '', badgeType: 'tag-accent' },
  { id: 'storyboard', label: '分镜', icon: Clapperboard, badge: sbs.value.length ? `${sbs.value.length}` : '', badgeType: '' },
  { id: 'production', label: '制作', icon: Video, badge: composedCount.value ? `${composedCount.value}/${sbs.value.length}` : '', badgeType: composedCount.value ? 'tag-success' : '' },
  { id: 'export', label: '导出', icon: Film, badge: mergeUrl.value ? '✓' : '', badgeType: 'tag-success' },
])

const scriptSteps = computed(() => [
  { label: '原始内容', state: rawContent.value ? 'done' : 'active', spinning: false },
  { label: '改写', state: scriptContent.value ? 'done' : (rawContent.value ? 'active' : ''), spinning: rt.value === 'script_rewriter' },
  { label: '提取', state: chars.value.length ? 'done' : (scriptContent.value ? 'active' : ''), spinning: rt.value === 'extractor' },
  { label: '音色', state: charsVoiced.value > 0 ? 'done' : (chars.value.length ? 'active' : ''), spinning: rt.value === 'voice_assigner' },
])

watch(rawContent, v => { localRaw.value = v }, { immediate: true })
watch(scriptContent, v => { localScript.value = v }, { immediate: true })

async function refresh() {
  drama.value = await dramaAPI.get(dramaId)
  const ep = drama.value.episodes?.find(e => (e.episode_number || e.episodeNumber) === episodeNumber)
  if (ep) { episode.value = ep; chars.value = drama.value.characters || []; scenes.value = drama.value.scenes || []; sbs.value = await episodeAPI.storyboards(ep.id) }
  try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
}

function saveRaw() { episodeAPI.update(epId.value, { content: localRaw.value }); episode.value.content = localRaw.value; toast.success('已保存') }
function saveScr() { episodeAPI.update(epId.value, { script_content: localScript.value }); episode.value.script_content = localScript.value; toast.success('已保存') }
function doRewrite() { saveRaw(); runAgent('script_rewriter', '请读取剧本并改写为格式化剧本，然后保存', dramaId, epId.value, refresh) }
function doExtract() { saveScr(); runAgent('extractor', '请从剧本中提取所有角色和场景信息', dramaId, epId.value, refresh) }
function doVoice() { runAgent('voice_assigner', '请为所有角色分配合适的音色', dramaId, epId.value, refresh) }
function doBreakdown() { runAgent('storyboard_breaker', '请拆解分镜并生成视频提示词', dramaId, epId.value, () => { refresh(); panel.value = 'storyboard' }) }
async function genSample(id) { try { await characterAPI.voiceSample(id); toast.success('试听已生成'); refresh() } catch (e) { toast.error(e.message) } }
async function addShot() { await storyboardAPI.create({ episode_id: epId.value, storyboard_number: sbs.value.length + 1, title: `镜头${sbs.value.length + 1}`, duration: 10 }); refresh() }
function editRow(sb) { const f = prompt('编辑字段 (description/video_prompt/dialogue)'); if (!f) return; const v = prompt(f, sb[f] || ''); if (v !== null) { storyboardAPI.update(sb.id, { [f]: v }); sb[f] = v } }

function hasImg(s) { return !!(s.composed_image || s.composedImage) }
function hasVid(s) { return !!(s.video_url || s.videoUrl) }
function hasComposed(s) { return !!(s.composed_video_url || s.composedVideoUrl) }
async function genImg(sb) { await imageAPI.generate({ storyboard_id: sb.id, drama_id: dramaId, prompt: sb.image_prompt || sb.imagePrompt || sb.description || '' }); toast.success('图片生成中') }
async function genVid(sb) { await videoAPI.generate({ storyboard_id: sb.id, drama_id: dramaId, prompt: sb.video_prompt || sb.videoPrompt || '' }); toast.success('视频生成中') }
async function doCompose(sb) { try { await composeAPI.shot(sb.id); toast.success('合成完成'); refresh() } catch (e) { toast.error(e.message) } }
function batchImages() { sbs.value.filter(s => !hasImg(s)).forEach(s => genImg(s)) }
function batchVideos() { sbs.value.filter(s => !hasVid(s)).forEach(s => genVid(s)) }
async function batchCompose() { await composeAPI.all(epId.value); toast.success('批量合成已开始') }
async function doMerge() {
  await mergeAPI.merge(epId.value); toast.success('拼接中...')
  const poll = setInterval(async () => {
    try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
    if (mergeData.value?.status === 'completed' || mergeData.value?.status === 'failed') { clearInterval(poll); mergeData.value.status === 'completed' ? toast.success('拼接完成') : toast.error('拼接失败') }
  }, 3000)
}

onMounted(refresh)
</script>

<style scoped>
.wb { display: flex; flex-direction: column; height: 100vh; }

/* Header */
.wb-head { display: flex; align-items: center; gap: 10px; padding: 0 16px; height: 44px; background: var(--bg-1); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.wb-title { font-size: 14px; font-weight: 600; }
.wb-tabs { display: flex; gap: 2px; margin-left: 16px; }
.wb-tab { display: flex; align-items: center; gap: 5px; padding: 6px 14px; font-size: 12px; font-weight: 500; border: none; background: transparent; color: var(--text-2); cursor: pointer; border-radius: var(--radius); transition: all 0.15s; }
.wb-tab:hover { background: var(--bg-hover); color: var(--text-0); }
.wb-tab.active { background: var(--accent-bg); color: var(--accent-text); }
.tab-badge { font-size: 10px; padding: 0 5px; border-radius: 99px; background: var(--bg-2); }
.tab-badge.tag-success { background: var(--success-bg); color: var(--success); }
.tab-badge.tag-accent { background: var(--accent-bg); color: var(--accent-text); }

/* Panel */
.panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.panel-foot { flex-shrink: 0; display: flex; justify-content: space-between; padding: 8px 16px; border-top: 1px solid var(--border); background: var(--bg-1); }

/* Pipeline */
.pipeline { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg-1); font-size: 12px; flex-shrink: 0; }
.pipe-sep { color: var(--text-3); }
.pipe-step { display: flex; align-items: center; gap: 4px; color: var(--text-3); }
.pipe-step.done { color: var(--success); }
.pipe-step.active { color: var(--accent); font-weight: 600; }

/* Split Editor */
.split { flex: 1; display: flex; min-height: 0; }
.split-pane { flex: 1; display: flex; flex-direction: column; }
.pane-head { display: flex; align-items: center; gap: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; color: var(--text-2); border-bottom: 1px solid var(--border); }
.split-text { flex: 1; padding: 12px; border: none; background: transparent; font-size: 13px; }
.split-actions { width: 44px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border-left: 1px solid var(--border); border-right: 1px solid var(--border); background: var(--bg-1); }
.action-pill { width: 32px; height: 32px; border-radius: 99px; border: 1px solid var(--border); background: var(--bg-0); color: var(--text-2); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.15s; box-shadow: var(--shadow); }
.action-pill:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
.action-pill:disabled { opacity: 0.3; cursor: not-allowed; box-shadow: none; }

/* Resources */
.resources { flex-shrink: 0; max-height: 240px; overflow-y: auto; border-top: 1px solid var(--border); padding: 12px 16px; display: flex; gap: 20px; }
.res-col { flex: 1; }
.res-title { font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.char-list { display: flex; flex-wrap: wrap; gap: 8px; }
.char-item { padding: 10px; min-width: 160px; display: flex; flex-direction: column; gap: 4px; }
.char-top { display: flex; justify-content: space-between; align-items: center; }
.char-name { font-size: 13px; font-weight: 600; }
.char-role { font-size: 11px; color: var(--text-2); }
.char-audio audio { width: 100%; height: 28px; margin-top: 4px; }
.scene-chips { display: flex; flex-wrap: wrap; gap: 6px; }

/* Bar */
.bar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg-1); flex-shrink: 0; }
.bar-title { font-size: 13px; font-weight: 600; }

/* Table */
.table-wrap { flex: 1; overflow: auto; }
.table { width: 100%; border-collapse: collapse; }
.table th { padding: 6px 10px; font-size: 11px; font-weight: 600; color: var(--text-2); text-align: left; border-bottom: 1px solid var(--border); position: sticky; top: 0; background: var(--bg-1); z-index: 1; }
.table td { padding: 8px 10px; font-size: 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
.table tr:hover { background: var(--bg-hover); }
.table tr { cursor: pointer; }
.cell-clip { max-width: 200px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.dim { color: var(--text-3); }

/* Production */
.prod-scroll { flex: 1; overflow-y: auto; padding: 10px 16px; display: flex; flex-direction: column; gap: 6px; }
.prod-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; }
.prod-thumb { width: 72px; height: 40px; border-radius: 4px; overflow: hidden; background: var(--bg-2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.prod-thumb img { width: 100%; height: 100%; object-fit: cover; }
.prod-info { flex: 1; min-width: 0; }

/* Export */
.export-center { flex: 1; display: flex; align-items: center; justify-content: center; padding: 32px; }
.export-video { max-width: 600px; width: 100%; border-radius: var(--radius-lg); background: #000; }
.export-placeholder { display: flex; flex-direction: column; align-items: center; gap: 12px; }

/* States */
.empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-2); font-size: 13px; }
</style>
