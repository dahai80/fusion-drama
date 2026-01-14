<template>
  <div class="script-generation-container">
    <el-page-header @back="goBack" :title="$t('script.backToProject')">
      <template #content>
        <h2>{{ $t('script.title') }}</h2>
      </template>
    </el-page-header>

    <el-card shadow="never" class="main-card">
      <el-tabs v-model="activeTab" @tab-change="handleTabChange" class="custom-tabs">
        <!-- AI 生成剧本 -->
        <el-tab-pane :label="$t('script.aiGenerate')" name="ai">
          <!-- 步骤进度条 -->
          <div class="steps-wrapper">
            <el-steps :active="aiCurrentStep" finish-status="success" align-center process-status="process">
              <el-step :title="$t('script.steps.outline')" description="" />
              <el-step :title="$t('script.steps.characters')" description="" />
              <el-step :title="$t('script.steps.episodes')" description="" />
            </el-steps>
          </div>

          <div class="step-content">
            <!-- 步骤 0: 生成大纲 -->
            <div v-show="aiCurrentStep === 0" class="step-panel">
              <el-form :model="outlineForm" label-width="100px">
                <el-form-item :label="$t('script.form.theme')" required>
                  <div class="theme-input-wrapper">
                    <el-input
                      v-model="outlineForm.theme"
                      type="textarea"
                      :rows="4"
                      :placeholder="$t('script.form.themePlaceholder')"
                      maxlength="500"
                      show-word-limit
                    />
                    <el-button 
                      type="primary" 
                      :icon="MagicStick"
                      @click="generateRandomTheme"
                      class="random-btn"
                    >
                      {{ $t('script.form.randomGenerate') }}
                    </el-button>
                  </div>
                </el-form-item>

                <el-form-item :label="$t('script.form.genre')">
                  <el-select v-model="outlineForm.genre" :placeholder="$t('script.form.genrePlaceholder')" clearable>
                    <el-option :label="$t('genres.urban')" value="都市" />
                    <el-option :label="$t('genres.costume')" value="古装" />
                    <el-option :label="$t('genres.mystery')" value="悬疑" />
                    <el-option :label="$t('genres.romance')" value="爱情" />
                    <el-option :label="$t('genres.comedy')" value="喜剧" />
                  </el-select>
                </el-form-item>

                <el-form-item :label="$t('script.form.style')">
                  <el-input
                    v-model="outlineForm.style"
                    :placeholder="$t('script.form.stylePlaceholder')"
                  />
                </el-form-item>

                <el-form-item :label="$t('script.form.episodeCount')">
                  <el-input-number v-model="outlineForm.length" :min="3" :max="20" />
                </el-form-item>
              </el-form>

              <div class="stage-notice">
                <p>{{ $t('script.notice') }}</p>
              </div>

              <el-alert
                v-if="generationError && !outlineResult"
                type="error"
                :closable="false"
                show-icon
                class="error-alert"
              >
                <template #title>{{ $t('script.generateFailed') }}</template>
                <div>{{ generationError }}</div>
                <el-button type="primary" size="small" @click="retryGeneration" style="margin-top: 12px;">
                  <el-icon><RefreshRight /></el-icon>
                  {{ $t('script.regenerate') }}
                </el-button>
              </el-alert>

              <div v-if="outlineResult" class="result-preview">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                  <h4 style="margin: 0;">{{ $t('script.outlinePreview') }}</h4>
                  <el-button 
                    type="warning" 
                    size="small" 
                    @click="regenerateOutline"
                    :loading="generating"
                  >
                    <el-icon><RefreshRight /></el-icon>
                    {{ $t('script.regenerateOutline') }}
                  </el-button>
                </div>
                <el-form label-width="80px" class="outline-edit-form">
                  <el-form-item :label="$t('script.form.title')">
                    <el-input v-model="outlineResult.title" :placeholder="$t('script.form.titlePlaceholder')" />
                  </el-form-item>
                  <el-form-item :label="$t('script.form.summary')">
                    <el-input 
                      v-model="outlineResult.summary" 
                      type="textarea" 
                      :rows="8"
                      :placeholder="$t('script.form.summaryPlaceholder')"
                    />
                  </el-form-item>
                  <el-form-item :label="$t('script.form.genre')">
                    <el-input v-model="outlineResult.genre" :placeholder="$t('script.form.genreExample')" />
                  </el-form-item>
                  <el-form-item :label="$t('script.form.tags')">
                    <el-tag
                      v-for="(tag, index) in outlineResult.tags"
                      :key="index"
                      closable
                      @close="removeTag(index)"
                      class="tag-item"
                    >
                      {{ tag }}
                    </el-tag>
                    <el-input
                      v-if="tagInputVisible"
                      ref="tagInput"
                      v-model="newTag"
                      size="small"
                      class="tag-input"
                      @keyup.enter="addTag"
                      @blur="addTag"
                    />
                    <el-button v-else size="small" @click="showTagInput">+ {{ $t('script.form.newTag') }}</el-button>
                  </el-form-item>
                </el-form>
              </div>
            </div>

            <!-- 步骤 1: 生成角色 -->
            <div v-show="aiCurrentStep === 1" class="step-panel">
              <div v-if="charactersResult.length === 0" class="stage-notice">
                <p>{{ $t('scriptGenerationPage.autoGenerateCharacters') }}</p>
                <el-alert 
                  title="提示" 
                  type="info" 
                  :closable="false"
                  style="margin-top: 16px;"
                >
                  {{ $t('scriptGenerationPage.charactersCreatedInOutline') }}
                </el-alert>
              </div>

              <div v-if="charactersResult.length > 0" class="result-preview">
                <h4>{{ $t('scriptGenerationPage.characterListEditable') }}</h4>
                <el-button type="primary" size="small" @click="addCharacter" class="add-btn">{{ $t('scriptGenerationPage.addCharacter') }}</el-button>
                <el-table :data="charactersResult" border max-height="400" class="editable-table">
                  <el-table-column prop="name" :label="$t('scriptGenerationPage.characterName')" width="120">
                    <template #default="{ row }">
                      <el-input v-model="row.name" size="small" />
                    </template>
                  </el-table-column>
                  <el-table-column prop="role" :label="$t('scriptGenerationPage.characterType')" width="120">
                    <template #default="{ row }">
                      <el-select v-model="row.role" size="small">
                        <el-option :label="$t('scriptGenerationPage.mainCharacter')" value="main" />
                        <el-option :label="$t('scriptGenerationPage.supportingCharacter')" value="supporting" />
                        <el-option :label="$t('scriptGenerationPage.minorCharacter')" value="minor" />
                      </el-select>
                    </template>
                  </el-table-column>
                  <el-table-column prop="description" :label="$t('scriptGenerationPage.characterDesc')">
                    <template #default="{ row }">
                      <el-input v-model="row.description" size="small" type="textarea" :rows="2" />
                    </template>
                  </el-table-column>
                  <el-table-column prop="appearance" :label="$t('scriptGenerationPage.appearanceFeatures')" width="200">
                    <template #default="{ row }">
                      <el-input v-model="row.appearance" size="small" type="textarea" :rows="2" />
                    </template>
                  </el-table-column>
                  <el-table-column :label="$t('scriptGenerationPage.operations')" width="80" fixed="right">
                    <template #default="{ $index }">
                      <el-button type="danger" size="small" text @click="deleteCharacter($index)">{{ $t('scriptGenerationPage.delete') }}</el-button>
                    </template>
                  </el-table-column>
                </el-table>
              </div>
            </div>

            <!-- 步骤 2: 生成剧集 -->
            <div v-show="aiCurrentStep === 2" class="step-panel">
              <div v-if="episodesResult.length === 0">
                <el-form :model="episodesForm" label-width="100px">
                  <el-form-item :label="$t('scriptGenerationPage.episodeCount')" required>
                    <el-input-number v-model="episodesForm.episode_count" :min="1" :max="10" />
                  </el-form-item>
                </el-form>

                <div class="stage-notice">
                  <p>{{ $t('scriptGenerationPage.generateFullScript') }}</p>
                  <el-alert 
                    v-if="outlineResult && outlineResult.episodes && outlineResult.episodes.length > 0"
                    title="提示" 
                    type="warning" 
                    :closable="false"
                    style="margin-top: 16px;"
                  >
                    {{ $t('scriptGenerationPage.outlineCreatedEpisodes', { count: outlineResult.episodes.length }) }}
                  </el-alert>
                </div>
              </div>

              <div v-if="episodesResult.length > 0" class="result-preview">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                  <h4>{{ $t('scriptGenerationPage.episodePreview', { count: episodesResult.length }) }}</h4>
                  <el-button size="small" @click="regenerateEpisodes">{{ $t('scriptGenerationPage.regenerate') }}</el-button>
                </div>
                <el-table :data="episodesResult" border max-height="400">
                  <el-table-column prop="episode_number" :label="$t('scriptGenerationPage.episodeNumber')" width="80" />
                  <el-table-column prop="title" :label="$t('scriptGenerationPage.title')" width="200" />
                  <el-table-column prop="summary" :label="$t('scriptGenerationPage.summary')" />
                  <el-table-column prop="duration" :label="$t('scriptGenerationPage.durationSeconds')" width="100" />
                </el-table>
              </div>
            </div>
          </div>
        </el-tab-pane>

        <!-- 方式2: 上传剧本 -->
        <el-tab-pane :label="$t('scriptGenerationPage.uploadScript')" name="upload">
          <!-- 上传流程步骤 -->
          <div class="steps-wrapper">
            <el-steps :active="uploadCurrentStep" finish-status="success" align-center process-status="process">
              <el-step :title="$t('scriptGenerationPage.uploadContent')" description="" />
              <el-step :title="$t('scriptGenerationPage.aiParse')" description="" />
              <el-step :title="$t('scriptGenerationPage.confirmSave')" description="" />
            </el-steps>
          </div>

          <div class="step-content">
            <!-- 步骤 0: 上传内容 -->
            <div v-show="uploadCurrentStep === 0" class="step-panel">
              <div class="stage-notice">
                <p>{{ $t('scriptGenerationPage.uploadNotice') }}</p>
              </div>

              <el-form :model="uploadForm" label-width="100px">
                <el-form-item :label="$t('scriptGenerationPage.uploadMethod')">
                  <div class="upload-options">
                    <el-upload
                      ref="uploadRef"
                      :auto-upload="false"
                      :on-change="handleFileChange"
                      :show-file-list="false"
                      accept=".txt,.md,.doc,.docx"
                      drag
                      class="script-uploader"
                    >
                      <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
                      <div class="el-upload__text">
                        {{ $t('scriptGenerationPage.dragFilesHere') }} <em>{{ $t('scriptGenerationPage.clickUpload') }}</em>
                      </div>
                      <div class="el-upload__tip">
                        {{ $t('scriptGenerationPage.supportedFormats') }}
                      </div>
                    </el-upload>
                  </div>
                </el-form-item>
                
                <el-form-item label="剧本内容" required>
                  <el-input
                    v-model="uploadForm.script_content"
                    type="textarea"
                    :rows="20"
                    placeholder="或直接粘贴您的剧本内容"
                    maxlength="50000"
                    show-word-limit
                  />
                </el-form-item>

                <el-form-item label="拆分选项">
                  <el-checkbox v-model="uploadForm.auto_split">自动拆分剧集</el-checkbox>
                  <div class="form-tip">
                    启用后将自动识别剧集分界点，否则作为单集处理
                  </div>
                </el-form-item>
              </el-form>
            </div>

            <!-- 步骤 1: AI解析 -->
            <div v-show="uploadCurrentStep === 1" class="step-panel">
              <div class="stage-notice">
                <p>正在使用AI解析剧本内容...</p>
              </div>
              <div class="loading-area" v-if="parsing">
                <el-icon class="is-loading" :size="40"><Loading /></el-icon>
                <p>解析中，请稍候...</p>
              </div>
            </div>

            <!-- 步骤 2: 确认保存 -->
            <div v-show="uploadCurrentStep === 2" class="step-panel">
              <div v-if="parseResult" class="parse-result">
                <el-alert
                  title="解析完成"
                  type="success"
                  :closable="false"
                  show-icon
                >
                  <template #default>
                    共识别 {{ parseResult.episodes.length }} 个剧集，
                    {{ totalCharacters }} 个角色
                  </template>
                </el-alert>

                <div class="summary-box" v-if="parseResult.summary">
                  <h4>剧本概要</h4>
                  <p>{{ parseResult.summary }}</p>
                </div>

                <div class="episodes-list" style="margin-top: 20px;">
                  <h4>剧集列表</h4>
                  <el-table :data="parseResult.episodes" border>
                    <el-table-column prop="episode_number" label="集数" width="80" />
                    <el-table-column prop="title" label="标题" width="200" />
                    <el-table-column prop="description" label="简介" show-overflow-tooltip />
                    <el-table-column prop="duration" label="时长(分钟)" width="120" />
                  </el-table>
                </div>

                <div v-if="parseResult.characters && parseResult.characters.length > 0" class="characters-list" style="margin-top: 20px;">
                  <h4>{{ $t('scriptGenerationPage.characterList') }}</h4>
                  <el-table :data="parseResult.characters" border max-height="300">
                    <el-table-column prop="name" :label="$t('scriptGenerationPage.characterName')" width="120" />
                    <el-table-column prop="role" :label="$t('scriptGenerationPage.position')" width="100" />
                    <el-table-column prop="description" :label="$t('scriptGenerationPage.appearanceDesc')" show-overflow-tooltip />
                    <el-table-column prop="personality" :label="$t('scriptGenerationPage.personality')" width="200" show-overflow-tooltip />
                  </el-table>
                </div>
              </div>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>

      <!-- 底部导航按钮 -->
      <div class="navigation-buttons">
        <el-button size="large" @click="handlePrevStep" :disabled="!canGoPrev">
          {{ $t('scriptGenerationPage.prevStep') }}
        </el-button>
        <el-button 
          size="large" 
          type="primary" 
          @click="handleNextStep" 
          :loading="isProcessing"
          :disabled="!canGoNext"
        >
          {{ getNextButtonText() }}
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Loading, RefreshRight, MagicStick, UploadFilled } from '@element-plus/icons-vue';
import { generationAPI } from '@/api/generation';
import { dramaAPI } from '@/api/drama';
import type { OutlineResult, ParseScriptResult } from '@/types/generation';

