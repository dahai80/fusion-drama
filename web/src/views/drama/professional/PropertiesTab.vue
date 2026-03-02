<template>
  <div class="properties-tab">
    <!-- 场景 -->
    <div class="field-group">
      <div class="field-label">
        {{ $t('storyboard.scene') }}
        <el-button size="small" text @click="$emit('show-scene-selector')">{{ $t('storyboard.selectScene') }}</el-button>
      </div>
      <div class="scene-preview-v2" v-if="hasImage(currentStoryboard.background)" @click="$emit('show-scene-image')">
        <img :src="getImageUrl(currentStoryboard.background)" alt="场景" />
        <div class="scene-info-overlay">
          {{ currentStoryboard.background?.location }} · {{ currentStoryboard.background?.time }}
        </div>
      </div>
      <div class="scene-preview-empty-v2" v-else>
        <el-icon :size="28" color="#ccc"><Picture /></el-icon>
        <span>{{ currentStoryboard.background ? $t('editor.sceneGenerating') : $t('editor.noBackground') }}</span>
      </div>
    </div>

    <!-- 登场角色 -->
    <div class="field-group">
      <div class="field-label">
        {{ $t('editor.cast') }}
        <el-button size="small" text :icon="Plus" @click="$emit('show-character-selector')">{{ $t('editor.addCharacter') }}</el-button>
      </div>
      <div class="cast-row">
        <div v-for="char in currentStoryboardCharacters" :key="char.id" class="cast-chip">
          <div class="cast-chip-avatar" @click="$emit('show-character-image', char)">
            <img v-if="hasImage(char)" :src="getImageUrl(char)" :alt="char.name" />
            <span v-else>{{ char.name?.[0] || '?' }}</span>
          </div>
          <span class="cast-chip-name">{{ char.name }}</span>
          <el-icon class="cast-chip-remove" @click.stop="$emit('toggle-character', char.id)"><Close /></el-icon>
        </div>
        <div v-if="!currentStoryboardCharacters.length" class="cast-empty-hint">{{ $t('editor.noCharacters') }}</div>
      </div>
    </div>

    <!-- 道具 -->
    <div class="field-group">
      <div class="field-label">
        {{ $t('editor.props') }}
        <el-button size="small" text :icon="Plus" @click="$emit('show-prop-selector')">{{ $t('editor.addProp') }}</el-button>
      </div>
      <div class="cast-row">
        <div v-for="prop in currentStoryboardProps" :key="prop.id" class="cast-chip">
          <div class="cast-chip-avatar">
            <img v-if="hasImage(prop)" :src="getImageUrl(prop)" :alt="prop.name" />
            <el-icon v-else><Box /></el-icon>
          </div>
          <span class="cast-chip-name">{{ prop.name }}</span>
          <el-icon class="cast-chip-remove" @click.stop="$emit('toggle-prop', prop.id)"><Close /></el-icon>
        </div>
        <div v-if="!currentStoryboardProps?.length" class="cast-empty-hint">{{ $t('editor.noProps') }}</div>
      </div>
    </div>

    <!-- 视效设置 -->
    <div class="field-group">
      <div class="field-label">{{ $t('editor.visualSettings') }}</div>
      <div class="settings-col-v2">
        <div class="setting-row">
          <label>{{ $t('editor.shotType') }}</label>
          <el-select v-model="currentStoryboard.shot_type" clearable size="small" @change="$emit('save-field', 'shot_type')">
            <el-option label="大远景" value="大远景" /><el-option label="远景" value="远景" />
            <el-option label="全景" value="全景" /><el-option label="中全景" value="中全景" />
            <el-option label="中景" value="中景" /><el-option label="中近景" value="中近景" />
            <el-option label="近景" value="近景" /><el-option label="特写" value="特写" />
            <el-option label="大特写" value="大特写" />
          </el-select>
        </div>
        <div class="setting-row">
          <label>{{ $t('editor.movement') }}</label>
          <el-select v-model="currentStoryboard.movement" clearable size="small" @change="$emit('save-field', 'movement')">
            <el-option label="固定镜头" value="固定镜头" /><el-option label="推镜" value="推镜" />
            <el-option label="拉镜" value="拉镜" /><el-option label="摇镜" value="摇镜" />
            <el-option label="移镜" value="移镜" /><el-option label="跟镜" value="跟镜" />
            <el-option label="升降镜头" value="升降镜头" /><el-option label="环绕" value="环绕" />
            <el-option label="甩镜" value="甩镜" /><el-option label="变焦" value="变焦" />
            <el-option label="手持晃动" value="手持晃动" /><el-option label="航拍" value="航拍" />
          </el-select>
        </div>
        <div class="setting-row">
          <label>{{ $t('editor.angle') }}</label>
          <el-select v-model="currentStoryboard.angle" clearable size="small" @change="$emit('save-field', 'angle')">
            <el-option label="平视" value="平视" /><el-option label="俯视" value="俯视" />
            <el-option label="仰视" value="仰视" /><el-option label="大俯视（鸟瞰）" value="大俯视（鸟瞰）" />
            <el-option label="大仰视" value="大仰视" /><el-option label="正侧面" value="正侧面" />
            <el-option label="斜侧面" value="斜侧面" /><el-option label="背面" value="背面" />
            <el-option label="倾斜（荷兰角）" value="倾斜（荷兰角）" /><el-option label="主观视角" value="主观视角" />
            <el-option label="过肩" value="过肩" />
          </el-select>
        </div>
      </div>
    </div>

    <el-divider />

    <!-- 叙事内容 -->
    <div class="field-group">
      <div class="field-label">{{ $t('editor.action') }}</div>
      <el-input v-model="currentStoryboard.action" type="textarea" :rows="3" :placeholder="$t('editor.actionPlaceholder')" @blur="$emit('save-field', 'action')" />
    </div>
    <div class="field-group">
      <div class="field-label">{{ $t('editor.result') }}</div>
      <el-input v-model="currentStoryboard.result" type="textarea" :rows="2" :placeholder="$t('editor.resultPlaceholder')" @blur="$emit('save-field', 'result')" />
    </div>
    <div class="field-group">
      <div class="field-label">{{ $t('editor.dialogue') }}</div>
      <el-input v-model="currentStoryboard.dialogue" type="textarea" :rows="3" :placeholder="$t('editor.dialoguePlaceholder')" @blur="$emit('save-field', 'dialogue')" />
    </div>
    <div class="field-group">
      <div class="field-label">{{ $t('editor.description') }}</div>
      <el-input v-model="currentStoryboard.description" type="textarea" :rows="3" :placeholder="$t('editor.descriptionPlaceholder')" @blur="$emit('save-field', 'description')" />
    </div>
    <div class="field-group">
      <div class="field-label">{{ $t('editor.soundEffects') }}</div>
      <el-input v-model="currentStoryboard.sound_effect" type="textarea" :rows="2" :placeholder="$t('editor.soundEffectsPlaceholder')" @blur="$emit('save-field', 'sound_effect')" />
    </div>
    <div class="field-group">
      <div class="field-label">{{ $t('editor.bgmPrompt') }}</div>
      <el-input v-model="currentStoryboard.bgm_prompt" type="textarea" :rows="2" :placeholder="$t('editor.bgmPromptPlaceholder')" @blur="$emit('save-field', 'bgm_prompt')" />
    </div>
    <div class="field-group">
      <div class="field-label">{{ $t('editor.atmosphere') }}</div>
      <el-input v-model="currentStoryboard.atmosphere" type="textarea" :rows="2" :placeholder="$t('editor.atmospherePlaceholder')" @blur="$emit('save-field', 'atmosphere')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus, Picture, Close, Box } from '@element-plus/icons-vue'
