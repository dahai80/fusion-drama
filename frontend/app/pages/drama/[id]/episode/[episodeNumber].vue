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

    <!-- ===== SCRIPT PANEL (引导式) ===== -->
    <section v-if="panel === 'script'" class="panel">
      <!-- Step bar -->
      <div class="wizard-bar">
        <button v-for="(s, i) in scriptSteps" :key="i"
          :class="['wizard-step', { done: s.state === 'done', active: i === scriptStep, future: i > scriptStep && s.state !== 'done' }]"
          @click="s.state === 'done' || i <= scriptStep ? scriptStep = i : null">
          <span class="wizard-dot">
            <Loader2 v-if="s.spinning" :size="11" class="animate-spin" />
            <Check v-else-if="s.state === 'done'" :size="11" />
            <span v-else>{{ i + 1 }}</span>
          </span>
          <span class="wizard-label">{{ s.label }}</span>
        </button>
      </div>

      <div class="wizard-body">
        <!-- Step 1: 原始内容 -->
        <div v-if="scriptStep === 0" class="wizard-content">
          <div class="wizard-title">粘贴或上传原始内容</div>
          <div class="wizard-desc">将小说、故事或大纲内容粘贴到下方</div>
          <textarea class="textarea wizard-textarea" v-model="localRaw" placeholder="粘贴小说/故事原文..." />
          <div class="wizard-actions">
            <span v-if="rawLen" class="tag mono">{{ rawLen }}字</span>
            <button class="btn btn-primary ml-auto" :disabled="!localRaw.trim()" @click="saveRaw(); scriptStep = 1">
              保存并继续 →
            </button>
          </div>
        </div>

        <!-- Step 2: AI 改写 -->
        <div v-else-if="scriptStep === 1" class="wizard-content">
          <div class="wizard-title">AI 改写为格式化剧本</div>
          <div class="wizard-desc">将原始内容改写为带场景头和对白格式的剧本</div>
          <div v-if="!scriptContent && !rn" class="wizard-action-center">
            <button class="btn btn-primary" :disabled="rn" @click="doRewrite">
              <Wand2 :size="14" /> 开始改写
            </button>
          </div>
          <div v-else-if="rn && rt === 'script_rewriter'" class="wizard-action-center">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <p style="color:var(--text-2);margin-top:8px">正在改写中...</p>
          </div>
          <template v-else>
            <textarea class="textarea wizard-textarea" v-model="localScript" placeholder="格式化剧本内容..." />
            <div class="wizard-actions">
              <span v-if="scriptLen" class="tag mono">{{ scriptLen }}字</span>
              <button class="btn btn-ghost" @click="doRewrite" :disabled="rn">重新改写</button>
              <button class="btn btn-primary ml-auto" @click="saveScr(); scriptStep = 2">
                保存并继续 →
              </button>
            </div>
          </template>
        </div>

        <!-- Step 3: 提取角色场景 -->
        <div v-else-if="scriptStep === 2" class="wizard-content">
          <div class="wizard-title">提取角色和场景</div>
          <div class="wizard-desc">从格式化剧本中自动提取角色信息和场景列表</div>
          <div v-if="!chars.length && !rn" class="wizard-action-center">
            <button class="btn btn-primary" :disabled="rn" @click="doExtract">
              <Scan :size="14" /> 开始提取
            </button>
          </div>
          <div v-else-if="rn && rt === 'extractor'" class="wizard-action-center">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <p style="color:var(--text-2);margin-top:8px">正在提取中...</p>
          </div>
          <template v-else>
            <div class="extract-result">
              <div class="extract-section">
                <div class="extract-head"><Users :size="13" /> 角色 ({{ chars.length }})</div>
                <table class="table" v-if="chars.length">
                  <thead><tr><th>名字</th><th>角色</th><th>描述</th></tr></thead>
                  <tbody>
                    <tr v-for="c in chars" :key="c.id">
                      <td style="font-weight:600">{{ c.name }}</td>
                      <td>{{ c.role || '—' }}</td>
                      <td class="cell-clip">{{ c.description || c.appearance || '—' }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div class="extract-section" v-if="scenes.length">
                <div class="extract-head"><MapPin :size="13" /> 场景 ({{ scenes.length }})</div>
                <div class="scene-chips">
                  <span v-for="s in scenes" :key="s.id" class="tag">{{ s.location }}{{ s.time ? ' · ' + s.time : '' }}</span>
                </div>
              </div>
            </div>
            <div class="wizard-actions">
              <button class="btn btn-ghost" @click="doExtract" :disabled="rn">重新提取</button>
              <button class="btn btn-primary ml-auto" @click="scriptStep = 3">继续 →</button>
            </div>
          </template>
        </div>

        <!-- Step 4: 分配音色 -->
        <div v-else-if="scriptStep === 3" class="wizard-content">
          <div class="wizard-title">分配角色音色</div>
          <div class="wizard-desc">为每个角色选择合适的 TTS 音色</div>
          <div v-if="!charsVoiced && !rn" class="wizard-action-center">
            <button class="btn btn-primary" :disabled="rn" @click="doVoice">
              <Mic :size="14" /> AI 自动分配
            </button>
          </div>
          <div v-else-if="rn && rt === 'voice_assigner'" class="wizard-action-center">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <p style="color:var(--text-2);margin-top:8px">正在分配音色...</p>
          </div>
          <template v-else>
            <table class="table voice-table">
              <thead><tr><th>角色</th><th>角色定位</th><th>音色</th><th>试听</th><th></th></tr></thead>
              <tbody>
                <tr v-for="c in chars" :key="c.id">
                  <td style="font-weight:600">{{ c.name }}</td>
                  <td>{{ c.role || '—' }}</td>
                  <td>
                    <select :value="c.voice_style || c.voiceStyle || ''" class="input" style="width:120px;font-size:11px"
                      @change="updateCharVoice(c.id, $event.target.value)">
                      <option value="">未选择</option>
                      <option v-for="v in voiceOptions" :key="v" :value="v">{{ v }}</option>
                    </select>
                  </td>
                  <td>
                    <audio v-if="c.voice_sample_url || c.voiceSampleUrl" :src="'/' + (c.voice_sample_url || c.voiceSampleUrl)" controls preload="none" style="height:28px;max-width:140px" />
                    <span v-else class="dim">—</span>
                  </td>
                  <td>
                    <button v-if="c.voice_style || c.voiceStyle" class="btn btn-ghost btn-sm" @click="genSample(c.id)">生成</button>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="wizard-actions">
              <button class="btn btn-ghost" @click="doVoice" :disabled="rn">重新分配</button>
              <button class="btn btn-primary ml-auto" @click="panel = 'storyboard'">完成，进入分镜 →</button>
            </div>
          </template>
        </div>
      </div>
    </section>

    <!-- ===== STORYBOARD PANEL ===== -->
    <section v-else-if="panel === 'storyboard'" class="panel">
      <div class="bar">
        <span class="bar-title">镜头列表</span>
        <span class="tag">{{ sbs.length }}</span>
        <span v-if="sbs.length" class="tag tag-info mono">{{ totalDuration }}s</span>
        <div class="ml-auto flex gap-1">
          <button class="btn btn-sm" @click="addShot"><Plus :size="12" /> 添加</button>
          <button class="btn btn-primary btn-sm" :disabled="rn" @click="doBreakdown">
            <Loader2 v-if="rt === 'storyboard_breaker'" :size="12" class="animate-spin" />
            <Wand2 v-else :size="12" /> 拆解分镜
          </button>
        </div>
      </div>

      <div v-if="sbs.length" class="sb-layout">
        <!-- Left: Shot cards -->
        <div class="sb-list-side">
          <div v-for="(sb, i) in sbs" :key="sb.id"
            :class="['shot-card', { 'shot-active': selectedSb?.id === sb.id }]"
            @click="selectedSb = sb">
            <div class="shot-header">
              <span class="shot-num mono">#{{ String(i+1).padStart(2,'0') }}</span>
              <span class="tag" style="font-size:10px">{{ sb.shot_type || sb.shotType || '—' }}</span>
              <span class="shot-dur mono">{{ sb.duration || 10 }}s</span>
            </div>
            <div class="shot-desc">{{ sb.description || sb.title || '无描述' }}</div>
            <div v-if="sb.dialogue" class="shot-dialogue">{{ sb.dialogue }}</div>
          </div>
        </div>

        <!-- Right: Editor -->
        <div class="sb-editor-side" v-if="selectedSb">
          <div class="editor-head">
            <span class="editor-title">镜头 #{{ sbs.indexOf(selectedSb) + 1 }}</span>
            <span class="tag mono">{{ (selectedSb.duration || 10) }}s</span>
            <button class="btn btn-ghost btn-sm ml-auto" style="color:var(--error)" @click="deleteShot(selectedSb)">
              <Trash2 :size="12" />
            </button>
          </div>
          <div class="editor-body">
            <div class="field-row">
              <label class="field" style="flex:1">
                <span class="field-label">景别</span>
                <select :value="selectedSb.shot_type || selectedSb.shotType || ''" class="input"
                  @change="updateField(selectedSb, 'shot_type', $event.target.value)">
                  <option value="">选择景别</option>
                  <option v-for="t in shotTypes" :key="t" :value="t">{{ t }}</option>
                </select>
              </label>
              <label class="field" style="flex:0 0 80px">
                <span class="field-label">时长</span>
                <input :value="selectedSb.duration || 10" class="input" type="number" min="1" max="60"
                  @blur="updateField(selectedSb, 'duration', Number($event.target.value))" />
              </label>
            </div>
            <label class="field">
              <span class="field-label">地点</span>
              <input :value="selectedSb.location || ''" class="input"
                @blur="updateField(selectedSb, 'location', $event.target.value)" placeholder="场景地点" />
            </label>
            <label class="field">
              <span class="field-label">画面描述</span>
              <textarea :value="selectedSb.description || ''" class="textarea" rows="3"
                @blur="updateField(selectedSb, 'description', $event.target.value)" placeholder="描述画面内容..." />
            </label>
            <label class="field">
              <span class="field-label">视频提示词</span>
              <textarea :value="selectedSb.video_prompt || selectedSb.videoPrompt || ''" class="textarea" rows="5"
                @blur="updateField(selectedSb, 'video_prompt', $event.target.value)" placeholder="0-3秒：<location>...</location>..." />
            </label>
            <label class="field">
              <span class="field-label">对白</span>
              <textarea :value="selectedSb.dialogue || ''" class="textarea" rows="2"
                @blur="updateField(selectedSb, 'dialogue', $event.target.value)" placeholder="角色名：台词内容" />
            </label>
          </div>
        </div>
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
  ArrowLeft, RefreshCw, Wand2, Scan, Users, MapPin, Mic, Check,
  Plus, Clapperboard, ImageIcon, Video, Layers, Film, Download, Loader2,
  FileText, Trash2,
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

// Wizard state
const scriptStep = ref(0)
const voiceOptions = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']

function updateCharVoice(charId, voiceId) {
  characterAPI.update(charId, { voice_style: voiceId })
  const c = chars.value.find(ch => ch.id === charId)
  if (c) { c.voice_style = voiceId; c.voiceStyle = voiceId }
}
const totalDuration = computed(() => sbs.value.reduce((s, sb) => s + (sb.duration || 10), 0))

const selectedSb = ref(null)
const shotTypes = ['远景', '全景', '中景', '近景', '特写']

function updateField(sb, field, value) {
  if (sb[field] === value) return
  sb[field] = value
  storyboardAPI.update(sb.id, { [field]: value })
}

async function deleteShot(sb) {
  if (!confirm('确定删除此镜头？')) return
  const idx = sbs.value.indexOf(sb)
  await storyboardAPI.del(sb.id)
  await refresh()
  // 选中下一个或上一个
  if (sbs.value.length) selectedSb.value = sbs.value[Math.min(idx, sbs.value.length - 1)]
  else selectedSb.value = null
}

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
  if (ep) {
    episode.value = ep; chars.value = drama.value.characters || []; scenes.value = drama.value.scenes || []
    sbs.value = await episodeAPI.storyboards(ep.id)
    if (sbs.value.length && !selectedSb.value) selectedSb.value = sbs.value[0]
    // 自动检测当前步骤
    if (chars.value.some(c => c.voice_style || c.voiceStyle)) scriptStep.value = 3
    else if (chars.value.length) scriptStep.value = 2
    else if (episode.value?.script_content || episode.value?.scriptContent) scriptStep.value = 1
    else if (episode.value?.content) scriptStep.value = 1
    else scriptStep.value = 0
  }
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

/* Wizard Steps */
.wizard-bar { display: flex; align-items: center; gap: 0; padding: 0 16px; border-bottom: 1px solid var(--border); background: var(--bg-1); flex-shrink: 0; }
.wizard-step { display: flex; align-items: center; gap: 6px; padding: 10px 16px; font-size: 12px; color: var(--text-3); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.15s; background: none; border-top: none; border-left: none; border-right: none; }
.wizard-step:hover { color: var(--text-1); }
.wizard-step.done { color: var(--success); cursor: pointer; }
.wizard-step.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }
.wizard-step.future { opacity: 0.4; cursor: default; }
.wizard-dot { width: 20px; height: 20px; border-radius: 50%; background: var(--bg-2); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; flex-shrink: 0; }
.wizard-step.done .wizard-dot { background: var(--success-bg); color: var(--success); }
.wizard-step.active .wizard-dot { background: var(--accent-bg); color: var(--accent); }
.wizard-label { white-space: nowrap; }