const route = useRoute();
const router = useRouter();
const { t: $t } = useI18n();
const dramaId = route.params.id as string;

// 从URL query参数恢复状态，如果没有则使用默认值
const activeTab = ref((route.query.tab as string) || 'ai');
const aiCurrentStep = ref(parseInt((route.query.aiStep as string) || '0'));
const uploadCurrentStep = ref(parseInt((route.query.uploadStep as string) || '0'));
const generating = ref(false);
const parsing = ref(false);
const saving = ref(false);
const generationError = ref('');
const isProcessing = computed(() => generating.value || parsing.value || saving.value);

// AI 生成表单
const outlineForm = reactive({
  theme: '',
  genre: '',
  style: '',
  length: 10
});

const episodesForm = reactive({
  episode_count: 10
});

const outlineResult = ref<OutlineResult>();
const charactersResult = ref<any[]>([]);
const episodesResult = ref<any[]>([]);

const tagInputVisible = ref(false);
const newTag = ref('');
const tagInput = ref();

// 上传表单
const uploadForm = reactive({
  script_content: '',
  auto_split: true
});

const parseResult = ref<ParseScriptResult>();
const activeEpisode = ref<number>();

const totalCharacters = computed(() => {
  if (!parseResult.value?.characters) return 0;
  return parseResult.value.characters.length;
});

