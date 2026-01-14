<template>
  <div class="drama-management">
    <div class="page-header">
      <div class="header-left">
        <el-button :icon="ArrowLeft" @click="router.back()">{{ $t('common.back') }}</el-button>
        <div class="drama-info">
          <h1>{{ drama?.title }}</h1>
        </div>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="management-tabs">
      <!-- 项目概览 -->
      <el-tab-pane :label="$t('drama.management.overview')" name="overview">
        <el-row :gutter="20">
          <el-col :span="8">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <el-icon :size="24" color="#409eff"><Document /></el-icon>
                  <span>{{ $t('drama.management.episodeStats') }}</span>
                </div>
              </template>
              <div class="stat-content">
                <div class="stat-number">{{ episodesCount }}</div>
                <div class="stat-label">{{ $t('drama.management.episodesCreated') }}</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <el-icon :size="24" color="#67c23a"><User /></el-icon>
                  <span>{{ $t('drama.management.characterStats') }}</span>
                </div>
              </template>
              <div class="stat-content">
                <div class="stat-number">{{ charactersCount }}</div>
                <div class="stat-label">{{ $t('drama.management.charactersCreated') }}</div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card shadow="hover">
              <template #header>
                <div class="card-header">
                  <el-icon :size="24" color="#e6a23c"><Picture /></el-icon>
                  <span>{{ $t('drama.management.sceneStats') }}</span>
                </div>
              </template>
              <div class="stat-content">
                <div class="stat-number">{{ scenesCount }}</div>
                <div class="stat-label">{{ $t('drama.management.sceneLibraryCount') }}</div>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <!-- 引导卡片：无章节时显示 -->
        <el-alert
          v-if="episodesCount === 0"
