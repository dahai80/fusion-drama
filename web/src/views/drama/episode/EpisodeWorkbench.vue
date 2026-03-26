<template>
  <div class="episode-workbench">
    <!-- Top bar -->
    <header class="wb-topbar">
      <div class="wb-topbar-left">
        <Button variant="ghost" size="sm" @click="goBack">
          <ArrowLeft :size="16" />
          返回
        </Button>
        <span class="wb-title">{{ resource.drama?.title }} - 第{{ episodeNumber }}集</span>
      </div>
      <div class="wb-topbar-center">
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': table.activeTab === 'script' }"
          @click="table.activeTab = 'script'"
        >
          <FileText :size="14" />
          剧本
        </button>
        <button
          class="tab-btn"
          :class="{ 'tab-btn--active': table.activeTab === 'storyboard' }"
          @click="table.activeTab = 'storyboard'"
        >
          <Clapperboard :size="14" />
          分镜
        </button>
      </div>
      <div class="wb-topbar-right">
        <div v-if="table.progress.total > 0" class="wb-progress">
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: progressPct + '%' }"></div>
          </div>
          <span class="progress-label">{{ table.progress.withImage }}/{{ table.progress.total }}</span>
        </div>
        <Button variant="outline" size="sm" @click="agentOpen = true">
          <Wand2 :size="14" />
          Agent
        </Button>
        <Button size="sm" @click="goToCompose" class="compose-btn">
          合成
          <ArrowRight :size="14" />
        </Button>
      </div>
    </header>

    <!-- Main content -->
    <div class="wb-body">
      <ResourcePanel
        :characters="resource.characters"
        :scenes="resource.scenes"
        :has-characters="resource.hasCharacters"
        :has-scenes="resource.hasScenes"
        @generate-character-image="handleGenerateCharacterImage"
        @batch-generate-characters="handleBatchGenerateCharacters"
        @generate-scene-image="handleGenerateSceneImage"
        @batch-generate-scenes="handleBatchGenerateScenes"
      />

      <div class="wb-main">
        <!-- Script Tab -->
        <ScriptTab
          v-if="table.activeTab === 'script'"
          :script-content="resource.scriptContent"
          :has-script="resource.hasScript"
          :has-characters="resource.hasCharacters"
          :has-scenes="resource.hasScenes"
          :character-count="resource.characters.length"
          :scene-count="resource.scenes.length"
          :running="agent.running"
          :running-type="agent.runningType"
          @save="resource.saveScript"
          @upload="handleUploadScript"
          @rewrite="handleRewriteScript"
          @extract="handleExtract"
        />

        <!-- Storyboard Tab -->
        <StoryboardTable
          v-else
          :storyboards="resource.storyboards"
          :characters="resource.characters"
          :scenes="resource.scenes"
          :selected-ids="table.selectedIds"
          :all-selected="table.allSelected"
          :has-selection="table.hasSelection"
          :progress="table.progress"
          :running="agent.running"
          :running-type="agent.runningType"
          @toggle-select="table.toggleSelect"
          @toggle-select-all="table.toggleSelectAll"
          @clear-selection="table.clearSelection"
          @save-field="handleSaveField"
          @generate-image="handleGenerateImage"
          @generate-video="handleGenerateVideo"
          @add="handleAddStoryboard"
          @batch-images="handleBatchImages"
          @batch-videos="handleBatchVideos"
          @generate-grid="handleGenerateGrid"
          @breakdown="handleBreakdown"
        />
      </div>
    </div>

    <!-- Hidden file input for script upload -->
    <input
      ref="scriptFileInput"
      type="file"
      accept=".txt,.md,.doc,.docx"
      style="display: none"
      @change="onScriptFileSelected"
    />

    <!-- Agent drawer -->
    <AgentDrawer
      v-model:open="agentOpen"
      :drama-id="dramaId"
      :episode-id="Number(resource.episode?.id || 0)"
      :initial-agent-type="agentInitType"
      @apply="handleAgentApply"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Wand2, Clapperboard, FileText } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { toast } from 'vue-sonner'
import ResourcePanel from './workbench/ResourcePanel.vue'
import ScriptTab from './workbench/ScriptTab.vue'
import StoryboardTable from './workbench/StoryboardTable.vue'
import { useEpisodeWorkbench } from '@/composables/useEpisodeWorkbench'
import { useAgentAction } from '@/composables/useAgentAction'
import AgentDrawer from '@/components/agent/AgentDrawer.vue'
import { dramaAPI } from '@/api/drama'
import { characterLibraryAPI } from '@/api/character-library'
import { generatePanelFrames } from '@/api/frame'
import type { AgentType } from '@/types/agent'

const router = useRouter()
const wb = useEpisodeWorkbench()
const { dramaId, episodeNumber } = wb
const resource = reactive(wb.resource)
const table = reactive(wb.table)
const imageGen = reactive(wb.imageGen)
const videoGen = reactive(wb.videoGen)

const agentOpen = ref(false)
const agentInitType = ref<AgentType | undefined>(undefined)

// 流水线操作
const agent = useAgentAction()
const episodeDbId = computed(() => Number(resource.episode?.id || 0))

const progressPct = computed(() => {
  const p = table.progress
  return p.total > 0 ? Math.round((p.withImage / p.total) * 100) : 0
})

const goBack = () => router.push(`/drama/${dramaId}`)
const goToCompose = () => router.push(`/drama/${dramaId}/episode/${episodeNumber}/compose`)

// --- Script Tab handlers ---
const scriptFileInput = ref<HTMLInputElement | null>(null)