const goBack = () => {
  router.push(`/dramas/${dramaId}`);
};

const handleTabChange = () => {
  // 切换标签页时重置步骤并更新URL
  aiCurrentStep.value = 0;
  uploadCurrentStep.value = 0;
  outlineResult.value = undefined;
  charactersResult.value = [];
  episodesResult.value = [];
  parseResult.value = undefined;
  
  // 更新URL保存当前标签页和步骤
  updateUrlState();
};

const canGoPrev = computed(() => {
  if (activeTab.value === 'ai') {
    return aiCurrentStep.value > 0;
  } else {
    return uploadCurrentStep.value > 0;
  }
});

const canGoNext = computed(() => {
  if (activeTab.value === 'ai') {
    if (aiCurrentStep.value === 0) return !!outlineForm.theme.trim();
    if (aiCurrentStep.value === 1) return true;
    if (aiCurrentStep.value === 2) return true;
  } else {
    if (uploadCurrentStep.value === 0) return !!uploadForm.script_content.trim();
    if (uploadCurrentStep.value === 1) return false;
    if (uploadCurrentStep.value === 2) return !!parseResult.value;
  }
  return false;
});
  
const getNextButtonText = () => {
  if (activeTab.value === 'ai') {
    if (aiCurrentStep.value === 0) {
      return outlineResult.value ? '下一步' : '生成大纲';
    }
    if (aiCurrentStep.value === 1) {
      return charactersResult.value.length === 0 ? '生成角色' : '下一步';
    }
    if (aiCurrentStep.value === 2) {
      return episodesResult.value.length === 0 ? '生成剧集' : '保存剧本';
    }
  } else {
    if (uploadCurrentStep.value === 0) return '解析剧本';
    if (uploadCurrentStep.value === 2) return '保存到项目';
  }
  return '下一步';
};