:title="$t('drama.management.startFirstEpisode')"
          type="info"
          :closable="false"
          style="margin-top: 20px;"
        >
          <template #default>
            <p style="margin: 8px 0;">{{ $t('drama.management.noEpisodesYet') }}</p>
            <el-button type="primary" :icon="Plus" @click="createNewEpisode" style="margin-top: 8px;">
              {{ $t('drama.management.createFirstEpisode') }}
            </el-button>
          </template>
        </el-alert>

        <el-card shadow="never" style="margin-top: 20px;">
          <template #header>
            <h3>{{ $t('drama.management.projectInfo') }}</h3>
          </template>
          <el-descriptions :column="2" border>
            <el-descriptions-item :label="$t('drama.management.projectName')">{{ drama?.title }}</el-descriptions-item>
            <el-descriptions-item :label="$t('common.createdAt')">{{ formatDate(drama?.created_at) }}</el-descriptions-item>
            <el-descriptions-item :label="$t('drama.management.projectDesc')" :span="2">
              {{ drama?.description || $t('drama.management.noDescription') }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-tab-pane>

      <!-- 章节管理 -->
      <el-tab-pane :label="$t('drama.management.episodes')" name="episodes">
        <div class="tab-header">
          <h2>{{ $t('drama.management.episodeList') }}</h2>
          <el-button type="primary" :icon="Plus" @click="createNewEpisode">{{ $t('drama.management.createNewEpisode') }}</el-button>
        </div>

        <!-- 空状态引导 -->
        <el-empty
          v-if="episodesCount === 0"
:description="$t('drama.management.noEpisodes')"
          style="margin-top: 40px;"
        >
          <template #image>
            <el-icon :size="80" color="#409eff"><Document /></el-icon>
          </template>
          <el-button type="primary" :icon="Plus" @click="createNewEpisode">
            {{ $t('drama.management.createFirstEpisode') }}
          </el-button>
        </el-empty>

        <el-table v-else :data="sortedEpisodes" border stripe style="margin-top: 16px;">
          <el-table-column type="index" :label="$t('storyboard.table.number')" width="80" />
          <el-table-column prop="title" :label="$t('drama.management.episodeList')" min-width="200" />
          <el-table-column :label="$t('common.status')" width="120">
            <template #default="{ row }">
              <el-tag :type="getEpisodeStatusType(row)">{{ getEpisodeStatusText(row) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="Shots" width="100">
            <template #default="{ row }">
              {{ row.shots?.length || 0 }}
            </template>
          </el-table-column>
          <el-table-column :label="$t('common.createdAt')" width="180">
            <template #default="{ row }">
              {{ formatDate(row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column :label="$t('storyboard.table.operations')" width="220" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" @click="enterEpisodeWorkflow(row)">
                {{ $t('drama.management.goToEdit') }}
              </el-button>
              <el-button size="small" type="danger" @click="deleteEpisode(row)">
                {{ $t('common.delete') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 角色管理 -->
      <el-tab-pane :label="$t('drama.management.characters')" name="characters">
        <div class="tab-header">
          <h2>{{ $t('drama.management.characterList') }}</h2>
          <el-button type="primary" :icon="Plus" @click="openAddCharacterDialog">{{ $t('character.add') }}</el-button>
        </div>

        <el-row :gutter="16" style="margin-top: 16px;">
          <el-col :span="6" v-for="character in drama?.characters" :key="character.id">
            <el-card shadow="hover" class="character-card">
              <div class="character-preview">
                <img v-if="character.image_url" :src="fixImageUrl(character.image_url)" :alt="character.name" />
                <el-avatar v-else :size="120">{{ character.name[0] }}</el-avatar>
              </div>

              <div class="character-info">
                <h4>{{ character.name }}</h4>
                <el-tag :type="character.role === 'main' ? 'danger' : 'info'" size="small">
                  {{ character.role === 'main' ? 'Main' : character.role === 'supporting' ? 'Supporting' : 'Minor' }}
                </el-tag>
                <p class="desc">{{ character.appearance || character.description }}</p>
              </div>

              <div class="character-actions">
                <el-button size="small" @click="editCharacter(character)">{{ $t('common.edit') }}</el-button>
                <el-button size="small" type="danger" @click="deleteCharacter(character)">{{ $t('common.delete') }}</el-button>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <el-empty v-if="!drama?.characters || drama.characters.length === 0" :description="$t('drama.management.noCharacters')" />
      </el-tab-pane>

      <!-- 场景库管理 -->
      <el-tab-pane :label="$t('drama.management.sceneList')" name="scenes">
        <div class="tab-header">
          <h2>{{ $t('drama.management.sceneList') }}</h2>
          <el-button type="primary" :icon="Plus" @click="openAddSceneDialog">{{ $t('common.add') }}</el-button>
        </div>

        <el-row :gutter="16" style="margin-top: 16px;">
          <el-col :span="6" v-for="scene in scenes" :key="scene.id">
            <el-card shadow="hover" class="scene-card">
              <div class="scene-preview">
                <img v-if="scene.image_url" :src="fixImageUrl(scene.image_url)" :alt="scene.name" />
                <div v-else class="scene-placeholder">
                  <el-icon :size="48"><Picture /></el-icon>
                </div>
              </div>

              <div class="scene-info">
                <h4>{{ scene.name }}</h4>
                <p class="desc">{{ scene.description }}</p>
              </div>

              <div class="scene-actions">
                <el-button size="small" @click="editScene(scene)">{{ $t('common.edit') }}</el-button>
                <el-button size="small" type="danger" @click="deleteScene(scene)">{{ $t('common.delete') }}</el-button>
              </div>
            </el-card>
          </el-col>
        </el-row>

        <el-empty v-if="scenes.length === 0" :description="$t('drama.management.noScenes')" />
      </el-tab-pane>
    </el-tabs>

    <!-- 添加角色对话框 -->
    <el-dialog v-model="addCharacterDialogVisible" :title="$t('character.add')" width="600px">
      <el-form :model="newCharacter" label-width="100px">
        <el-form-item :label="$t('character.name')">
          <el-input v-model="newCharacter.name" :placeholder="$t('character.name')" />
        </el-form-item>
        <el-form-item :label="$t('character.role')">
          <el-select v-model="newCharacter.role" :placeholder="$t('common.pleaseSelect')">
            <el-option label="Main" value="main" />
            <el-option label="Supporting" value="supporting" />
            <el-option label="Minor" value="minor" />
          </el-select>
        </el-form-item>
        <el-form-item :label="$t('character.appearance')"> 
          <el-input v-model="newCharacter.appearance" type="textarea" :rows="3" :placeholder="$t('character.appearance')" />
        </el-form-item>
        <el-form-item :label="$t('character.personality')">
          <el-input v-model="newCharacter.personality" type="textarea" :rows="3" :placeholder="$t('character.personality')" />
        </el-form-item>
        <el-form-item :label="$t('character.description')">
          <el-input v-model="newCharacter.description" type="textarea" :rows="3" :placeholder="$t('common.description')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addCharacterDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="addCharacter">{{ $t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 添加场景对话框 -->
    <el-dialog v-model="addSceneDialogVisible" :title="$t('common.add')" width="600px">
      <el-form :model="newScene" label-width="100px">
        <el-form-item :label="$t('common.name')">
          <el-input v-model="newScene.name" :placeholder="$t('common.name')" />
        </el-form-item>
        <el-form-item :label="$t('common.description')">
          <el-input v-model="newScene.description" type="textarea" :rows="4" :placeholder="$t('common.description')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addSceneDialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="addScene">{{ $t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Document, User, Picture, Plus } from '@element-plus/icons-vue'
import { dramaAPI } from '@/api/drama'
import type { Drama } from '@/types/drama'

const router = useRouter()
const route = useRoute()

const drama = ref<Drama>()
const activeTab = ref(route.query.tab as string || 'overview')
const scenes = ref<any[]>([])

const addCharacterDialogVisible = ref(false)
const addSceneDialogVisible = ref(false)

const newCharacter = ref({
  name: '',
  role: 'supporting',
  appearance: '',
  personality: '',
  description: ''
})

const newScene = ref({
  name: '',
  description: ''
})

const episodesCount = computed(() => drama.value?.episodes?.length || 0)
const charactersCount = computed(() => drama.value?.characters?.length || 0)
const scenesCount = computed(() => scenes.value.length)

const sortedEpisodes = computed(() => {
  if (!drama.value?.episodes) return []
  return [...drama.value.episodes].sort((a, b) => a.episode_number - b.episode_number)
})

const loadDramaData = async () => {
  try {
    const data = await dramaAPI.get(route.params.id as string)
    drama.value = data
    loadScenes()
  } catch (error: any) {
    ElMessage.error(error.message || '加载项目数据失败')
  }
}

const loadScenes = async () => {
  // 场景数据已经在drama中加载了（后端Preload了Scenes）
  if (drama.value?.scenes) {
    scenes.value = drama.value.scenes
  } else {
    scenes.value = []
  }
}

const getStatusType = (status?: string) => {
  const map: Record<string, any> = {
    draft: 'info',
    in_progress: 'warning',
    completed: 'success'
  }
  return map[status || 'draft'] || 'info'
}

const getStatusText = (status?: string) => {
  const map: Record<string, string> = {
    draft: '草稿',
    in_progress: '制作中',
    completed: '已完成'
  }
  return map[status || 'draft'] || '草稿'
}

const getEpisodeStatusType = (episode: any) => {
  if (episode.shots && episode.shots.length > 0) return 'success'
  if (episode.script_content) return 'warning'
  return 'info'
}

const getEpisodeStatusText = (episode: any) => {
  if (episode.shots && episode.shots.length > 0) return '已拆分'
  if (episode.script_content) return '已创建'
  return '草稿'
}

const formatDate = (date?: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}

const fixImageUrl = (url: string) => {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return `${import.meta.env.VITE_API_BASE_URL}${url}`
}

const createNewEpisode = () => {
  const nextEpisodeNumber = episodesCount.value + 1
  router.push({
    name: 'EpisodeWorkflowNew',
    params: {
      id: route.params.id,
      episodeNumber: nextEpisodeNumber
    }
  })
}

const enterEpisodeWorkflow = (episode: any) => {
  router.push({
    name: 'EpisodeWorkflowNew',
    params: {
      id: route.params.id,
      episodeNumber: episode.episode_number
    }
  })
}

const deleteEpisode = async (episode: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除第${episode.episode_number}章吗？此操作将同时删除该章节的所有相关数据（角色、场景、分镜等）。`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    // 过滤掉要删除的章节
    const existingEpisodes = drama.value?.episodes || []
    const updatedEpisodes = existingEpisodes
      .filter(ep => ep.episode_number !== episode.episode_number)
      .map(ep => ({
        episode_number: ep.episode_number,
        title: ep.title,
        script_content: ep.script_content,
        description: ep.description,
        duration: ep.duration,
        status: ep.status
      }))

    // 保存更新后的章节列表
    await dramaAPI.saveEpisodes(drama.value!.id, updatedEpisodes)
    
    ElMessage.success(`第${episode.episode_number}章删除成功`)
    await loadDramaData()
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error.message || '删除失败')
    }
  }
}

const openAddCharacterDialog = () => {
  newCharacter.value = {
    name: '',
    role: 'supporting',
    appearance: '',
    personality: '',
    description: ''
  }
  addCharacterDialogVisible.value = true
}

const addCharacter = async () => {
  if (!newCharacter.value.name.trim()) {
    ElMessage.warning('请输入角色名称')
    return
  }

  try {
    const existingCharacters = drama.value?.characters || []
    const allCharacters = [
      ...existingCharacters.map(c => ({
        name: c.name,
        role: c.role,
        appearance: c.appearance,
        personality: c.personality,
        description: c.description
      })),
      newCharacter.value
    ]

    await dramaAPI.saveCharacters(drama.value!.id, allCharacters)
    ElMessage.success('角色添加成功')
    addCharacterDialogVisible.value = false
    await loadDramaData()
  } catch (error: any) {
    ElMessage.error(error.message || '添加失败')
  }
}

const editCharacter = (character: any) => {
  ElMessage.info('编辑功能开发中')
}

const deleteCharacter = async (character: any) => {
  if (character.library_id) {
    ElMessage.warning('该角色来自角色库，请前往角色库进行删除')
    return
  }

  await ElMessageBox.confirm(
    `确定要删除角色"${character.name}"吗？`,
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  )

  try {
    const updatedCharacters = drama.value!.characters!.filter(c => c.id !== character.id)
    await dramaAPI.saveCharacters(drama.value!.id, updatedCharacters.map(c => ({
      name: c.name,
      role: c.role,
      appearance: c.appearance,
      personality: c.personality,
      description: c.description
    })))
    ElMessage.success('删除成功')
    await loadDramaData()
  } catch (error: any) {
    ElMessage.error(error.message || '删除失败')
  }
}

const openAddSceneDialog = () => {
  newScene.value = {
    name: '',
    description: ''
  }
  addSceneDialogVisible.value = true
}

const addScene = async () => {
  if (!newScene.value.name.trim()) {
    ElMessage.warning('请输入场景名称')
    return
  }

  try {
    // TODO: 调用场景库API
    ElMessage.success('场景添加成功')
    addSceneDialogVisible.value = false
    await loadScenes()
  } catch (error: any) {
    ElMessage.error(error.message || '添加失败')
  }
}

const editScene = (scene: any) => {
  ElMessage.info('编辑功能开发中')
}

const deleteScene = async (scene: any) => {
  await ElMessageBox.confirm(
    `确定要删除场景"${scene.name}"吗？`,
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  )

  try {
    // TODO: 调用删除API
    ElMessage.success('删除成功')
    await loadScenes()
  } catch (error: any) {
    ElMessage.error(error.message || '删除失败')
  }
}

onMounted(() => {
  loadDramaData()
  loadScenes()

  // 如果有query参数指定tab，切换到对应tab
  if (route.query.tab) {
    activeTab.value = route.query.tab as string
  }
})
</script>

<style scoped>
.drama-management {
  padding: 20px;
  background: #f5f7fa;
  min-height: 100vh;
}

.page-header {
  background: white;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.drama-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.drama-info h1 {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
}

.management-tabs {
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.tab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.tab-header h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.stat-content {
  text-align: center;
  padding: 20px 0;
}

.stat-number {
  font-size: 36px;
  font-weight: 700;
  color: #409eff;
  margin-bottom: 8px;
}

.stat-label {
  font-size: 14px;
  color: #909399;
}

.character-card, .scene-card {
  margin-bottom: 16px;
}

.character-preview, .scene-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 180px;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8eaf0 100%);
  margin: -20px -20px 12px -20px;
  overflow: hidden;
}

.character-preview img, .scene-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.scene-placeholder {
  color: #c0c4cc;
}

.character-info, .scene-info {
  text-align: center;
  margin-bottom: 12px;
}

.character-info h4, .scene-info h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
}

.desc {
  font-size: 13px;
  color: #606266;
  margin: 8px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.character-actions, .scene-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}
</style>
