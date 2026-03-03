# SceneEditorPanel 重组实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 SceneEditorPanel 的 6 个顶层 section 合并为 2 个（图片生成 + 视频生成），原来的场景要素/镜头设置/内容描述/音频氛围四个独立 section 平铺融合进对应的生成区。

**Architecture:** 只修改 `SceneEditorPanel.vue` 模板和脚本，同步更新两个 i18n 文件删除废弃键。整个改动不涉及父组件 API（emit 不变、props 不变），不影响数据流。

**Tech Stack:** Vue 3 Composition API, TypeScript, Element Plus, vue-i18n, SCSS

---

## 预读文件（实现前必读）

- `web/src/views/drama/professional/SceneEditorPanel.vue` — 主改文件
- `web/src/locales/zh-CN.ts` 第 628-645 行 — professionalEditor 块
- `web/src/locales/en-US.ts` 第 701-730 行 — professionalEditor 块
- `docs/plans/2026-03-03-scene-editor-panel-reorganization-design.md` — 设计文档

---

## Task 1: 添加 i18n key + script ref

**Files:**
- Modify: `web/src/locales/zh-CN.ts`
- Modify: `web/src/locales/en-US.ts`
- Modify: `web/src/views/drama/professional/SceneEditorPanel.vue`

**Step 1: 在 zh-CN.ts 的 professionalEditor 块中把 sectionAudio 替换为 audioAtmosphere**

在 `web/src/locales/zh-CN.ts` 找到：
```ts
    sectionAudio: '音频氛围',
```
替换为：
```ts
    audioAtmosphere: '音频氛围',
```

同时删除其余三个废弃键（在同一块内）：
```ts
    sectionSceneElements: '场景要素',   // 删除
    sectionShotSettings: '镜头设置',    // 删除
    sectionContent: '内容描述',         // 删除
    sectionAudio: '音频氛围',           // 已替换为 audioAtmosphere
```

**Step 2: 在 en-US.ts 做同样操作**

找到：
```ts
    sectionSceneElements: 'Scene Elements',
    sectionShotSettings: 'Shot Settings',
    sectionContent: 'Content',
    sectionAudio: 'Audio & Atmosphere',
```
替换为（只保留）：
```ts
    audioAtmosphere: 'Audio & Atmosphere',
```

**Step 3: 在 SceneEditorPanel.vue script 中添加 `ref` 导入和 `showAudio` 状态**

找到（约第 306 行）：
```ts
import { computed } from 'vue'
```
改为：
```ts
import { computed, ref } from 'vue'
```

找到 imports 的 element-plus icons 行：
```ts
  ArrowLeft, ArrowRight, Plus, Picture, Close, Box, Edit,
  CopyDocument, VideoCamera, Loading, MagicStick, Upload, VideoPlay
```
改为：
```ts
  ArrowLeft, ArrowRight, ArrowDown, Plus, Picture, Close, Box, Edit,
  CopyDocument, VideoCamera, Loading, MagicStick, Upload, VideoPlay
```

在 `const isFirst = computed(...)` 之前添加：
```ts
const showAudio = ref(false)
```

**Step 4: 运行类型检查，确认无错误**
```bash
cd /Users/connor/AiProject/huobao-drama/web && pnpm build:check 2>&1 | tail -5
```
期望：`✓ built in X.XXs`

**Step 5: Commit**
```bash
git add web/src/locales/zh-CN.ts web/src/locales/en-US.ts web/src/views/drama/professional/SceneEditorPanel.vue
git commit -m "refactor(i18n): 删除废弃 section keys，添加 audioAtmosphere key 和 showAudio ref"
```

---

## Task 2: 重构 panel-scroll 模板 — 图片生成 section

**Files:**
- Modify: `web/src/views/drama/professional/SceneEditorPanel.vue` 模板部分

**Step 1: 定位当前 panel-scroll 内容**

`panel-scroll` 从 `<div class="panel-scroll">` 开始，包含 6 个 PanelSection，到 `</div><!-- end panel-scroll -->` 结束。

**Step 2: 将图片生成 PanelSection 替换为融合后版本**

