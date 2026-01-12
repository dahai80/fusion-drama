<template>
  <el-dialog
    v-model="visible"
    title="AI 图片生成"
    width="700px"
    :close-on-click-modal="false"
    @close="handleClose"
  >
    <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
      <el-form-item label="选择剧本" prop="drama_id">
        <el-select v-model="form.drama_id" placeholder="选择剧本" @change="onDramaChange">
          <el-option
            v-for="drama in dramas"
            :key="drama.id"
            :label="drama.title"
            :value="drama.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="选择场景" prop="scene_id">
        <el-select
          v-model="form.scene_id"
          placeholder="选择场景（可选）"
          clearable
          @change="onSceneChange"
        >
          <el-option
            v-for="scene in scenes"
            :key="scene.id"
            :label="`场景${scene.storyboard_number}: ${scene.title}`"
            :value="scene.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="提示词" prop="prompt">
        <el-input
          v-model="form.prompt"
          type="textarea"
          :rows="6"
          placeholder="描述你想生成的图片&#10;例如：A beautiful landscape with mountains and rivers at sunset, cinematic lighting, highly detailed"
          maxlength="2000"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="反向提示词">
        <el-input
          v-model="form.negative_prompt"
          type="textarea"
          :rows="3"
          placeholder="描述不希望出现的元素（可选）&#10;例如：blurry, low quality, watermark"
          maxlength="1000"
          show-word-limit
        />
      </el-form-item>

      <el-form-item label="AI 服务">
        <el-select v-model="form.provider" placeholder="选择服务">
          <el-option label="OpenAI/DALL-E" value="openai" />
          <el-option label="Stable Diffusion" value="stable_diffusion" />
        </el-select>
      </el-form-item>

      <el-form-item label="图片尺寸">
        <el-select v-model="form.size" placeholder="选择尺寸">
          <el-option label="1024x1024 (正方形)" value="1024x1024" />
          <el-option label="1792x1024 (横向)" value="1792x1024" />
          <el-option label="1024x1792 (纵向)" value="1024x1792" />
        </el-select>
      </el-form-item>

      <el-form-item label="图片质量" v-if="form.provider === 'openai'">
        <el-radio-group v-model="form.quality">
          <el-radio label="standard">标准</el-radio>
          <el-radio label="hd">高清</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="风格" v-if="form.provider === 'openai'">
        <el-radio-group v-model="form.style">
          <el-radio label="vivid">鲜艳</el-radio>
          <el-radio label="natural">自然</el-radio>
        </el-radio-group>
      </el-form-item>

      <el-collapse v-if="form.provider === 'stable_diffusion'">
        <el-collapse-item title="高级设置" name="advanced">
          <el-form-item label="采样步数">
            <el-slider v-model="form.steps" :min="10" :max="50" :marks="stepsMarks" />
          </el-form-item>

          <el-form-item label="提示词相关性">
            <el-slider v-model="form.cfg_scale" :min="1" :max="20" :step="0.5" :marks="cfgMarks" />
          </el-form-item>

          <el-form-item label="随机种子">
            <el-input-number v-model="form.seed" :min="-1" placeholder="留空随机" />
            <span class="form-tip">设置相同种子可复现图片</span>
          </el-form-item>
        </el-collapse-item>
      </el-collapse>
    </el-form>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" :loading="generating" @click="handleGenerate">
        生成图片
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { imageAPI } from '@/api/image'
import { dramaAPI } from '@/api/drama'
import type { Drama, Scene } from '@/types/drama'
import type { GenerateImageRequest } from '@/types/image'

interface Props {
  modelValue: boolean
  dramaId?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  success: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const formRef = ref<FormInstance>()
const generating = ref(false)
const dramas = ref<Drama[]>([])
const scenes = ref<Scene[]>([])

const form = reactive<GenerateImageRequest>({
  drama_id: props.dramaId || '',
  scene_id: undefined,
  prompt: '',
  negative_prompt: '',
  provider: 'openai',
  size: '1024x1024',
  quality: 'standard',
  style: 'vivid',
  steps: 30,
  cfg_scale: 7.5,
  seed: undefined
})

const rules: FormRules = {
  drama_id: [
    { required: true, message: '请选择剧本', trigger: 'change' }
  ],
  prompt: [
    { required: true, message: '请输入提示词', trigger: 'blur' },
    { min: 5, message: '提示词至少5个字符', trigger: 'blur' }
  ]
}

const stepsMarks = {
  10: '10',
  20: '20',
  30: '30',
  40: '40',
  50: '50'
}

const cfgMarks = {
  1: '弱',
  7.5: '适中',
  15: '强',
  20: '很强'
}

watch(() => props.modelValue, (val) => {
  if (val) {
    loadDramas()
    if (props.dramaId) {
      form.drama_id = props.dramaId
      loadScenes(props.dramaId)
    }
  }
})

const loadDramas = async () => {
  try {
    const result = await dramaAPI.list({ page: 1, page_size: 100 })
    dramas.value = result.items || []
  } catch (error: any) {
    console.error('Failed to load dramas:', error)
  }
}

const loadScenes = async (dramaId: string) => {
  try {
    const drama = await dramaAPI.get(dramaId)
    const allScenes: Scene[] = []
    
    if (drama.episodes) {
      for (const episode of drama.episodes) {
        if (episode.scenes) {
          allScenes.push(...episode.scenes)
        }
      }
    }
    
    scenes.value = allScenes
  } catch (error: any) {
    console.error('Failed to load scenes:', error)
  }
}

const onDramaChange = (dramaId: string) => {
  form.scene_id = undefined
  scenes.value = []
  if (dramaId) {
    loadScenes(dramaId)
  }
}

const onSceneChange = (sceneId: number | undefined) => {
  if (!sceneId) return
  
  const scene = scenes.value.find(s => s.id === sceneId)
  if (scene && scene.prompt) {
    form.prompt = scene.prompt
  }
}

const handleGenerate = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid) => {
    if (!valid) return

    generating.value = true
    try {
      const params: GenerateImageRequest = {
        drama_id: form.drama_id,
        prompt: form.prompt,
        provider: form.provider
      }

      if (form.scene_id) {
        params.scene_id = form.scene_id
      }

      if (form.negative_prompt) {
        params.negative_prompt = form.negative_prompt
      }

      if (form.size) {
        params.size = form.size
      }

      if (form.provider === 'openai') {
        if (form.quality) params.quality = form.quality
        if (form.style) params.style = form.style
      }

      if (form.provider === 'stable_diffusion') {
        if (form.steps) params.steps = form.steps
        if (form.cfg_scale) params.cfg_scale = form.cfg_scale
        if (form.seed && form.seed > 0) params.seed = form.seed
      }

      await imageAPI.generateImage(params)
      
      ElMessage.success('图片生成任务已提交，请稍后查看结果')
      emit('success')
      handleClose()
    } catch (error: any) {
      ElMessage.error(error.message || '生成失败')
    } finally {
      generating.value = false
    }
  })
}

const handleClose = () => {
  visible.value = false
  formRef.value?.resetFields()
}
</script>

<style scoped>
.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #999;
}
</style>