const handlePrevStep = async () => {
  await saveCurrentStep();
  if (activeTab.value === 'ai') {
    if (aiCurrentStep.value > 0) aiCurrentStep.value--;
  } else {
    if (uploadCurrentStep.value > 0) uploadCurrentStep.value--;
  }
  // 更新URL保存当前步骤
  updateUrlState();
};

const handleNextStep = async () => {
  if (activeTab.value === 'ai') {
    if (aiCurrentStep.value === 0) {
      if (!outlineResult.value) {
        await generateOutline();
      } else {
        await saveCurrentStep();
        aiCurrentStep.value++;
        updateUrlState();
      }
    } else if (aiCurrentStep.value === 1) {
      if (charactersResult.value.length === 0) {
        await generateCharacters();
      } else {
        await saveCurrentStep();
        aiCurrentStep.value++;
        updateUrlState();
      }
    } else if (aiCurrentStep.value === 2) {
      if (episodesResult.value.length === 0) {
        await generateEpisodes();
      } else {
        await saveScript();
      }
    }
  } else {
    if (uploadCurrentStep.value === 0) {
      await parseScriptAndNext();
    } else if (uploadCurrentStep.value === 2) {
      await saveUploadedScript();
    }
  }
};

const parseScriptAndNext = async () => {
  uploadCurrentStep.value = 1;
  updateUrlState();
  await parseScript();
  if (parseResult.value) {
    uploadCurrentStep.value = 2;
  } else {
    uploadCurrentStep.value = 0;
  }
  updateUrlState();
};