找到：
```html
        <!-- 图片生成区（移植自 GenerationTab 的图片部分） -->
        <PanelSection :title="$t('professionalEditor.imageGeneration')" icon="🖼️" :default-open="false">
          <div class="field-group">
            <div class="field-label">{{ $t('editor.selectFrameType') }}</div>
```
将整个图片生成 PanelSection（从开头到 `</PanelSection>`）替换为：

```html
        <!-- ===== 图片生成 ===== -->
        <PanelSection :title="$t('professionalEditor.imageGeneration')" icon="🖼️" :default-open="true">
          <!-- 场景 -->
          <div class="field-group">
            <div class="field-label">
              {{ $t('storyboard.scene') }}
              <el-button size="small" text @click="$emit('show-scene-selector')">{{ $t('storyboard.selectScene') }}</el-button>
            </div>
            <div class="scene-preview-v2" v-if="hasImage(currentStoryboard.background)" @click="$emit('show-scene-image')">
              <img :src="getImageUrl(currentStoryboard.background)" :alt="$t('storyboard.scene')" />
              <div class="scene-info-overlay">
                {{ currentStoryboard.background?.location }} · {{ currentStoryboard.background?.time }}
              </div>
            </div>
            <div class="scene-preview-empty-v2" v-else>
              <el-icon :size="24" color="#ccc"><Picture /></el-icon>
              <span>{{ currentStoryboard.background ? $t('editor.sceneGenerating') : $t('editor.noBackground') }}</span>
            </div>
          </div>
          <!-- 角色 -->
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
          <!-- 分割线 -->
          <div class="section-divider" />
          <!-- 帧类型 -->
          <div class="field-group">
            <div class="field-label">{{ $t('editor.selectFrameType') }}</div>
            <el-radio-group v-model="imageGen.selectedFrameType.value" size="small">
              <el-radio-button value="first">{{ $t('editor.firstFrame') }}</el-radio-button>
              <el-radio-button value="last">{{ $t('editor.lastFrame') }}</el-radio-button>
              <el-radio-button value="action">{{ $t('editor.actionSequence') }}</el-radio-button>
              <el-radio-button value="key">{{ $t('editor.keyFrame') }}</el-radio-button>
            </el-radio-group>
          </div>
          <!-- 提示词 -->
          <div class="field-group">
            <div class="field-label">
              {{ $t('editor.prompt') }}
              <el-button
                size="small" type="primary"
                :disabled="imageGen.isGeneratingPrompt(currentStoryboard?.id, imageGen.selectedFrameType.value)"
                :loading="imageGen.isGeneratingPrompt(currentStoryboard?.id, imageGen.selectedFrameType.value)"
                @click="imageGen.extractFramePrompt()"
                style="margin-left: 8px"
              >{{ $t('editor.extractPrompt') }}</el-button>
            </div>
            <el-input v-model="imageGen.currentFramePrompt.value" type="textarea" :rows="4" :placeholder="$t('editor.promptPlaceholder')" />
          </div>
          <div class="gen-controls-row">
            <el-button
              type="success" :icon="MagicStick" :loading="imageGen.generatingImage.value"
              :disabled="!imageGen.currentFramePrompt.value"
              @click="$emit('generate-image')"
            >{{ imageGen.generatingImage.value ? $t('editor.generating') : $t('editor.generateImage') }}</el-button>
            <el-button :icon="Upload" @click="imageGen.uploadImage()">{{ $t('editor.uploadImage') }}</el-button>
          </div>
          <div v-if="imageGen.generatedImages.value.length > 0" class="field-group" style="margin-top:6px">
            <div class="field-label">{{ $t('editor.generationResult') }} ({{ imageGen.generatedImages.value.length }})</div>
            <div class="result-grid">
              <div v-for="img in imageGen.generatedImages.value" :key="img.id" class="result-item">
                <el-image
                  v-if="hasImage(img)"
                  :src="getImageUrl(img)"
                  fit="cover"
                  :preview-src-list="imageGen.generatedImages.value.filter((i: any) => hasImage(i)).map((i: any) => getImageUrl(i))"
                  preview-teleported
                />
                <div v-else class="result-placeholder">
                  <el-icon :size="16"><Picture /></el-icon>
                  <p>{{ imageGen.getStatusText(img.status) }}</p>
                </div>
              </div>
            </div>
          </div>
        </PanelSection>
```

