<template>
  <div class="composition-workbench">
    <!-- 顶栏 -->
    <div class="workbench-header">
      <button class="back-btn" @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
        <span>{{ t('editor.backToEditor') }}</span>
      </button>
      <span class="workbench-title">{{ t('editor.compositionWorkbench') }}</span>
      <span v-if="drama && episode" class="workbench-subtitle">
        {{ drama.title }} - {{ t('editor.episode', { number: episode.episode_number }) }}
      </span>
      <div class="header-spacer" />
    </div>

    <!-- 主体区域 -->
    <div class="workbench-body" v-loading="loading">
      <!-- 时间线编辑器主区域 -->
      <div class="timeline-area">
        <VideoTimelineEditor
          v-if="episodeId && !loading"
          :scenes="scenes"
          :episode-id="String(episodeId)"
          :drama-id="String(dramaId)"
          :assets="videoAssets"
          @merge-completed="handleMergeCompleted"
          @asset-deleted="loadVideoAssets"
        />
        <div v-else-if="loading" class="loading-placeholder">
          <el-icon class="loading-icon" :size="32"><Loading /></el-icon>
          <span>{{ t('common.loading') }}</span>
        </div>
      </div>

      <!-- 右侧合成记录侧栏 -->
      <div class="composition-sidebar">
        <div class="sidebar-header">
          <span class="sidebar-title">{{ t('editor.compositionHistory') }}</span>
          <el-button
            size="small"
            :icon="Refresh"
            circle
            @click="loadVideoMerges"
            :loading="loadingMerges"
          />
        </div>
        <div class="sidebar-content">
          <CompositionTab
            :video-merges="videoMerges"
            :loading-merges="loadingMerges"
            @download="downloadVideo"
            @preview="previewMergedVideo"
            @delete="deleteMerge"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Refresh, Loading } from '@element-plus/icons-vue'
import { dramaAPI } from '@/api/drama'
import { assetAPI } from '@/api/asset'
import { useVideoMerge } from '@/composables/useVideoMerge'
import VideoTimelineEditor from '@/components/editor/VideoTimelineEditor.vue'
import CompositionTab from './CompositionTab.vue'
import type { Drama, Episode } from '@/types/drama'
import type { Asset } from '@/types/asset'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()

// 路由参数
const dramaId = Number(route.params.dramaId)
const episodeNumber = Number(route.params.episodeNumber)

// 核心数据
const loading = ref(false)
const drama = ref<Drama | null>(null)
const episode = ref<Episode | null>(null)
const scenes = ref<any[]>([])
const videoAssets = ref<Asset[]>([])
// episodeId 初始为 0（falsy），useVideoMerge 内部以 !episodeId.value 作为空值守卫
const episodeId = ref<string | number>(0)

// 合成操作
const {
  videoMerges,
  loadingMerges,
  loadVideoMerges,
  handleMergeCompleted: onMergeCompleted,
  downloadVideo,
  previewMergedVideo,
  deleteMerge,
  stopMergePolling,
} = useVideoMerge(episodeId)

// 加载视频素材
const loadVideoAssets = async () => {
  if (!episodeId.value) return
  try {
    const result = await assetAPI.listAssets({
      drama_id: dramaId.toString(),
      episode_id: Number(episodeId.value),
      type: 'video',
      page: 1,
      page_size: 100,
    })
    videoAssets.value = result.items || []
  } catch (error: any) {
    console.error('加载视频素材失败:', error)
  }
}

// 加载 episode 和 storyboards
const loadData = async () => {
  loading.value = true
  try {
    const dramaRes = await dramaAPI.get(dramaId.toString())
    drama.value = dramaRes

    const ep = dramaRes.episodes?.find(
      (e: Episode) => e.episode_number === episodeNumber,
    )
    if (!ep) {
      ElMessage.error(t('professionalEditor.episodeNotExist'))
      router.back()
      return
    }

    episode.value = ep
    episodeId.value = ep.id

    // getStoryboards 直接返回 Storyboard[]（见 api/drama.ts 类型声明）
    const storyboardsRes = await dramaAPI.getStoryboards(ep.id.toString())
    scenes.value = storyboardsRes || []

    await Promise.all([loadVideoMerges(), loadVideoAssets()])
  } catch (error: any) {
    ElMessage.error(t('professionalEditor.loadFailed') + ': ' + (error.message || ''))
  } finally {
    loading.value = false
  }
}

// 合成完成后刷新记录和素材
const handleMergeCompleted = async (_mergeId: number) => {
  await onMergeCompleted()
  await loadVideoAssets()
}

// 返回专业编辑器
const goBack = () => {
  router.replace({
    name: 'ProfessionalEditor',
    params: { dramaId, episodeNumber },
  })
}

onMounted(() => {
  loadData()
})

onBeforeUnmount(() => {
  stopMergePolling()
})
</script>

<style scoped>
.composition-workbench {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
  overflow: hidden;
}

/* 顶栏 */
.workbench-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  height: 48px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
  font-size: 13px;
  transition: all 150ms;
}
.back-btn:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
}

.workbench-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.workbench-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
}

.header-spacer {
  flex: 1;
}

/* 主体 */
.workbench-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* 时间线区域 */
.timeline-area {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.loading-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 14px;
}

.loading-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 右侧侧栏 */
.composition-sidebar {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-primary);
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  overflow: hidden;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
}
</style>