const generateOutline = async () => {
  if (!outlineForm.theme.trim()) {
    ElMessage.warning('请输入创作主题');
    return;
  }

  generationError.value = '';
  generating.value = true;
  
  try {
    const result = await generationAPI.generateOutline({
      drama_id: dramaId,
      theme: outlineForm.theme,
      genre: outlineForm.genre,
      style: outlineForm.style,
      length: outlineForm.length
    });
    
    outlineResult.value = {
      title: result.title,
      summary: result.summary,
      genre: result.genre,
      tags: result.tags || [],
      characters: [],
      episodes: [],
      key_scenes: result.key_scenes || []
    };
    
    ElMessage.success('大纲生成成功！接下来请继续生成角色');
    generationError.value = '';
  } catch (error: any) {
    const errorMsg = error.error?.message || error.message || '生成失败，请重试';
    generationError.value = errorMsg;
    
    if (errorMsg.includes('解析') || errorMsg.includes('INTERNAL_ERROR')) {
      ElMessage.error('AI生成出现问题，请稍后重试或调整创作主题');
    } else {
      ElMessage.error(errorMsg);
    }
  } finally {
    generating.value = false;
  }
};

const retryGeneration = () => {
  generationError.value = '';
  generateOutline();
};

const regenerateOutline = async () => {
  if (!confirm('重新生成将覆盖当前大纲内容，是否继续？')) {
    return;
  }
  await generateOutline();
};

const generateCharacters = async () => {
  if (!outlineResult.value) {
    ElMessage.warning('请先生成大纲');
    return;
  }

  if (charactersResult.value.length > 0) {
    ElMessage.info('角色已在大纲生成时创建，您可以直接编辑');
    return;
  }

  generating.value = true;
  try {
    charactersResult.value = await generationAPI.generateCharacters({
      drama_id: dramaId,
      outline: outlineResult.value.summary
    });
    ElMessage.success('角色生成成功');
  } catch (error: any) {
    ElMessage.error(error.message || '生成失败');
  } finally {
    generating.value = false;
  }
};

const getRoleType = (role: string) => {
  const types: Record<string, string> = {
    main: 'danger',
    supporting: 'warning',
    minor: 'info'
  };
  return types[role] || 'info';
};

const getRoleText = (role: string) => {
  const texts: Record<string, string> = {
    main: '主角',
    supporting: '配角',
    minor: '次要角色'
  };
  return texts[role] || role;
};

const generateEpisodes = async () => {
  generating.value = true;
  try {
    // 检查大纲中的分集规划数量
    const outlineEpisodesCount = outlineResult.value?.episodes?.length || 0;
    if (outlineEpisodesCount > 0 && outlineEpisodesCount !== episodesForm.episode_count) {
      ElMessage.warning(`大纲中规划了${outlineEpisodesCount}集，但您要求生成${episodesForm.episode_count}集。建议重新生成大纲或调整剧集数量一致。`);
      // 自动调整为大纲规划的集数
      episodesForm.episode_count = outlineEpisodesCount;
    }
    
    // 构建完整的大纲信息，包含每集的规划
    let outlineText = outlineResult.value?.summary || '';
    if (outlineResult.value?.episodes && outlineResult.value.episodes.length > 0) {
      outlineText += '\n\n分集规划：\n';
      outlineResult.value.episodes.forEach(ep => {
        outlineText += `第${ep.episode_number}集《${ep.title}》：${ep.summary}\n`;
      });
    }
    
    const result = await generationAPI.generateEpisodes({
      drama_id: dramaId,
      outline: outlineText,
      episode_count: episodesForm.episode_count
    });
    episodesResult.value = result;
    ElMessage.success(`成功生成 ${result.length} 集剧情`);
  } catch (error: any) {
    ElMessage.error(error.message || '生成失败');
  } finally {
    generating.value = false;
  }
};