const handleUploadScript = () => {
  scriptFileInput.value?.click()
}

const onScriptFileSelected = async (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    if (text.trim()) {
      await resource.saveScript(text)
      toast.success(`已导入 ${file.name}`)
    }
  } catch {
    toast.error('读取文件失败')
  }
  if (scriptFileInput.value) scriptFileInput.value.value = ''
}

// 流水线操作：一键执行，自动刷新数据
const handleRewriteScript = () => {
  agent.execute('script_rewriter', dramaId, episodeDbId.value,
    '请将剧本改写为格式化剧本',
    () => resource.loadData(),
  )
}

const handleExtract = () => {
  agent.execute('extractor', dramaId, episodeDbId.value,
    '请提取角色和场景信息',
    () => resource.loadData(),
  )
}

const handleBreakdown = () => {
  agent.execute('storyboard_breaker', dramaId, episodeDbId.value,
    '请拆解分镜并生成视频提示词',
    () => {
      resource.loadData()
      table.activeTab = 'storyboard'
    },
  )
}

const handleAddStoryboard = async () => {
  const ep = resource.episode
  if (!ep) return
  try {
    const nextNum = resource.storyboards.length + 1
    await dramaAPI.createStoryboard({
      episode_id: Number(ep.id),
      storyboard_number: nextNum,
      title: `镜头 ${nextNum}`,
      duration: 10,
    })
    await resource.loadData()
    toast.success('已添加镜头')
  } catch {
    toast.error('添加镜头失败')
  }
}

const handleSaveField = async (id: string, field: string, value: any) => {
  try {
    await dramaAPI.updateStoryboard(id, { [field]: value })
  } catch {
    toast.error('保存失败')
  }
}

// --- Image generation ---
const handleGenerateImage = (id: string) => {
  // Select the storyboard first so composable picks it up
  table.selectedIds = new Set([id])
  const sb = resource.storyboards.find((s: any) => s.id === id)
  const charIds = sb?.character_ids || []
  const chars = resource.characters.filter((c: any) => charIds.includes(c.id))
  imageGen.generateFrameImage(chars)
}

const handleGenerateCharacterImage = async (id: number) => {
  try {
    await characterLibraryAPI.generateCharacterImage(String(id))
    toast.success('角色形象生成已开始')
  } catch {
    toast.error('生成失败')
  }
}

const handleBatchGenerateCharacters = async () => {
  const ids = resource.characters
    .filter((c: any) => c.image_generation_status !== 'completed' && c.image_generation_status !== 'generating')
    .map((c: any) => String(c.id))
  if (ids.length === 0) {
    toast.info('没有需要生成的角色')
    return
  }
  try {
    await characterLibraryAPI.batchGenerateCharacterImages(ids)
    toast.success(`已开始生成 ${ids.length} 个角色形象`)
  } catch {
    toast.error('批量生成失败')
  }
}

const handleGenerateSceneImage = (id: number) => {
  dramaAPI.generateSceneImage({ scene_id: id }).catch(() => toast.error('生成失败'))
}

const handleBatchGenerateScenes = () => {
  const ep = resource.episode
  if (!ep) return
  dramaAPI.batchGenerateBackgrounds(String(ep.id)).catch(() => toast.error('批量生成失败'))
}

// --- Video generation ---
const handleGenerateVideo = (id: string) => {
  table.selectedIds = new Set([id])
  videoGen.generateVideo()
}

// --- Batch operations ---
const handleBatchImages = () => {
  const selected = table.selectedStoryboards
  if (selected.length === 0) {
    // No selection: generate for all pending
    toast.info('请先选择要生成图片的镜头')
    return
  }
  for (const sb of selected) {
    handleGenerateImage(sb.id)
  }
}

const handleBatchVideos = () => {
  const selected = table.selectedStoryboards
  if (selected.length === 0) {
    toast.info('请先选择要生成视频的镜头')
    return
  }
  for (const sb of selected) {
    handleGenerateVideo(sb.id)
  }
}

const handleGenerateGrid = async () => {
  const selected = table.selectedStoryboards
  if (selected.length === 0) {
    toast.info('请先选择要生成宫格图的镜头')
    return
  }
  try {
    // Generate panel frames for each selected storyboard
    const promises = selected.map((sb: any) =>
      generatePanelFrames(Number(sb.id), Math.min(selected.length, 9))
    )
    await Promise.all(promises)
    toast.success(`已开始为 ${selected.length} 个镜头生成宫格图`)
  } catch {
    toast.error('宫格图生成失败')
  }
}

// --- Agent result apply ---
const handleAgentApply = async (_data: { type: AgentType; content: string }) => {
  // Agent tools auto-save to DB, just reload data
  await resource.loadData()
  toast.success('Agent 操作完成，数据已刷新')
}
</script>

<style scoped>
.episode-workbench {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-primary);
}

.wb-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-primary);
  background: var(--bg-card);
  gap: 12px;
}

.wb-topbar-left,
.wb-topbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wb-topbar-center {
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 2px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 14px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn--active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
}

.wb-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.wb-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.wb-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wb-progress {
  display: flex;
  align-items: center;
  gap: 6px;
}

.progress-track {
  width: 80px;
  height: 4px;
  background: var(--border-primary);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent, #e8a243), var(--glass-accent-to, #f0c060));
  border-radius: 2px;
  transition: width 400ms ease;
}

.progress-label {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
}

.compose-btn {
  background: linear-gradient(135deg, var(--accent, #e8a243), var(--glass-accent-to, #f0c060));
  color: var(--glass-text-on-accent, #1a1614);
  font-weight: 600;
  border: none;
}
</style>