.wizard-body { flex: 1; overflow-y: auto; }
.wizard-content { max-width: 700px; margin: 0 auto; padding: 28px 24px; display: flex; flex-direction: column; gap: 16px; }
.wizard-title { font-size: 18px; font-weight: 700; }
.wizard-desc { font-size: 13px; color: var(--text-2); margin-bottom: 4px; }
.wizard-textarea { min-height: 300px; font-size: 13px; line-height: 1.8; }
.wizard-actions { display: flex; align-items: center; gap: 8px; padding-top: 8px; }
.wizard-action-center { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; }

/* Extract result */
.extract-result { display: flex; flex-direction: column; gap: 16px; }
.extract-section { }
.extract-head { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
.scene-chips { display: flex; flex-wrap: wrap; gap: 6px; }

/* Voice table */
.voice-table { margin-top: 8px; }
.voice-table td { vertical-align: middle; }

/* Bar */
.bar { display: flex; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid var(--border); background: var(--bg-1); flex-shrink: 0; }
.bar-title { font-size: 13px; font-weight: 600; }

/* Storyboard Layout */
.sb-layout { flex: 1; display: flex; min-height: 0; }
.sb-list-side { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 4px; border-right: 1px solid var(--border); }

.shot-card {
  padding: 10px 12px; border-radius: var(--radius); cursor: pointer;
  border-left: 3px solid transparent; transition: all 0.1s;
}
.shot-card:hover { background: var(--bg-hover); }
.shot-active { background: var(--accent-bg) !important; border-left-color: var(--accent); }
.shot-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.shot-num { font-size: 11px; color: var(--text-3); min-width: 24px; }
.shot-dur { font-size: 10px; color: var(--text-3); margin-left: auto; }
.shot-desc { font-size: 12px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.shot-dialogue { font-size: 11px; color: var(--text-2); margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.sb-editor-side { width: 380px; flex-shrink: 0; display: flex; flex-direction: column; overflow-y: auto; }
.editor-head { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-bottom: 1px solid var(--border); }
.editor-title { font-size: 14px; font-weight: 600; }
.editor-body { padding: 16px; display: flex; flex-direction: column; gap: 14px; }

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
