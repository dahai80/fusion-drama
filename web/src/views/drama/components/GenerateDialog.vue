<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="700px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <el-steps :active="currentStep" finish-status="success" align-center>
      <el-step title="生成大纲" />
      <el-step title="生成角色" />
      <el-step title="生成剧集" />
    </el-steps>

    <div class="step-content">
      <!-- 步骤1: 生成大纲 -->
      <div v-if="currentStep === 0" class="step-panel">
        <el-form :model="outlineForm" label-width="100px">
          <el-form-item label="创作主题" required>
            <el-input
              v-model="outlineForm.theme"
              type="textarea"
              :rows="4"
              placeholder="描述你想创作的短剧主题和故事概念&#10;例如：一个都市白领意外穿越到古代，凭借现代知识改变命运的故事"
              maxlength="500"
              show-word-limit
            />
          </el-form-item>

          <el-form-item label="类型偏好">
            <el-select v-model="outlineForm.genre" placeholder="选择类型" clearable>
              <el-option label="都市" value="都市" />
              <el-option label="古装" value="古装" />
              <el-option label="悬疑" value="悬疑" />
              <el-option label="爱情" value="爱情" />
              <el-option label="喜剧" value="喜剧" />
              <el-option label="奇幻" value="奇幻" />
              <el-option label="科幻" value="科幻" />
            </el-select>
          </el-form-item>

          <el-form-item label="风格要求">
            <el-input
              v-model="outlineForm.style"
              placeholder="例如：轻松幽默、紧张刺激、温馨治愈"
            />
          </el-form-item>

          <el-form-item label="剧集数量">
            <el-input-number v-model="outlineForm.length" :min="3" :max="20" />
            <span class="form-tip">建议3-10集</span>
          </el-form-item>

          <el-form-item label="创意度">
            <el-slider v-model="temperatureValue" :min="0" :max="100" :marks="temperatureMarks" />
            <div class="form-tip">数值越高，生成内容越有创意但可能不稳定</div>
          </el-form-item>
        </el-form>
      </div>

      <!-- 步骤2: 生成角色 -->
      <div v-if="currentStep === 1" class="step-panel">
        <div v-if="outlineResult" class="outline-preview">
          <h3>{{ outlineResult.title }}</h3>
          <p class="summary">{{ outlineResult.summary }}</p>
          <div class="tags">
            <el-tag v-for="tag in outlineResult.tags" :key="tag" size="small">{{ tag }}</el-tag>
          </div>
        </div>

        <el-divider />

        <el-form :model="charactersForm" label-width="100px">
          <el-form-item label="角色数量">
            <el-input-number v-model="charactersForm.count" :min="2" :max="10" />
            <span class="form-tip">建议3-5个主要角色</span>
          </el-form-item>

          <el-form-item label="创意度">
            <el-slider v-model="charactersTemperature" :min="0" :max="100" :marks="temperatureMarks" />
          </el-form-item>
        </el-form>
      </div>

      <!-- 步骤3: 生成剧集 -->
      <div v-if="currentStep === 2" class="step-panel">
        <div v-if="characters.length > 0" class="characters-preview">
          <h4>已创建角色：</h4>
          <div class="character-list">
            <el-tag
              v-for="char in characters"
              :key="char.id"
              size="large"
              effect="plain"
            >
              {{ char.name }} ({{ char.role }})
            </el-tag>
          </div>
        </div>

        <el-divider />

        <el-form :model="episodesForm" label-width="100px">
          <el-form-item label="剧集数量" required>
            <el-input-number v-model="episodesForm.episode_count" :min="1" :max="20" />
          </el-form-item>

          <el-form-item label="创意度">
            <el-slider v-model="episodesTemperature" :min="0" :max="100" :marks="temperatureMarks" />
          </el-form-item>
        </el-form>
      </div>

      <!-- 生成结果展示 -->
      <div v-if="currentStep === 3" class="step-panel">
        <el-result
          icon="success"
          title="生成完成！"
          sub-title="已成功生成剧本大纲、角色设定和分集剧本"
        >
          <template #extra>
            <el-button type="primary" @click="viewDrama">查看剧本详情</el-button>
            <el-button @click="handleClose">关闭</el-button>
          </template>
        </el-result>

        <el-descriptions title="生成内容" :column="2" border class="result-info">
          <el-descriptions-item label="剧本标题">
            {{ outlineResult?.title }}
          </el-descriptions-item>
          <el-descriptions-item label="类型">
            {{ outlineResult?.genre }}
          </el-descriptions-item>
          <el-descriptions-item label="角色数量">
            {{ characters.length }}
          </el-descriptions-item>
          <el-descriptions-item label="剧集数量">
            {{ episodes.length }}
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button v-if="currentStep > 0 && currentStep < 3" @click="prevStep">
          上一步
        </el-button>
        <el-button @click="handleClose">取消</el-button>
        <el-button
          v-if="currentStep < 3"
          type="primary"
          :loading="generating"
          @click="nextStep"
        >
          {{ currentStep === 2 ? '完成生成' : '下一步' }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { generationAPI } from '@/api/generation'
import type { OutlineResult } from '@/types/generation'
import type { Character, Episode } from '@/types/drama'

interface Props {
  dramaId: string
  modelValue: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: []
}>()

const router = useRouter()
const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const currentStep = ref(0)
const generating = ref(false)

const outlineForm = reactive({
  theme: '',
  genre: '',
  style: '',
  length: 5
})

const charactersForm = reactive({
  count: 5
})

const episodesForm = reactive({
  episode_count: 5
})

const temperatureValue = ref(70)
const charactersTemperature = ref(60)
const episodesTemperature = ref(60)

const temperatureMarks = {
  0: '保守',
  50: '平衡',
  100: '创新'
}

const outlineResult = ref<OutlineResult>()
const characters = ref<Character[]>([])
const episodes = ref<Episode[]>([])

const dialogTitle = computed(() => {
  const titles = ['AI 剧本生成 - 大纲', 'AI 剧本生成 - 角色', 'AI 剧本生成 - 剧集', '生成完成']
  return titles[currentStep.value]
})

watch(() => props.modelValue, (val) => {
  if (val) {
    resetForm()
  }
})

watch(() => outlineResult.value, (result) => {
  if (result) {
    episodesForm.episode_count = result.episodes?.length || 5
  }
})

const nextStep = async () => {
  if (currentStep.value === 0) {
    await generateOutline()
  } else if (currentStep.value === 1) {
    await generateCharacters()
  } else if (currentStep.value === 2) {
    await generateEpisodes()
  }
}

const prevStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

const generateOutline = async () => {
  if (!outlineForm.theme.trim()) {
    ElMessage.warning('请输入创作主题')
    return
  }

  generating.value = true
  try {
    const result = await generationAPI.generateOutline({
      drama_id: props.dramaId,
      theme: outlineForm.theme,
      genre: outlineForm.genre,
      style: outlineForm.style,
      length: outlineForm.length,
      temperature: temperatureValue.value / 100
    })
    
    outlineResult.value = result
    ElMessage.success('大纲生成成功！')
    currentStep.value++
  } catch (error: any) {
    ElMessage.error(error.message || '大纲生成失败')
  } finally {
    generating.value = false
  }
}

const generateCharacters = async () => {
  generating.value = true
  try {
    const outline = outlineResult.value
      ? JSON.stringify(outlineResult.value)
      : ''

    const result = await generationAPI.generateCharacters({
      drama_id: props.dramaId,
      outline,
      count: charactersForm.count,
      temperature: charactersTemperature.value / 100
    })
    
    characters.value = result
    ElMessage.success('角色生成成功！')
    currentStep.value++
  } catch (error: any) {
    ElMessage.error(error.message || '角色生成失败')
  } finally {
    generating.value = false
  }
}

const generateEpisodes = async () => {
  generating.value = true
  try {
    const outline = outlineResult.value
      ? JSON.stringify(outlineResult.value)
      : ''

    const result = await generationAPI.generateEpisodes({
      drama_id: props.dramaId,
      outline,
      episode_count: episodesForm.episode_count,
      temperature: episodesTemperature.value / 100
    })
    
    episodes.value = result
    ElMessage.success('剧集生成成功！')
    currentStep.value++
    emit('success')
  } catch (error: any) {
    ElMessage.error(error.message || '剧集生成失败')
  } finally {
    generating.value = false
  }
}

const viewDrama = () => {
  handleClose()
  router.push(`/dramas/${props.dramaId}`)
}

const handleClose = () => {
  visible.value = false
  setTimeout(() => {
    resetForm()
  }, 300)
}

const resetForm = () => {
  currentStep.value = 0
  outlineForm.theme = ''
  outlineForm.genre = ''
  outlineForm.style = ''
  outlineForm.length = 5
  charactersForm.count = 5
  episodesForm.episode_count = 5
  temperatureValue.value = 70
  charactersTemperature.value = 60
  episodesTemperature.value = 60
  outlineResult.value = undefined
  characters.value = []
  episodes.value = []
}
</script>

<style scoped>
.step-content {
  margin: 30px 0;
  min-height: 300px;
}

.step-panel {
  padding: 20px 0;
}

.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #999;
}

.outline-preview {
  padding: 20px;
  background: #f5f7fa;
  border-radius: 8px;
}

.outline-preview h3 {
  margin: 0 0 12px 0;
  font-size: 20px;
  color: #333;
}

.outline-preview .summary {
  margin: 0 0 12px 0;
  line-height: 1.6;
  color: #666;
}

.outline-preview .tags {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.characters-preview {
  padding: 20px;
  background: #f5f7fa;
  border-radius: 8px;
}

.characters-preview h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  color: #333;
}

.character-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.result-info {
  margin-top: 20px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