**Step 3: 运行类型检查**
```bash
pnpm build:check 2>&1 | tail -5
```

---

## Task 3: 重构 panel-scroll 模板 — 视频生成 section

**Files:**
- Modify: `web/src/views/drama/professional/SceneEditorPanel.vue` 模板部分

**Step 1: 将视频生成 PanelSection 替换为融合后版本**

找到：
```html
        <!-- 视频生成区（控制 + 结果列表） -->
        <PanelSection :title="$t('professionalEditor.videoGeneration')" icon="🎬" :default-open="true">
          <!-- 视频提示词预览 -->
```
将整个视频生成 PanelSection 替换为：

```html
        <!-- ===== 视频生成 ===== -->
        <PanelSection :title="$t('professionalEditor.videoGeneration')" icon="🎬" :default-open="true">
          <!-- 镜头设置 -->
          <div class="shot-row">
            <div class="shot-item">
              <label>{{ $t('editor.shotType') }}</label>
              <el-select v-model="currentStoryboard.shot_type" clearable size="small" @change="$emit('save-field', 'shot_type')">
                <el-option :label="$t('professionalEditor.shot.extremeLong')" value="大远景" />
                <el-option :label="$t('professionalEditor.shot.long')" value="远景" />
                <el-option :label="$t('professionalEditor.shot.full')" value="全景" />
                <el-option :label="$t('professionalEditor.shot.mediumFull')" value="中全景" />
                <el-option :label="$t('professionalEditor.shot.medium')" value="中景" />
                <el-option :label="$t('professionalEditor.shot.mediumClose')" value="中近景" />
                <el-option :label="$t('professionalEditor.shot.close')" value="近景" />
                <el-option :label="$t('professionalEditor.shot.closeUp')" value="特写" />
                <el-option :label="$t('professionalEditor.shot.extremeCloseUp')" value="大特写" />
              </el-select>
            </div>
            <div class="shot-item">
              <label>{{ $t('editor.movement') }}</label>
              <el-select v-model="currentStoryboard.movement" clearable size="small" @change="$emit('save-field', 'movement')">
                <el-option :label="$t('professionalEditor.movement.fixed')" value="固定镜头" />
                <el-option :label="$t('professionalEditor.movement.push')" value="推镜" />
                <el-option :label="$t('professionalEditor.movement.pull')" value="拉镜" />
                <el-option :label="$t('professionalEditor.movement.pan')" value="摇镜" />
                <el-option :label="$t('professionalEditor.movement.dolly')" value="移镜" />
                <el-option :label="$t('professionalEditor.movement.tracking')" value="跟镜" />
                <el-option :label="$t('professionalEditor.movement.crane')" value="升降镜头" />
                <el-option :label="$t('professionalEditor.movement.orbit')" value="环绕" />
                <el-option :label="$t('professionalEditor.movement.whip')" value="甩镜" />
                <el-option :label="$t('professionalEditor.movement.zoom')" value="变焦" />
                <el-option :label="$t('professionalEditor.movement.handheld')" value="手持晃动" />
                <el-option :label="$t('professionalEditor.movement.aerial')" value="航拍" />
              </el-select>
            </div>
            <div class="shot-item">
              <label>{{ $t('editor.angle') }}</label>
              <el-select v-model="currentStoryboard.angle" clearable size="small" @change="$emit('save-field', 'angle')">
                <el-option :label="$t('professionalEditor.angle.eye')" value="平视" />
                <el-option :label="$t('professionalEditor.angle.high')" value="俯视" />
                <el-option :label="$t('professionalEditor.angle.low')" value="仰视" />
                <el-option :label="$t('professionalEditor.angle.birdEye')" value="大俯视（鸟瞰）" />
                <el-option :label="$t('professionalEditor.angle.extremeLow')" value="大仰视" />
                <el-option :label="$t('professionalEditor.angle.side')" value="正侧面" />
                <el-option :label="$t('professionalEditor.angle.oblique')" value="斜侧面" />
                <el-option :label="$t('professionalEditor.angle.back')" value="背面" />
                <el-option :label="$t('professionalEditor.angle.dutch')" value="倾斜（荷兰角）" />
                <el-option :label="$t('professionalEditor.angle.pov')" value="主观视角" />
                <el-option :label="$t('professionalEditor.angle.overShoulder')" value="过肩" />
              </el-select>
            </div>
          </div>
          <!-- 内容描述 -->
          <div class="field-group" style="margin-top:8px">
            <div class="field-label">{{ $t('editor.action') }}</div>
            <el-input v-model="currentStoryboard.action" type="textarea" :rows="3" :placeholder="$t('editor.actionPlaceholder')" @blur="$emit('save-field', 'action')" />
          </div>
          <div class="field-group">
            <div class="field-label">{{ $t('editor.dialogue') }}</div>
            <el-input v-model="currentStoryboard.dialogue" type="textarea" :rows="2" :placeholder="$t('editor.dialoguePlaceholder')" @blur="$emit('save-field', 'dialogue')" />
          </div>
          <div class="field-group">
            <div class="field-label">{{ $t('editor.result') }}</div>
            <el-input v-model="currentStoryboard.result" type="textarea" :rows="2" :placeholder="$t('editor.resultPlaceholder')" @blur="$emit('save-field', 'result')" />
          </div>
          <div class="field-group">
            <div class="field-label">{{ $t('editor.description') }}</div>
            <el-input v-model="currentStoryboard.description" type="textarea" :rows="3" :placeholder="$t('editor.descriptionPlaceholder')" @blur="$emit('save-field', 'description')" />
          </div>
          <!-- 音频氛围 toggle -->
          <button class="audio-toggle-btn" type="button" @click="showAudio = !showAudio">
            🔊 {{ $t('professionalEditor.audioAtmosphere') }}
            <el-icon :class="{ 'audio-arrow-open': showAudio }"><ArrowDown /></el-icon>
          </button>
          <div v-show="showAudio" class="audio-fields">
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
          <!-- 分割线 -->
          <div class="section-divider" />
          <!-- 视频提示词预览 -->
          <div class="prompt-preview" v-if="currentStoryboard.video_prompt">
            <span class="prompt-text">{{ currentStoryboard.video_prompt }}</span>
            <button class="copy-btn" type="button" @click="copyPrompt" :title="$t('common.copy')">
              <el-icon><CopyDocument /></el-icon>
            </button>
          </div>
          <!-- 模型选择 -->
          <el-select
            v-model="videoGen.selectedVideoModel.value"
            :placeholder="$t('video.selectVideoModel')"
            size="small"
            style="width:100%;margin-top:6px"
          >
            <el-option
              v-for="model in videoGen.videoModelCapabilities.value"
              :key="model.id"
              :label="model.name"
              :value="model.id"
            />
          </el-select>
          <!-- 生成按钮 -->
          <button
            class="gen-btn"
            type="button"
            @click="videoGen.generateVideo()"
            :disabled="!videoGen.selectedVideoModel.value || videoGen.generatingVideo.value"
            :class="{ loading: videoGen.generatingVideo.value }"
          >
            <el-icon v-if="!videoGen.generatingVideo.value"><VideoCamera /></el-icon>
            <el-icon v-else class="rotating"><Loading /></el-icon>
            {{ videoGen.generatingVideo.value ? $t('professionalEditor.generatingVideo') : $t('professionalEditor.generateVideo') }}
          </button>
          <!-- 合成工作台入口 -->
          <button class="composition-link-btn" type="button" @click="$emit('go-to-composition')">
            {{ $t('editor.compositionWorkbench') }}
            <el-icon><ArrowRight /></el-icon>
          </button>
          <!-- 生成结果列表 -->
          <div v-if="videoGen.generatedVideos.value?.length > 0" class="video-result-list">
            <div
              v-for="video in videoGen.generatedVideos.value"
              :key="video.id"
              class="video-result-item"
              :class="'video-' + video.status"
            >
              <div class="video-thumb-wrap" @click="video.video_url && videoGen.playVideo(video)">
                <video v-if="video.video_url" :src="getVideoUrl(video)" preload="metadata" class="video-thumb-media" />
                <div v-else class="video-thumb-placeholder">
                  <el-icon :size="16"><VideoCamera /></el-icon>
                </div>
                <div class="video-thumb-overlay" v-if="video.video_url">
                  <el-icon color="white" :size="16"><VideoPlay /></el-icon>
                </div>
              </div>
              <div class="video-result-info">
                <el-tag
                  :type="video.status === 'completed' ? 'success' : video.status === 'failed' ? 'danger' : 'warning'"
                  size="small"
                >{{ imageGen.getStatusText(video.status) }}</el-tag>
                <span class="video-duration" v-if="video.duration">{{ video.duration }}s</span>
                <span class="video-error" v-if="video.status === 'failed' && video.error_msg">{{ video.error_msg }}</span>
              </div>
            </div>
          </div>
          <div v-else class="video-empty-hint">
            <el-icon :size="20" color="#c0c4cc"><VideoCamera /></el-icon>
            <p>{{ $t('professionalEditor.noVideoGenerated') }}</p>
          </div>
        </PanelSection>
```