import type { Storyboard } from '@/types/drama'
import { getImageUrl, hasImage } from '@/utils/image'

defineProps<{
  currentStoryboard: Storyboard
  currentStoryboardCharacters: any[]
  currentStoryboardProps: any[]
}>()

defineEmits<{
  'save-field': [fieldName: string]
  'show-scene-selector': []
  'show-character-selector': []
  'show-prop-selector': []
  'show-character-image': [char: any]
  'show-scene-image': []
  'toggle-character': [charId: number]
  'toggle-prop': [propId: number]
}>()
</script>

<style scoped lang="scss">
.properties-tab {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
}

.field-group {
  display: flex; flex-direction: column; gap: 5px;
}

.field-label {
  font-size: 12px; font-weight: 500;
  color: var(--text-secondary, #606266);
  display: flex; align-items: center; gap: 6px;
}

/* 场景预览 */
.scene-preview-v2 {
  position: relative; border-radius: 5px;
  overflow: hidden; cursor: pointer; height: 72px;
  img { width: 100%; height: 100%; object-fit: cover; }
  .scene-info-overlay {
    position: absolute; bottom: 0; left: 0; right: 0;
    background: rgba(0,0,0,.6); color: #fff;
    font-size: 11px; padding: 3px 7px;
  }
}
.scene-preview-empty-v2 {
  height: 52px; border: 1px dashed #dcdfe6; border-radius: 5px;
  display: flex; align-items: center; justify-content: center;
  gap: 6px; color: #c0c4cc; font-size: 12px;
}

/* Cast chip */
.cast-row {
  display: flex; flex-wrap: wrap; gap: 5px; min-height: 28px;
}
.cast-chip {
  display: flex; align-items: center; gap: 3px;
  background: #f4f4f5; border-radius: 16px;
  padding: 2px 7px 2px 2px; font-size: 12px;

  .cast-chip-avatar {
    width: 22px; height: 22px; border-radius: 50%;
    overflow: hidden; background: #ddd;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0;
    img { width: 100%; height: 100%; object-fit: cover; }
    span { font-size: 10px; font-weight: 600; }
  }
  .cast-chip-name { font-size: 12px; color: #303133; }
  .cast-chip-remove {
    font-size: 11px; color: #c0c4cc; cursor: pointer;
    &:hover { color: #f56c6c; }
  }
}
.cast-empty-hint { font-size: 12px; color: #c0c4cc; line-height: 28px; }

/* 视效设置 */
.settings-col-v2 {
  display: flex; flex-direction: column; gap: 5px;
  .setting-row {
    display: flex; align-items: center; gap: 6px;
    label { font-size: 12px; color: #606266; width: 52px; flex-shrink: 0; }
    .el-select { flex: 1; }
  }
}
</style>