const regenerateEpisodes = () => {
  episodesResult.value = [];
};

const saveScript = async () => {
  saving.value = true;
  try {
    await saveCurrentStep();
    await dramaAPI.saveProgress(dramaId, { current_step: 'script_completed' });
    ElMessage.success('剧本保存成功，即将返回项目工作流');
    setTimeout(() => {
      router.push(`/dramas/${dramaId}`);
    }, 1000);
  } catch (error: any) {
    ElMessage.error(error.message || '保存失败');
  } finally {
    saving.value = false;
  }
};

const parseScript = async () => {
  if (!uploadForm.script_content.trim()) {
    ElMessage.warning('请输入剧本内容');
    return;
  }

  parsing.value = true;
  try {
    parseResult.value = await generationAPI.parseScript({
      drama_id: dramaId,
      script_content: uploadForm.script_content,
      auto_split: uploadForm.auto_split
    });
    ElMessage.success('剧本解析成功');
  } catch (error: any) {
    ElMessage.error(error.message || '解析失败');
  } finally {
    parsing.value = false;
  }
};

const saveUploadedScript = async () => {
  if (!parseResult.value || !parseResult.value.episodes || parseResult.value.episodes.length === 0) {
    ElMessage.warning('没有可保存的剧集数据');
    return;
  }

  saving.value = true;
  try {
    // 1. 保存角色数据（如果有）
    if (parseResult.value.characters && parseResult.value.characters.length > 0) {
      const charactersToSave = parseResult.value.characters.map(char => ({
        name: char.name,
        role: char.role || '配角',
        description: char.description,
        personality: char.personality
      }));
      await dramaAPI.saveCharacters(dramaId, charactersToSave);
    }

    // 2. 转换解析结果为保存格式（不包含场景，场景由后续步骤生成）
    const episodesToSave = parseResult.value.episodes.map(ep => ({
      episode_number: ep.episode_number,
      title: ep.title,
      script_content: ep.script_content || uploadForm.script_content, // 使用分集剧本内容
      description: ep.description || parseResult.value?.summary || '', // 使用分集描述
      duration: ep.duration || 0, // 使用分集时长
      status: 'draft'
    }));

    // 3. 保存剧集和场景数据
    await dramaAPI.saveEpisodes(dramaId, episodesToSave);
    
    // 4. 更新进度
    await dramaAPI.saveProgress(dramaId, { current_step: 'episodes' });
    
    ElMessage.success(`剧本保存成功：${parseResult.value.episodes.length}集，${parseResult.value.characters?.length || 0}个角色`);
    // 跳转回DramaWorkflow页面，步骤1（角色图片生成）
    router.push(`/dramas/${dramaId}?step=1`);
  } catch (error: any) {
    ElMessage.error(error.response?.data?.message || '保存失败');
  } finally {
    saving.value = false;
  }
};

const saveCurrentStep = async () => {
  try {
    if (activeTab.value === 'ai') {
      if (aiCurrentStep.value === 0 && outlineResult.value) {
        await dramaAPI.saveOutline(dramaId, {
          title: outlineResult.value.title,
          summary: outlineResult.value.summary,
          genre: outlineResult.value.genre,
          tags: outlineResult.value.tags
        });
        await dramaAPI.saveProgress(dramaId, { current_step: 'outline' });
      } else if (aiCurrentStep.value === 1 && charactersResult.value.length > 0) {
        await dramaAPI.saveCharacters(dramaId, charactersResult.value);
        await dramaAPI.saveProgress(dramaId, { current_step: 'characters' });
      } else if (aiCurrentStep.value === 2 && episodesResult.value.length > 0) {
        // AI生成的剧集已在GenerateEpisodes接口中保存，不需要重复保存
        // 只更新进度状态
        await dramaAPI.saveProgress(dramaId, { current_step: 'episodes' });
      }
    }
  } catch (error: any) {
    // 静默处理
  }
};

const removeTag = (index: number) => {
  if (outlineResult.value) {
    outlineResult.value.tags.splice(index, 1);
  }
};

const showTagInput = () => {
  tagInputVisible.value = true;
  nextTick(() => {
    tagInput.value?.focus();
  });
};

const addTag = () => {
  if (newTag.value.trim() && outlineResult.value) {
    if (!outlineResult.value.tags) {
      outlineResult.value.tags = [];
    }
    outlineResult.value.tags.push(newTag.value.trim());
    newTag.value = '';
  }
  tagInputVisible.value = false;
};