**Step 2: 运行类型检查确认无错误**
```bash
pnpm build:check 2>&1 | tail -5
```

---

## Task 4: 删除废弃的 4 个独立 PanelSection

**Files:**
- Modify: `web/src/views/drama/professional/SceneEditorPanel.vue`

**Step 1: 定位并删除 Section 1 场景要素**

找到注释 `<!-- Section 1: 场景要素 -->` 开始的整个 PanelSection 块（到它的 `</PanelSection>` 结束），完整删除。

**Step 2: 删除 Section 2 镜头设置**

找到 `<!-- Section 2: 镜头设置 -->` 块，完整删除。

**Step 3: 删除 Section 3 内容描述**

找到 `<!-- Section 3: 内容描述 -->` 块，完整删除。

**Step 4: 删除 Section 4 音频氛围**

找到 `<!-- Section 4: 音频氛围 -->` 块（默认折叠那个），完整删除。

**Step 5: 运行类型检查确认无错误**
```bash
pnpm build:check 2>&1 | tail -5
```

---

## Task 5: 添加新 CSS 样式

**Files:**
- Modify: `web/src/views/drama/professional/SceneEditorPanel.vue` `<style>` 块

**Step 1: 在 `.shot-item` 规则之后添加以下 CSS**

```scss
/* 两个 section 之间的视觉分割线 */
.section-divider {
  height: 1px;
  background: var(--border-primary, #e4e7ed);
  margin: 10px 0;
}

/* 音频氛围折叠 toggle 按钮 */
.audio-toggle-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 0;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary, #606266);
  text-align: left;
  margin: 4px 0;

  .el-icon {
    margin-left: auto;
    transition: transform 150ms;
  }
  &:hover { color: var(--accent, #e8a243); }
}

.audio-arrow-open {
  transform: rotate(180deg);
}

.audio-fields {
  padding-top: 4px;
}
```

**Step 2: 运行类型检查**
```bash
pnpm build:check 2>&1 | tail -5
```

**Step 3: Commit 所有改动**
```bash
git add web/src/views/drama/professional/SceneEditorPanel.vue \
        web/src/locales/zh-CN.ts \
        web/src/locales/en-US.ts
git commit -m "refactor(editor): 合并6个section为2个，场景/镜头/内容/音频融入生成区"
```

---

## Task 6: 验证

**Step 1: 截图确认两个 PanelSection 在右侧面板中正确渲染**

使用 `preview_screenshot` 检查：
- 右侧面板显示"📸 图片生成"和"🎬 视频生成"两个 section
- 图片生成内显示场景/角色/道具 → 分割线 → 提示词 → 生成按钮
- 视频生成内显示镜头设置三下拉 → 内容描述 → 音频 toggle → 分割线 → 视频提示词 → 生成按钮

**Step 2: 检查无 console errors**
```
preview_console_logs level: error
```
期望：No console logs.

**Step 3: 点击音频 toggle 验证展开/折叠**

用 `preview_click` 点击音频折叠按钮，再截图确认展开效果。
