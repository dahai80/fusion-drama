<template>
  <div class="character-extraction-container">
    <el-page-header @back="goBack" title="返回项目">
      <template #content>
        <h2>角色管理</h2>
      </template>
    </el-page-header>

    <el-card shadow="never" class="main-card">
      <template #header>
        <div class="card-header">
          <h3>角色列表</h3>
          <div class="header-actions">
            <el-button @click="addCharacter">
              <el-icon><Plus /></el-icon>
              添加角色
            </el-button>
            <el-button type="primary" @click="saveCharacters" :loading="saving">
              保存修改
            </el-button>
          </div>
        </div>
      </template>

      <el-empty v-if="characters.length === 0" description="角色已在剧本生成阶段创建，您可以在此查看和编辑" />

      <el-row :gutter="20" v-else>
        <el-col :span="8" v-for="character in characters" :key="character.id">
          <el-card shadow="hover" class="character-card">
            <template #header>
              <div class="character-header">
                <el-avatar :size="60">{{ character.name[0] }}</el-avatar>
                <div class="character-info">
                  <h4>{{ character.name }}</h4>
                  <el-tag size="small">{{ character.role }}</el-tag>
                </div>
              </div>
            </template>

            <div class="character-details">
              <p><strong>性格：</strong>{{ character.personality }}</p>
              <p><strong>外貌：</strong>{{ character.appearance }}</p>
              <p><strong>背景：</strong>{{ character.background }}</p>
            </div>

            <template #footer>
              <el-button-group style="width: 100%">
                <el-button size="small" @click="editCharacter(character)">编辑</el-button>
                <el-button size="small" type="primary" @click="generateCharacterImage(character)">
                  生成形象
                </el-button>
              </el-button-group>
            </template>
          </el-card>
        </el-col>
      </el-row>

      <div class="actions" v-if="characters.length > 0">
        <el-button type="success" size="large" @click="goToNextStep">
          下一步：生成角色图片
        </el-button>
      </div>
    </el-card>

    <!-- 编辑对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑角色" width="600px">
      <el-form :model="editForm" label-width="80px">
        <el-form-item label="姓名">
          <el-input v-model="editForm.name" />
        </el-form-item>
        <el-form-item label="角色">
          <el-input v-model="editForm.role" />
        </el-form-item>
        <el-form-item label="性格">
          <el-input v-model="editForm.personality" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="外貌">
          <el-input v-model="editForm.appearance" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveCharacter">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { MagicStick } from '@element-plus/icons-vue'
import { generationAPI } from '@/api/generation'
import type { Character } from '@/types/drama'

const route = useRoute()
const router = useRouter()
const dramaId = route.params.id as string

const characters = ref<Character[]>([])
const saving = ref(false)
const editDialogVisible = ref(false)
const editForm = reactive({
  name: '',
  role: '',
  personality: '',
  appearance: '',
  background: ''
})

const goBack = () => {
  router.push(`/dramas/${dramaId}`)
}

const addCharacter = () => {
  Object.assign(editForm, {
    name: '',
    role: '',
    personality: '',
    appearance: '',
    background: ''
  })
  editDialogVisible.value = true
}

const saveCharacters = async () => {
  saving.value = true
  try {
    // TODO: 调用保存角色API
    await new Promise(resolve => setTimeout(resolve, 1000))
    ElMessage.success('保存成功')
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

const editCharacter = (character: Character) => {
  Object.assign(editForm, character)
  editDialogVisible.value = true
}

const saveCharacter = () => {
  // TODO: 保存角色信息
  editDialogVisible.value = false
  ElMessage.success('保存成功')
}

const generateCharacterImage = (character: Character) => {
  router.push(`/dramas/${dramaId}/images/characters?character=${character.id}`)
}

const goToNextStep = () => {
  router.push(`/dramas/${dramaId}/images/characters`)
}

onMounted(() => {
  // TODO: 加载已有角色
})
</script>

<style scoped>
.character-extraction-container {
  padding: 24px;
  max-width: 1400px;
  margin: 0 auto;
}

.main-card {
  margin-top: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-header h3 {
  margin: 0;
}

.character-card {
  margin-bottom: 20px;
}

.character-header {
  display: flex;
  gap: 16px;
  align-items: center;
}

.character-info h4 {
  margin: 0 0 8px 0;
}

.character-details p {
  margin: 8px 0;
  font-size: 14px;
  color: #606266;
}

.actions {
  margin-top: 30px;
  text-align: center;
}
</style>