const addCharacter = () => {
  charactersResult.value.push({
    name: '',
    role: 'supporting',
    description: '',
    appearance: ''
  });
};

const deleteCharacter = (index: number) => {
  charactersResult.value.splice(index, 1);
};

// 随机生成主题
const randomThemes = [
  '一个落魄青年意外获得读心术，在都市中展开一段奇妙旅程',
  '穿越到古代的现代医生，用现代医学知识改变历史',
  '失忆的天才钢琴家，在寻找记忆的过程中发现惊天阴谋',
  '平凡女孩意外成为偶像替身，开启双重人生',
  '神秘的时光咖啡馆，每一杯咖啡都能让人回到过去',
  '小镇侦探破解连环悬案，揭开小镇隐藏多年的秘密',
  '破产富二代从零开始创业，在商战中浴火重生',
  '青梅竹马分离十年后重逢，展开一段温馨治愈的爱情故事',
  '网络作家笔下的角色活了过来，虚拟与现实交织',
  '失散多年的双胞胎互换身份，各自体验对方的人生'
];

const generateRandomTheme = () => {
  const randomIndex = Math.floor(Math.random() * randomThemes.length);
  outlineForm.theme = randomThemes[randomIndex];
  ElMessage.success('已生成随机主题，您可以在此基础上修改');
};

// 处理文件上传
const uploadRef = ref();
const handleFileChange = (file: any) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target?.result as string;
    uploadForm.script_content = content;
    ElMessage.success('文件读取成功');
  };
  reader.onerror = () => {
    ElMessage.error('文件读取失败');
  };
  reader.readAsText(file.raw);
};

// 更新URL状态，保存当前标签页和步骤
const updateUrlState = () => {
  router.replace({
    query: {
      ...route.query,
      tab: activeTab.value,
      aiStep: aiCurrentStep.value.toString(),
      uploadStep: uploadCurrentStep.value.toString()
    }
  });
};

const loadDramaData = async () => {
  try {
    const drama = await dramaAPI.get(dramaId);
    
    // 加载大纲数据
    const hasOutline = !!(drama.description || drama.title);
    if (hasOutline) {
      // 回填表单供用户查看或修改
      outlineForm.theme = drama.description || '';
      outlineForm.genre = drama.genre || '';
      
      // 设置大纲结果，让用户可以查看已保存的大纲
      outlineResult.value = {
        title: drama.title || '',
        summary: drama.description || '',
        genre: drama.genre || '',
        tags: drama.tags || [],
        characters: [],
        episodes: [],
        key_scenes: []
      };
    }
    
    // 加载角色数据
    const hasCharacters = !!(drama.characters && drama.characters.length > 0);
    if (hasCharacters && drama.characters) {
      charactersResult.value = drama.characters.map(char => ({
        name: char.name,
        role: char.role || 'supporting',
        description: char.description || '',
        personality: char.personality || '',
        appearance: char.appearance || ''
      }));
    }
    
    // 加载剧集数据
    const hasEpisodes = !!(drama.episodes && drama.episodes.length > 0);
    if (hasEpisodes && drama.episodes) {
      episodesResult.value = drama.episodes.map(ep => ({
        episode_number: ep.episode_number,
        title: ep.title,
        summary: ep.description || '',
        duration: ep.duration || 180
      }));
      episodesForm.episode_count = drama.episodes?.length || 0;
    }
    
    // 智能定位到当前步骤（仅在URL中没有明确指定步骤时）
    // 如果URL中已经有步骤参数，说明用户之前在某个步骤，保持该步骤
    const hasStepInUrl = route.query.aiStep !== undefined;
    
    if (!hasStepInUrl) {
      // 如果没有大纲，停留在步骤0
      // 如果有大纲但没有角色，停留在步骤0（可以查看大纲或继续生成角色）
      // 如果有角色但没有剧集，停留在步骤1
      // 如果都有，停留在步骤2
      if (!hasOutline) {
        aiCurrentStep.value = 0;
      } else if (!hasCharacters) {
        aiCurrentStep.value = 0; // 有大纲但没角色，停在大纲步骤让用户看到已有内容
      } else if (!hasEpisodes) {
        aiCurrentStep.value = 1; // 有大纲和角色但没剧集，停在角色步骤
      } else {
        aiCurrentStep.value = 2; // 都有，停在剧集步骤
      }
      
      // 更新URL保存步骤状态
      updateUrlState();
    }
    
    // 如果URL中没有指定标签页，默认使用'ai'
    if (!route.query.tab) {
      activeTab.value = 'ai';
      updateUrlState();
    }
  } catch (error: any) {
    // 静默处理
  }
};

onMounted(() => {
  loadDramaData();
});
</script>

<style scoped>
.script-generation-container {
  min-height: 100vh;
  background: #f5f7fa;
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.main-card {
  margin-top: 20px;
  background: #ffffff;
  border-radius: 12px;
  border: 1px solid #e4e7ed;
}

.custom-tabs {
  margin-bottom: 24px;
}

.steps-wrapper {
  padding: 40px 20px 20px;
  margin-bottom: 30px;
}

.step-content {
  min-height: 450px;
  padding: 30px 0;
}

.step-panel {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.theme-input-wrapper {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.theme-input-wrapper .el-textarea {
  flex: 1;
}

.random-btn {
  flex-shrink: 0;
  height: 40px;
}

.upload-options {
  width: 100%;
  margin-bottom: 20px;
}

.script-uploader {
  width: 100%;
}

:deep(.script-uploader .el-upload) {
  width: 100%;
}

:deep(.script-uploader .el-upload-dragger) {
  width: 100%;
  padding: 40px;
  background: #fafafa;
  border: 2px dashed #c0c4cc;
  border-radius: 8px;
  transition: all 0.3s ease;
}

:deep(.script-uploader .el-upload-dragger:hover) {
  border-color: #409eff;
  background: #ecf5ff;
}

:deep(.el-icon--upload) {
  font-size: 48px;
  color: #409eff;
  margin-bottom: 16px;
}

:deep(.el-upload__text) {
  font-size: 14px;
  color: #606266;
}

:deep(.el-upload__text em) {
  color: #409eff;
  font-style: normal;
}

:deep(.el-upload__tip) {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
}

.stage-notice {
  text-align: center;
  padding: 20px;
  margin-bottom: 30px;
  background: #ecf5ff;
  border: 1px solid #c6e2ff;
  border-radius: 8px;
  color: #409eff;
}

.stage-notice p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
}

.result-preview {
  margin-top: 30px;
  padding: 24px;
  background: #fafafa;
  border-radius: 12px;
  border: 1px solid #e4e7ed;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.result-preview h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  color: #303133;
}

.preview-content {
  background: white;
  padding: 16px;
  border-radius: 6px;
}

.preview-content p {
  margin: 12px 0;
  line-height: 1.8;
}

.loading-area {
  text-align: center;
  padding: 60px 20px;
}

.loading-area p {
  margin-top: 16px;
  color: #909399;
  font-size: 14px;
}

.parse-result {
  margin-top: 20px;
}

.summary-box {
  margin: 20px 0;
  padding: 20px;
  background: white;
  border-radius: 8px;
  border: 1px solid #e4e7ed;
}

.summary-box h4 {
  margin: 0 0 12px 0;
  font-size: 15px;
  color: #303133;
}

.episodes-collapse {
  margin: 20px 0;
}

.form-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #909399;
  line-height: 1.5;
}

.navigation-buttons {
  display: flex;
  justify-content: center;
  gap: 20px;
  padding: 30px 0 20px;
  border-top: 1px solid #e4e7ed;
  margin-top: 30px;
}

.navigation-buttons .el-button {
  min-width: 120px;
}

/* 优化表单布局 */
:deep(.el-form-item) {
  margin-bottom: 24px;
}

:deep(.el-form-item__label) {
  font-weight: 500;
  color: #606266;
}

/* Steps 样式优化 */
:deep(.el-steps) {
  padding: 0 50px;
}

:deep(.el-step__title) {
  font-size: 15px;
  font-weight: 500;
}

:deep(.el-step__description) {
  font-size: 12px;
}

/* 大纲编辑表单样式 */
.outline-edit-form {
  background: white;
  padding: 20px;
  border-radius: 6px;
}

/* 标签编辑样式 */
.tag-item {
  margin-right: 8px;
  margin-bottom: 8px;
}

.tag-input {
  width: 120px;
  margin-right: 8px;
  vertical-align: middle;
}

/* 可编辑表格样式 */
.editable-table {
  margin-top: 16px;
}

.add-btn {
  margin-bottom: 12px;
}

:deep(.editable-table .el-input__inner),
:deep(.editable-table .el-textarea__inner) {
  border: 1px dashed #dcdfe6;
}

:deep(.editable-table .el-input__inner:focus),
:deep(.editable-table .el-textarea__inner:focus) {
  border-color: #409eff;
  border-style: solid;
}

/* 错误提示样式 */
.error-alert {
  margin: 20px 0;
  animation: shake 0.5s;
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
  20%, 40%, 60%, 80% { transform: translateX(5px); }
}
</style>
