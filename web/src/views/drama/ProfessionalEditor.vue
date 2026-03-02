<template>
  <div class="professional-editor-v2">
    <!-- ===== 顶栏 ===== -->
    <AppHeader :fixed="false">
      <template #left>
        <el-button text @click="goBack" class="back-btn">
          <el-icon><ArrowLeft /></el-icon>
          <span>{{ $t('editor.backToEpisode') }}</span>
        </el-button>
        <span class="episode-title">{{ drama?.title }} - {{ $t('editor.episode', { number: episodeNumber }) }}</span>
      </template>
    </AppHeader>

    <!-- ===== 主编辑区 ===== -->
    <div class="editor-main-v2">

      <!-- ===== 左侧：分镜缩略图列表 ===== -->
      <div class="storyboard-panel-v2">
        <div class="panel-header-v2">
          <span class="panel-title">{{ $t('storyboard.scriptStructure') }}</span>
          <el-button text :icon="Plus" size="small" @click="handleAddStoryboard">{{ $t('storyboard.add') }}</el-button>
        </div>
        <div class="storyboard-cards">
          <div
            v-for="shot in storyboards"
            :key="shot.id"
            class="storyboard-card"
            :class="{ active: currentStoryboardId === shot.id }"
            @click="selectStoryboard(shot.id)"
          >
            <!-- 缩略图 -->
            <div class="card-thumbnail">
              <img
                v-if="getStoryboardThumbnail(shot)"
                :src="getStoryboardThumbnail(shot)"
                alt=""
                class="thumbnail-img"
              />
              <div v-else class="thumbnail-placeholder">
                <el-icon :size="18" color="#aaa"><Picture /></el-icon>
              </div>
              <div class="shot-number-badge">#{{ shot.storyboard_number }}</div>
            </div>
            <!-- 信息区 -->
            <div class="card-info">
              <div class="card-title">{{ shot.title || $t('storyboard.untitled') }}</div>
              <div class="card-meta">
                <span class="card-duration">{{ shot.duration }}s</span>
                <span
                  class="status-dot"
                  :class="(shot as any).background?.image_url ? 'dot-image' : 'dot-empty'"
                >图</span>
              </div>
            </div>
            <!-- 删除按钮 -->
            <el-button
              link type="danger" :icon="Delete" size="small"
              class="card-delete-btn"
              @click.stop="handleDeleteStoryboard(shot)"
            />
          </div>
        </div>
      </div>

      <!-- ===== 中间：预览区 + 时间线 ===== -->
      <div class="center-area-v2">
        <!-- 上：大图/视频预览 -->
        <div class="preview-area-v2">
          <template v-if="currentStoryboard">
            <video
              v-if="currentPreviewVideo"
              :src="currentPreviewVideo"
              class="preview-media"
              controls
              preload="metadata"
            />
            <img
              v-else-if="currentPreviewUrl"
              :src="currentPreviewUrl"
              class="preview-media"
              alt="当前分镜预览"
            />
            <div v-else class="preview-placeholder">
              <el-icon :size="48" color="#444"><Picture /></el-icon>
              <p>暂无预览图，请先生成图片</p>
            </div>
            <div class="preview-info-overlay">
              <span class="preview-shot-num">#{{ currentStoryboard.storyboard_number }}</span>
              <span class="preview-shot-title">{{ currentStoryboard.title || $t('storyboard.untitled') }}</span>
              <span class="preview-shot-duration">{{ currentStoryboard.duration }}s</span>
            </div>
          </template>
          <div v-else class="preview-placeholder">
            <el-icon :size="48" color="#444"><Picture /></el-icon>
            <p>请从左侧选择分镜</p>
          </div>
        </div>

        <!-- 下：时间线 -->
        <div class="timeline-area-v2">
          <VideoTimelineEditor
            ref="timelineEditorRef"
            v-if="storyboards.length > 0"
            :scenes="(storyboards as any[])"
            :episode-id="episodeId.toString()"
            :drama-id="dramaId.toString()"
            :assets="videoAssets"
            @select-scene="handleTimelineSelect"
            @asset-deleted="loadVideoAssets"
            @merge-completed="handleMergeCompleted"
          />
          <el-empty v-else :description="$t('storyboard.noStoryboard')" class="empty-timeline" />
        </div>
      </div>

      <!-- ===== 右侧：折叠Accordion ===== -->
      <div class="edit-panel-v2" v-if="currentStoryboard">

        <!-- ── Accordion: 镜头设置 ── -->
        <div class="accordion-section" :class="{ expanded: isSectionExpanded('shot-settings') }">
          <div class="accordion-header" @click="toggleSection('shot-settings')">
            <span class="accordion-title">镜头设置</span>
            <span class="accordion-arrow">{{ isSectionExpanded('shot-settings') ? '▲' : '▼' }}</span>
          </div>
          <div class="accordion-body" v-show="isSectionExpanded('shot-settings')">
            <!-- 场景 -->
            <div class="field-group">
              <div class="field-label">
                {{ $t('storyboard.scene') }}
                <el-button size="small" text @click="showSceneSelector = true">{{ $t('storyboard.selectScene') }}</el-button>
              </div>
              <div class="scene-preview-v2" v-if="hasImage(currentStoryboard.background)" @click="showSceneImage">
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
                <el-button size="small" text :icon="Plus" @click="showCharacterSelector = true">{{ $t('editor.addCharacter') }}</el-button>
              </div>
              <div class="cast-row">
                <div v-for="char in currentStoryboardCharacters" :key="char.id" class="cast-chip">
                  <div class="cast-chip-avatar" @click="showCharacterImage(char)">
                    <img v-if="hasImage(char)" :src="getImageUrl(char)" :alt="char.name" />
                    <span v-else>{{ char.name?.[0] || '?' }}</span>
                  </div>
                  <span class="cast-chip-name">{{ char.name }}</span>
                  <el-icon class="cast-chip-remove" @click.stop="toggleCharacterInShot(char.id)"><Close /></el-icon>
                </div>
                <div v-if="!currentStoryboardCharacters.length" class="cast-empty-hint">{{ $t('editor.noCharacters') }}</div>
              </div>
            </div>

            <!-- 道具 -->
            <div class="field-group">
              <div class="field-label">
                {{ $t('editor.props') }}
                <el-button size="small" text :icon="Plus" @click="showPropSelector = true">{{ $t('editor.addProp') }}</el-button>
              </div>
              <div class="cast-row">
                <div v-for="prop in currentStoryboardProps" :key="prop.id" class="cast-chip">
                  <div class="cast-chip-avatar">
                    <img v-if="hasImage(prop)" :src="getImageUrl(prop)" :alt="prop.name" />
                    <el-icon v-else><Box /></el-icon>
                  </div>
                  <span class="cast-chip-name">{{ prop.name }}</span>
                  <el-icon class="cast-chip-remove" @click.stop="togglePropInShot(prop.id)"><Close /></el-icon>
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
                  <el-select v-model="currentStoryboard.shot_type" clearable size="small" @change="saveStoryboardField('shot_type')">
                    <el-option label="大远景" value="大远景" /><el-option label="远景" value="远景" />
                    <el-option label="全景" value="全景" /><el-option label="中全景" value="中全景" />
                    <el-option label="中景" value="中景" /><el-option label="中近景" value="中近景" />
                    <el-option label="近景" value="近景" /><el-option label="特写" value="特写" />
                    <el-option label="大特写" value="大特写" />
                  </el-select>
                </div>
                <div class="setting-row">
                  <label>{{ $t('editor.movement') }}</label>
                  <el-select v-model="currentStoryboard.movement" clearable size="small" @change="saveStoryboardField('movement')">
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
                  <el-select v-model="currentStoryboard.angle" clearable size="small" @change="saveStoryboardField('angle')">
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
          </div>
        </div>

        <!-- ── Accordion: 叙事内容 ── -->
        <div class="accordion-section" :class="{ expanded: isSectionExpanded('narrative') }">
          <div class="accordion-header" @click="toggleSection('narrative')">
            <span class="accordion-title">叙事内容</span>
            <span class="accordion-arrow">{{ isSectionExpanded('narrative') ? '▲' : '▼' }}</span>
          </div>
          <div class="accordion-body" v-show="isSectionExpanded('narrative')">
            <div class="field-group">
              <div class="field-label">{{ $t('editor.action') }}</div>
              <el-input v-model="currentStoryboard.action" type="textarea" :rows="3" :placeholder="$t('editor.actionPlaceholder')" @blur="saveStoryboardField('action')" />
            </div>
            <div class="field-group">
              <div class="field-label">{{ $t('editor.result') }}</div>
              <el-input v-model="currentStoryboard.result" type="textarea" :rows="2" :placeholder="$t('editor.resultPlaceholder')" @blur="saveStoryboardField('result')" />
            </div>
            <div class="field-group">
              <div class="field-label">{{ $t('editor.dialogue') }}</div>
              <el-input v-model="currentStoryboard.dialogue" type="textarea" :rows="3" :placeholder="$t('editor.dialoguePlaceholder')" @blur="saveStoryboardField('dialogue')" />
            </div>
            <div class="field-group">
              <div class="field-label">{{ $t('editor.description') }}</div>
              <el-input v-model="currentStoryboard.description" type="textarea" :rows="3" :placeholder="$t('editor.descriptionPlaceholder')" @blur="saveStoryboardField('description')" />
            </div>
            <div class="field-group">
              <div class="field-label">{{ $t('editor.soundEffects') }}</div>
              <el-input v-model="currentStoryboard.sound_effect" type="textarea" :rows="2" :placeholder="$t('editor.soundEffectsPlaceholder')" @blur="saveStoryboardField('sound_effect')" />
            </div>
            <div class="field-group">
              <div class="field-label">{{ $t('editor.bgmPrompt') }}</div>
              <el-input v-model="currentStoryboard.bgm_prompt" type="textarea" :rows="2" :placeholder="$t('editor.bgmPromptPlaceholder')" @blur="saveStoryboardField('bgm_prompt')" />
            </div>
            <div class="field-group">
              <div class="field-label">{{ $t('editor.atmosphere') }}</div>
              <el-input v-model="currentStoryboard.atmosphere" type="textarea" :rows="2" :placeholder="$t('editor.atmospherePlaceholder')" @blur="saveStoryboardField('atmosphere')" />
            </div>
          </div>
        </div>

        <!-- ── Accordion: 图片生成 ── -->
        <div class="accordion-section" :class="{ expanded: isSectionExpanded('image-gen') }">
          <div class="accordion-header" @click="toggleSection('image-gen')">
            <span class="accordion-title">图片生成</span>
            <span class="accordion-arrow">{{ isSectionExpanded('image-gen') ? '▲' : '▼' }}</span>
          </div>
          <div class="accordion-body" v-show="isSectionExpanded('image-gen')">
            <div class="field-group">
              <div class="field-label">
                {{ $t('editor.selectFrameType') }}
              </div>
              <el-radio-group v-model="selectedFrameType" size="small">
                <el-radio-button value="first">{{ $t('editor.firstFrame') }}</el-radio-button>
                <el-radio-button value="last">{{ $t('editor.lastFrame') }}</el-radio-button>
                <el-radio-button value="action">{{ $t('editor.actionSequence') }}</el-radio-button>
                <el-radio-button value="key">{{ $t('editor.keyFrame') }}</el-radio-button>
              </el-radio-group>
            </div>
            <div class="field-group">
              <div class="field-label">
                {{ $t('editor.prompt') }}
                <el-button
                  size="small" type="primary"
                  :disabled="isGeneratingPrompt(currentStoryboard?.id, selectedFrameType)"
                  :loading="isGeneratingPrompt(currentStoryboard?.id, selectedFrameType)"
                  @click="extractFramePrompt"
                  style="margin-left: 8px"
                >{{ $t('editor.extractPrompt') }}</el-button>
              </div>
              <el-input v-model="currentFramePrompt" type="textarea" :rows="5" :placeholder="$t('editor.promptPlaceholder')" />
            </div>
            <div class="gen-controls-v2">
              <el-button
                type="success" :icon="MagicStick" :loading="generatingImage"
                :disabled="!currentFramePrompt"
                @click="generateFrameImage"
              >{{ generatingImage ? $t('editor.generating') : $t('editor.generateImage') }}</el-button>
              <el-button :icon="Upload" @click="uploadImage">{{ $t('editor.uploadImage') }}</el-button>
            </div>
            <!-- 生成结果 -->
            <div v-if="generatedImages.length > 0 || selectedFrameType === 'action'" class="field-group" style="margin-top:4px">
              <div class="field-label">{{ $t('editor.generationResult') }} ({{ generatedImages.length }})</div>
              <div class="result-grid">
                <div v-if="selectedFrameType === 'action'" class="result-item grid-entry" @click="showGridEditor = true">
                  <el-icon :size="24" color="#ccc"><Plus /></el-icon>
                </div>
                <div v-for="img in generatedImages" :key="img.id" class="result-item">
                  <el-image
                    v-if="hasImage(img)"
                    :src="getImageUrl(img)"
                    fit="cover"
                    :preview-src-list="generatedImages.filter(i => hasImage(i)).map(i => getImageUrl(i))"
                    preview-teleported
                  />
                  <div v-else class="result-placeholder">
                    <el-icon :size="20"><Picture /></el-icon>
                    <p>{{ getStatusText(img.status) }}</p>
                  </div>
                  <div class="result-actions" v-if="hasImage(img)">
                    <div v-if="img.frame_type === 'action'" class="result-action-btn" @click.stop="openCropDialog(img)">
                      <el-icon :size="13" color="white"><Crop /></el-icon>
                    </div>
                    <div class="result-action-btn" @click.stop="handleDeleteImage(img)">
                      <el-icon :size="13" color="#f56c6c"><DeleteFilled /></el-icon>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Accordion: 视频生成 ── -->
        <div class="accordion-section" :class="{ expanded: isSectionExpanded('video-gen') }">
          <div class="accordion-header" @click="toggleSection('video-gen')">
            <span class="accordion-title">视频生成</span>
            <span class="accordion-arrow">{{ isSectionExpanded('video-gen') ? '▲' : '▼' }}</span>
          </div>
          <div class="accordion-body" v-show="isSectionExpanded('video-gen')">
            <div class="field-group">
              <div class="field-label">视频提示词</div>
              <div class="video-prompt-display">{{ currentStoryboard.video_prompt || '暂无提示词' }}</div>
            </div>
            <div class="field-group">
              <div class="field-label">{{ $t('video.model') }}</div>
              <el-select v-model="selectedVideoModel" :placeholder="$t('video.selectVideoModel')" size="small" style="width:100%">
                <el-option v-for="model in videoModelCapabilities" :key="model.id" :label="model.name" :value="model.id">
                  <div style="display:flex;justify-content:space-between;align-items:center">
                    <span>{{ model.name }}</span>
                    <div style="display:flex;gap:4px">
                      <el-tag v-if="model.supportMultipleImages" size="small" type="success">多图</el-tag>
                      <el-tag v-if="model.supportFirstLastFrame" size="small" type="primary">首尾帧</el-tag>
                    </div>
                  </div>
                </el-option>
              </el-select>
            </div>
            <div class="field-group" v-if="selectedVideoModel && availableReferenceModes.length > 0">
              <div class="field-label">参考图模式</div>
              <el-select v-model="selectedReferenceMode" size="small" style="width:100%">
                <el-option v-for="mode in availableReferenceModes" :key="mode.value" :label="mode.label" :value="mode.value" />
              </el-select>
            </div>
            <div class="field-group">
              <div class="field-label">{{ $t('professionalEditor.duration') }}</div>
              <div style="display:flex;align-items:center;gap:8px">
                <el-slider v-model="videoDuration" :min="4" :max="10" :step="1" show-stops style="flex:1" />
                <span style="min-width:32px;font-size:12px;color:#606266">{{ videoDuration }}{{ $t('professionalEditor.seconds') }}</span>
              </div>
            </div>
            <!-- 参考图选择 -->
            <div class="field-group" v-if="selectedReferenceMode && selectedReferenceMode !== 'none'">
              <div class="field-label">选择参考图</div>
              <el-radio-group v-model="selectedVideoFrameType" size="small">
                <el-radio-button value="first">首帧</el-radio-button>
                <el-radio-button value="last">尾帧</el-radio-button>
                <el-radio-button value="action">动作序列</el-radio-button>
                <el-radio-button value="key">关键帧</el-radio-button>
              </el-radio-group>
              <div class="ref-image-grid">
                <div
                  v-for="img in videoReferenceImages.filter(i => i.status === 'completed' && i.image_url && i.frame_type === selectedVideoFrameType)"
                  :key="img.id"
                  class="ref-image-item"
                  :class="{ selected: selectedImagesForVideo.includes(img.id) }"
                  @click="handleImageSelect(img.id)"
                >
                  <el-image :src="getImageUrl(img)" fit="cover" style="width:100%;height:100%;pointer-events:none" />
                  <div class="ref-selected-mark" v-if="selectedImagesForVideo.includes(img.id)">✓</div>
                </div>
                <el-empty
                  v-if="!videoReferenceImages.some(i => i.status==='completed' && i.image_url && i.frame_type===selectedVideoFrameType)"
                  description="暂无图片" :image-size="40"
                />
              </div>
              <!-- 首尾帧模式预览框 -->
              <div v-if="selectedReferenceMode === 'first_last'" class="frame-slots-row">
                <div class="frame-slot">
                  <div class="frame-slot-label">首帧</div>
                  <div class="image-slot-mini" @click="firstFrameSlotImage && removeSelectedImage(firstFrameSlotImage.id)">
                    <img v-if="firstFrameSlotImage" :src="firstFrameSlotImage.image_url" />
                    <el-icon v-else><Plus /></el-icon>
                  </div>
                </div>
                <span style="color:#c0c4cc;font-size:18px">→</span>
                <div class="frame-slot">
                  <div class="frame-slot-label">尾帧</div>
                  <div class="image-slot-mini" @click="lastFrameSlotImage && removeSelectedImage(lastFrameSlotImage.id)">
                    <img v-if="lastFrameSlotImage" :src="lastFrameSlotImage.image_url" />
                    <el-icon v-else><Plus /></el-icon>
                  </div>
                </div>
              </div>
            </div>
            <!-- 生成按钮 -->
            <div class="gen-controls-v2">
              <el-button
                type="primary" :icon="VideoCamera" :loading="generatingVideo"
                :disabled="!selectedVideoModel || (selectedReferenceMode !== 'none' && selectedImagesForVideo.length === 0)"
                @click="generateVideo"
              >{{ generatingVideo ? '生成中...' : '生成视频' }}</el-button>
            </div>
            <!-- 视频结果 -->
            <div class="result-grid" v-if="generatedVideos.length > 0" style="margin-top:8px">
              <div v-for="video in generatedVideos" :key="video.id" class="result-item video-result-item">
                <div v-if="video.video_url" class="video-thumb-v2" @click="playVideo(video)">
                  <video :src="getVideoUrl(video)" preload="metadata" />
                  <div class="play-overlay-v2"><el-icon :size="28" color="#fff"><VideoPlay /></el-icon></div>
                </div>
                <div v-else class="result-placeholder">
                  <el-icon :size="20"><VideoCamera /></el-icon>
                  <p>{{ getStatusText(video.status) }}</p>
                </div>
                <div class="result-actions" v-if="video.video_url">
                  <div class="result-action-btn" @click.stop="addVideoToAssets(video)">
                    <el-icon :size="13" color="white"><FolderAdd /></el-icon>
                  </div>
                  <div class="result-action-btn" @click.stop="handleDeleteVideo(video)">
                    <el-icon :size="13" color="#f56c6c"><DeleteFilled /></el-icon>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Accordion: 视频合成 ── -->
        <div class="accordion-section" :class="{ expanded: isSectionExpanded('merge') }">
          <div class="accordion-header" @click="toggleSection('merge')">
            <span class="accordion-title">视频合成</span>
            <span class="accordion-arrow">{{ isSectionExpanded('merge') ? '▲' : '▼' }}</span>
          </div>
          <div class="accordion-body" v-show="isSectionExpanded('merge')">
            <div v-loading="loadingMerges">
              <el-empty v-if="videoMerges.length === 0" description="暂无合成记录" :image-size="60" />
              <div v-else class="merge-list-v2">
                <div v-for="merge in videoMerges" :key="merge.id" class="merge-item-v2" :class="'merge-' + merge.status">
                  <div class="merge-item-header">
                    <span class="merge-item-title">{{ merge.title }}</span>
                    <el-tag
                      :type="merge.status === 'completed' ? 'success' : merge.status === 'failed' ? 'danger' : 'warning'"
                      size="small"
                    >{{ merge.status === 'pending' ? '等待中' : merge.status === 'processing' ? '合成中' : merge.status === 'completed' ? '已完成' : '失败' }}</el-tag>
                  </div>
                  <div class="merge-item-actions">
                    <el-button v-if="merge.status === 'completed' && merge.merged_url" type="primary" size="small" @click="downloadVideo(merge.merged_url, merge.title)">下载</el-button>
                    <el-button v-if="merge.status === 'completed' && merge.merged_url" size="small" @click="previewMergedVideo(merge.merged_url)">预览</el-button>
                    <el-button type="danger" size="small" @click="deleteMerge(merge.id)">删除</el-button>
                  </div>
                  <div v-if="merge.status === 'failed' && merge.error_msg" class="merge-error-v2">{{ merge.error_msg }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
      <!-- 右侧：未选中分镜时的空状态 -->
      <div class="edit-panel-v2 edit-panel-empty" v-else>
        <el-empty description="请从左侧选择分镜" />
      </div>

    </div>

    <!-- ===== 所有对话框（保持原始实现） ===== -->

    <!-- 角色图片预览 -->
    <el-dialog v-model="showCharacterImagePreview" :title="previewCharacter?.name" width="600px">
      <div class="character-image-preview-v2" v-if="previewCharacter">
        <img v-if="previewCharacter.local_path" :src="getImageUrl(previewCharacter)" :alt="previewCharacter.name" />
        <el-empty v-else description="暂无图片" />
      </div>
    </el-dialog>

    <!-- 场景大图预览 -->
    <el-dialog
      v-model="showSceneImagePreview"
      :title="currentStoryboard?.background ? `${currentStoryboard.background.location} · ${currentStoryboard.background.time}` : '场景预览'"
      width="800px"
    >
      <div class="scene-image-preview-v2" v-if="currentStoryboard?.background?.image_url">
        <img :src="currentStoryboard.background.image_url" alt="场景" />
      </div>
    </el-dialog>

    <!-- 角色选择对话框 -->
    <el-dialog v-model="showCharacterSelector" title="添加角色到镜头" width="800px">
      <div class="character-selector-grid">
        <div
          v-for="char in availableCharacters"
          :key="char.id"
          class="character-card"
          :class="{ selected: isCharacterInCurrentShot(char.id) }"
          @click="toggleCharacterInShot(char.id)"
        >
          <div class="character-avatar-large">
            <img v-if="char.local_path" :src="getImageUrl(char)" :alt="char.name" />
            <span v-else>{{ char.name?.[0] || '?' }}</span>
          </div>
          <div class="character-info">
            <div class="character-name">{{ char.name }}</div>
            <div class="character-role">{{ char.role || '角色' }}</div>
          </div>
          <div class="character-check" v-if="isCharacterInCurrentShot(char.id)">
            <el-icon color="#409eff" :size="24"><Check /></el-icon>
          </div>
        </div>
        <div v-if="availableCharacters.length === 0" class="empty-characters">
          <el-empty description="暂无角色，请先在剧集中创建角色" />
        </div>
      </div>
      <template #footer>
        <el-button @click="showCharacterSelector = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 道具选择对话框 -->
    <el-dialog v-model="showPropSelector" :title="$t('editor.addPropToShot')" width="800px">
      <div class="character-selector-grid">
        <div
          v-for="prop in availableProps"
          :key="prop.id"
          class="character-card"
          :class="{ selected: isPropInCurrentShot(prop.id) }"
          @click="togglePropInShot(prop.id)"
        >
          <div class="character-avatar-large">
            <img v-if="prop.local_path" :src="getImageUrl(prop)" :alt="prop.name" />
            <el-icon v-else :size="32"><Box /></el-icon>
          </div>
          <div class="character-info">
            <div class="character-name">{{ prop.name }}</div>
            <div class="character-role">{{ prop.type || $t('editor.props') }}</div>
          </div>
          <div class="character-check" v-if="isPropInCurrentShot(prop.id)">
            <el-icon color="#409eff" :size="24"><Check /></el-icon>
          </div>
        </div>
        <div v-if="availableProps.length === 0" class="empty-characters">
          <el-empty :description="$t('editor.noPropsAvailable')" />
        </div>
      </div>
      <template #footer>
        <el-button @click="showPropSelector = false">{{ $t('common.close') }}</el-button>
      </template>
    </el-dialog>

    <!-- 场景选择对话框 -->
    <el-dialog v-model="showSceneSelector" title="选择场景背景" width="800px">
      <div class="scene-selector-grid">
        <div
          v-for="scene in availableScenes"
          :key="scene.id"
          class="scene-card"
          :class="{ selected: currentStoryboard?.scene_id === scene.id }"
          @click="selectScene(scene.id)"
        >
          <div class="scene-image">
            <img v-if="hasImage(scene)" :src="getImageUrl(scene)" :alt="scene.location" />
            <el-icon v-else :size="48" color="#ccc"><Picture /></el-icon>
          </div>
          <div class="scene-info">
            <div class="scene-location">{{ scene.location }}</div>
            <div class="scene-time">{{ scene.time }}</div>
          </div>
        </div>
        <div v-if="availableScenes.length === 0" class="empty-scenes">
          <el-empty description="暂无可用场景" />
        </div>
      </div>
    </el-dialog>

    <!-- 视频预览对话框 -->
    <el-dialog v-model="showVideoPreview" title="视频预览" width="800px" destroy-on-close>
      <div class="video-preview-container" v-if="previewVideo">
        <video
          v-if="previewVideo.video_url"
          :src="getVideoUrl(previewVideo)"
          controls autoplay
          style="width:100%;max-height:70vh;display:block;background:#000;border-radius:8px"
        />
        <div v-else style="text-align:center;padding:40px">
          <el-icon :size="48" color="#ccc"><VideoCamera /></el-icon>
          <p style="margin-top:16px;color:#909399">视频生成中...</p>
        </div>
        <div class="video-meta" style="margin-top:12px">
          <el-tag :type="getStatusType(previewVideo.status)" size="small">{{ getStatusText(previewVideo.status) }}</el-tag>
          <span v-if="previewVideo.duration" style="margin-left:12px;color:#606266;font-size:14px">
            {{ $t('professionalEditor.duration') }}: {{ previewVideo.duration }}{{ $t('professionalEditor.seconds') }}
          </span>
        </div>
      </div>
    </el-dialog>

    <!-- 大图预览 -->
    <el-image-viewer v-if="previewImageUrl" :url-list="[previewImageUrl]" @close="previewImageUrl = ''" teleported />

    <!-- 宫格图片编辑器 -->
    <GridImageEditor
      v-model="showGridEditor"
      :storyboard-id="Number(currentStoryboard?.id) || 0"
      :drama-id="Number(dramaId)"
      :all-images="(allGeneratedImages as any[])"
      @success="handleGridImageSuccess"
    />

    <!-- 图片裁剪对话框 -->
    <ImageCropDialog
      v-model="showCropDialog"
      :image-url="cropImageUrl"
      @save="handleCropSave"
    />

  </div>
</template>


<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  ArrowLeft,
  Plus,
  Picture,
  VideoPlay,
  VideoPause,
  View,
  Setting,
  Upload,
  MagicStick,
  VideoCamera,
  ZoomIn,
  ZoomOut,
  Top,
  Bottom,
  Check,
  Close,
  Right,
  Timer,
  Calendar,
  Clock,
  Loading,
  WarningFilled,
  Delete,
  Connection,
  Box,
  Crop,
  FolderAdd,
} from "@element-plus/icons-vue";
import { dramaAPI } from "@/api/drama";
import { propAPI } from "@/api/prop";
import { generateFramePrompt, type FrameType } from "@/api/frame";
import { imageAPI } from "@/api/image";
import { videoAPI } from "@/api/video";
import { aiAPI } from "@/api/ai";
import { assetAPI } from "@/api/asset";
import { videoMergeAPI } from "@/api/videoMerge";
import { taskAPI } from "@/api/task";
import type { ImageGeneration } from "@/types/image";
import type { VideoGeneration } from "@/types/video";
import type { AIServiceConfig } from "@/types/ai";
import type { Asset } from "@/types/asset";
import type { VideoMerge } from "@/api/videoMerge";
import VideoTimelineEditor from "@/components/editor/VideoTimelineEditor.vue";
import GridImageEditor from "@/components/editor/GridImageEditor.vue";
import type { Drama, Episode, Storyboard } from "@/types/drama";
import { AppHeader, ImageCropDialog } from "@/components/common";
import { getImageUrl, hasImage, getVideoUrl } from "@/utils/image";

const route = useRoute();
const router = useRouter();
const { t: $t } = useI18n();

const dramaId = Number(route.params.dramaId);
const episodeNumber = Number(route.params.episodeNumber);
const episodeId = ref<string | number>(0);

const drama = ref<Drama | null>(null);
const episode = ref<Episode | null>(null);
const storyboards = ref<Storyboard[]>([]);
const characters = ref<any[]>([]);
const availableScenes = ref<any[]>([]);
const props = ref<any[]>([]);
const showPropSelector = ref(false);

const currentStoryboardId = ref<string | null>(null);
const activeTab = ref("shot");
const showSceneSelector = ref(false);
const showCharacterSelector = ref(false);
const showCharacterImagePreview = ref(false);
const previewCharacter = ref<any>(null);
const showSceneImagePreview = ref(false);
const showSettings = ref(false);
const showVideoPreview = ref(false);
const previewVideo = ref<VideoGeneration | null>(null);
const addingToAssets = ref<Set<number>>(new Set());

const currentPlayState = ref<"playing" | "paused">("paused");
const currentTime = ref(0);
const totalDuration = computed(() => {
  if (!Array.isArray(storyboards.value)) return 0;
  return storyboards.value.reduce((sum, s) => sum + (s.duration || 0), 0);
});

const selectedCharacters = ref<number[]>([]);
const narrativeTab = ref("shot-prompt");

// 图片生成相关状态
const selectedFrameType = ref<FrameType>("first");
const panelCount = ref(3);
const generatingPromptStates = ref<Record<string, boolean>>({}); // 按 "镜头ID_帧类型" 记录生成状态
const framePrompts = ref<Record<string, string>>({
  key: "",
  first: "",
  last: "",
  panel: "",
});
const currentFramePrompt = ref("");
const generatingImage = ref(false);
const generatedImages = ref<ImageGeneration[]>([]);
const isSwitchingFrameType = ref(false); // 标志位：是否正在切换帧类型
const loadingImages = ref(false);
let pollingTimer: any = null;
let pollingFrameType: FrameType | null = null; // 记录正在轮询的帧类型

// 宫格图片编辑器状态
const showGridEditor = ref(false);

// 所有已生成的图片（用于宫格编辑器选择）
const allGeneratedImages = ref<ImageGeneration[]>([]);

// 图片裁剪对话框状态
const showCropDialog = ref(false);
const cropImageUrl = ref<string>("");
const cropImageData = ref<ImageGeneration | null>(null);

// 视频生成相关状态
const videoDuration = ref(5); // 默认5秒，会根据镜头duration自动更新
const selectedVideoFrameType = ref<FrameType>("first");
const selectedImagesForVideo = ref<number[]>([]);
const selectedLastImageForVideo = ref<number | null>(null);
const generatingVideo = ref(false);
const generatedVideos = ref<VideoGeneration[]>([]);
const videoAssets = ref<Asset[]>([]);
const loadingVideos = ref(false);
const timelineEditorRef = ref<InstanceType<typeof VideoTimelineEditor> | null>(
  null,
);
const videoReferenceImages = ref<ImageGeneration[]>([]);
const selectedVideoModel = ref<string>("");
const selectedReferenceMode = ref<string>(""); // 参考图模式：single, first_last, multiple, none
const previewImageUrl = ref<string>(""); // 预览大图的URL
const videoModelCapabilities = ref<VideoModelCapability[]>([]);
let videoPollingTimer: any = null;
let mergePollingTimer: any = null; // 视频合成列表轮询定时器

// 视频合成列表
const videoMerges = ref<VideoMerge[]>([]);
const loadingMerges = ref(false);

// 视频模型能力配置
interface VideoModelCapability {
  id: string;
  name: string;
  supportMultipleImages: boolean; // 支持多张图片
  supportFirstLastFrame: boolean; // 支持首尾帧
  supportSingleImage: boolean; // 支持单图
  supportTextOnly: boolean; // 支持纯文本
  maxImages: number; // 最多支持几张图片
}

// 模型能力默认配置（作为后备）
const defaultModelCapabilities: Record<
  string,
  Omit<VideoModelCapability, "id" | "name">
> = {
  kling: {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 1,
  },
  runway: {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: true,
    supportTextOnly: true,
    maxImages: 2,
  },
  pika: {
    supportSingleImage: true,
    supportMultipleImages: true,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 6,
  },
  "doubao-seedance-1-5-pro-251215": {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: true,
    supportTextOnly: true,
    maxImages: 2,
  },
  "doubao-seedance-1-0-lite-i2v-250428": {
    supportSingleImage: true,
    supportMultipleImages: true,
    supportFirstLastFrame: true,
    supportTextOnly: false,
    maxImages: 6,
  },
  "doubao-seedance-1-0-lite-t2v-250428": {
    supportSingleImage: false,
    supportMultipleImages: false,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 0,
  },
  "doubao-seedance-1-0-pro-250528": {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: true,
    supportTextOnly: true,
    maxImages: 2,
  },
  "doubao-seedance-1-0-pro-fast-251015": {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 1,
  },
  "sora-2": {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 1,
  },
  "sora-2-pro": {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: true,
    supportTextOnly: true,
    maxImages: 2,
  },
  "MiniMax-Hailuo-2.3": {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 1,
  },
  "MiniMax-Hailuo-2.3-Fast": {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 1,
  },
  "MiniMax-Hailuo-02": {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 1,
  },
};

// 从模型名称提取provider
const extractProviderFromModel = (modelName: string): string => {
  if (modelName.startsWith("doubao-") || modelName.startsWith("seedance")) {
    return "doubao";
  }
  if (modelName.startsWith("runway")) {
    return "runway";
  }
  if (modelName.startsWith("pika")) {
    return "pika";
  }
  if (
    modelName.startsWith("MiniMax-") ||
    modelName.toLowerCase().startsWith("minimax") ||
    modelName.startsWith("hailuo")
  ) {
    return "minimax";
  }
  if (modelName.startsWith("sora")) {
    return "openai";
  }
  if (modelName.startsWith("kling")) {
    return "kling";
  }

  // 默认返回doubao
  return "doubao";
};

// 加载视频AI配置
const loadVideoModels = async () => {
  try {
    const configs = await aiAPI.list("video");

    // 只显示启用的配置
    const activeConfigs = configs.filter((c) => c.is_active);

    // 展开模型列表并去重
    const allModels = activeConfigs
      .flatMap((config) => {
        const models = Array.isArray(config.model)
          ? config.model
          : [config.model];
        return models.map((modelName) => ({
          modelName,
          configName: config.name,
          priority: config.priority || 0,
        }));
      })
      .sort((a, b) => b.priority - a.priority);

    // 按模型名称去重
    const modelMap = new Map<
      string,
      { configName: string; priority: number }
    >();
    allModels.forEach((model) => {
      if (!modelMap.has(model.modelName)) {
        modelMap.set(model.modelName, {
          configName: model.configName,
          priority: model.priority,
        });
      }
    });

    // 构建模型能力列表
    videoModelCapabilities.value = Array.from(modelMap.keys()).map(
      (modelName) => {
        const capability = defaultModelCapabilities[modelName] || {
          supportSingleImage: true,
          supportMultipleImages: false,
          supportFirstLastFrame: false,
          supportTextOnly: true,
          maxImages: 1,
        };

        return {
          id: modelName,
          name: modelName,
          ...capability,
        };
      },
    );
  } catch (error: any) {
    console.error("加载视频模型配置失败:", error);
    ElMessage.error("加载视频模型失败");
  }
};

// 加载视频素材库
const loadVideoAssets = async () => {
  try {
    const result = await assetAPI.listAssets({
      drama_id: dramaId.toString(),
      episode_id: Number(episodeId.value) || undefined,
      type: "video",
      page: 1,
      page_size: 100,
    });
    // 检查数据结构并正确赋值
    videoAssets.value = result.items || [];
  } catch (error: any) {
    console.error("加载视频素材库失败:", error);
  }
};

// 当前模型能力
const currentModelCapability = computed(() => {
  return videoModelCapabilities.value.find(
    (m) => m.id === selectedVideoModel.value,
  );
});

// 当前模型支持的参考图模式
const availableReferenceModes = computed(() => {
  const capability = currentModelCapability.value;
  if (!capability) return [];

  const modes: Array<{ value: string; label: string; description?: string }> =
    [];

  if (capability.supportTextOnly) {
    modes.push({ value: "none", label: "纯文本", description: "不使用参考图" });
  }
  if (capability.supportSingleImage) {
    modes.push({
      value: "single",
      label: "单图",
      description: "使用单张参考图",
    });
  }
  if (capability.supportFirstLastFrame) {
    modes.push({
      value: "first_last",
      label: "首尾帧",
      description: "使用首帧和尾帧",
    });
  }
  if (capability.supportMultipleImages) {
    modes.push({
      value: "multiple",
      label: "多图",
      description: `最多${capability.maxImages}张`,
    });
  }

  return modes;
});

// 帧提示词存储key生成函数
const getPromptStorageKey = (
  storyboardId: string | number | undefined,
  frameType: FrameType,
) => {
  if (!storyboardId) return null;
  return `frame_prompt_${storyboardId}_${frameType}`;
};

const isCharacterSelected = (charId: number) => {
  return selectedCharacters.value.includes(charId);
};

const toggleCharacter = (charId: number) => {
  const index = selectedCharacters.value.indexOf(charId);
  if (index > -1) {
    selectedCharacters.value.splice(index, 1);
  } else {
    selectedCharacters.value.push(charId);
  }
};

const currentStoryboard = computed(() => {
  if (!currentStoryboardId.value) return null;
  return (
    storyboards.value.find(
      (s) => String(s.id) === String(currentStoryboardId.value),
    ) || null
  );
});

// 获取上一个镜头
const previousStoryboard = computed(() => {
  if (!currentStoryboardId.value || storyboards.value.length < 2) return null;
  const currentIndex = storyboards.value.findIndex(
    (s) => String(s.id) === String(currentStoryboardId.value),
  );
  if (currentIndex <= 0) return null;
  return storyboards.value[currentIndex - 1];
});

// 上一个镜头的尾帧图片列表（支持多个）
const previousStoryboardLastFrames = ref<any[]>([]);

// 加载上一个镜头的尾帧
const loadPreviousStoryboardLastFrame = async () => {
  if (!previousStoryboard.value) {
    previousStoryboardLastFrames.value = [];
    return;
  }
  try {
    const result = await imageAPI.listImages({
      storyboard_id: Number(previousStoryboard.value.id),
      frame_type: "last",
      page: 1,
      page_size: 10,
    });
    const images = result.items || [];
    previousStoryboardLastFrames.value = images.filter(
      (img: any) => img.status === "completed" && img.image_url,
    );
  } catch (error) {
    console.error("加载上一镜头尾帧失败:", error);
    previousStoryboardLastFrames.value = [];
  }
};

// 选择上一镜头尾帧作为首帧参考
const selectPreviousLastFrame = (img: any) => {
  // 检查是否已选中，已选中则取消
  const currentIndex = selectedImagesForVideo.value.indexOf(img.id);
  if (currentIndex > -1) {
    selectedImagesForVideo.value.splice(currentIndex, 1);
    ElMessage.success("已取消首帧参考");
    return;
  }

  // 参考handleImageSelect的逻辑，根据模式处理
  if (
    !selectedReferenceMode.value ||
    selectedReferenceMode.value === "single"
  ) {
    // 单图模式或未选模式：直接替换
    selectedImagesForVideo.value = [img.id];
  } else if (selectedReferenceMode.value === "first_last") {
    // 首尾帧模式：作为首帧参考
    selectedImagesForVideo.value = [img.id];
  } else if (selectedReferenceMode.value === "multiple") {
    // 多图模式：添加到列表
    const capability = currentModelCapability.value;
    if (
      capability &&
      selectedImagesForVideo.value.length >= capability.maxImages
    ) {
      ElMessage.warning(`最多只能选择${capability.maxImages}张图片`);
      return;
    }
    selectedImagesForVideo.value.push(img.id);
  }
  ElMessage.success("已添加为首帧参考");
};

// 监听帧类型切换，从存储中加载或清空
watch(selectedFrameType, (newType) => {
  // 切换帧类型时，停止之前的轮询，避免旧结果覆盖新帧类型
  stopPolling();

  if (!currentStoryboard.value) {
    currentFramePrompt.value = "";
    generatedImages.value = [];
    return;
  }

  // 设置切换标志，防止watch(currentFramePrompt)错误保存
  isSwitchingFrameType.value = true;

  // 优先从 sessionStorage 中加载该帧类型的提示词（确保数据准确）
  const storageKey = `frame_prompt_${currentStoryboard.value.id}_${newType}`;
  const stored = sessionStorage.getItem(storageKey);

  if (stored) {
    currentFramePrompt.value = stored;
    framePrompts.value[newType] = stored;
  } else {
    // 如果 sessionStorage 中没有，再尝试从 framePrompts 对象中读取
    currentFramePrompt.value = framePrompts.value[newType] || "";
  }

  // 重新加载该帧类型的图片
  loadStoryboardImages(currentStoryboard.value.id, newType);

  // 重置切换标志
  setTimeout(() => {
    isSwitchingFrameType.value = false;
  }, 0);
});

// 监听当前分镜切换，重置提示词
watch(currentStoryboard, async (newStoryboard) => {
  if (!newStoryboard) {
    currentFramePrompt.value = "";
    generatedImages.value = [];
    generatedVideos.value = [];
    videoReferenceImages.value = [];
    previousStoryboardLastFrames.value = [];
    return;
  }

  // 设置切换标志
  isSwitchingFrameType.value = true;

  // 清空 framePrompts 对象，避免显示上一个镜头的提示词
  framePrompts.value = {
    key: "",
    first: "",
    last: "",
    panel: "",
  };

  // 加载当前帧类型的提示词
  const storageKey = getPromptStorageKey(
    newStoryboard.id,
    selectedFrameType.value,
  );
  if (storageKey) {
    const stored = sessionStorage.getItem(storageKey);
    currentFramePrompt.value = stored || "";
    // 同时更新 framePrompts 对象
    if (stored) {
      framePrompts.value[selectedFrameType.value] = stored;
    }
  } else {
    currentFramePrompt.value = "";
  }

  // 重置切换标志
  setTimeout(() => {
    isSwitchingFrameType.value = false;
  }, 0);

  // 加载该分镜的图片列表（根据当前选择的帧类型）
  await loadStoryboardImages(newStoryboard.id, selectedFrameType.value);

  // 加载所有已生成的图片（用于宫格编辑器）
  await loadAllGeneratedImages();

  // 加载视频参考图片（所有帧类型）
  await loadVideoReferenceImages(newStoryboard.id);

  // 加载该分镜的视频列表
  await loadStoryboardVideos(newStoryboard.id);

  // 加载上一镜头的尾帧
  await loadPreviousStoryboardLastFrame();
});

// 监听提示词变化，自动保存到sessionStorage
watch(currentFramePrompt, (newPrompt) => {
  // 如果正在切换帧类型或分镜，不要保存（避免错误保存到新帧类型）
  if (isSwitchingFrameType.value) return;
  if (!currentStoryboard.value) return;

  const storageKey = getPromptStorageKey(
    currentStoryboard.value.id,
    selectedFrameType.value,
  );
  if (storageKey) {
    if (newPrompt) {
      sessionStorage.setItem(storageKey, newPrompt);
    } else {
      sessionStorage.removeItem(storageKey);
    }
  }
});

// 监听视频模型切换，清空已选图片和参考图模式
watch(selectedVideoModel, () => {
  selectedImagesForVideo.value = [];
  selectedLastImageForVideo.value = null;
  selectedReferenceMode.value = "";
});

// 监听镜头切换，自动更新视频时长
watch(currentStoryboard, (newStoryboard) => {
  if (newStoryboard?.duration) {
    // 如果镜头有duration字段，使用镜头的时长
    videoDuration.value = Math.round(newStoryboard.duration);
  } else {
    // 否则使用默认值5秒
    videoDuration.value = 5;
  }
});

// 监听参考图模式切换，清空已选图片
watch(selectedReferenceMode, () => {
  selectedImagesForVideo.value = [];
  selectedLastImageForVideo.value = null;
});

// 当前分镜的角色列表
const currentStoryboardCharacters = computed(() => {
  if (!currentStoryboard.value?.characters) return [];

  // currentStoryboard.characters 是角色对象数组
  if (
    Array.isArray(currentStoryboard.value.characters) &&
    currentStoryboard.value.characters.length > 0
  ) {
    const firstItem = currentStoryboard.value.characters[0];
    // 如果是对象数组（包含id和name），直接返回
    if (typeof firstItem === "object" && firstItem.id) {
      return currentStoryboard.value.characters;
    }
    // 如果是ID数组，从characters中查找匹配的角色
    if (typeof firstItem === "number") {
      return characters.value.filter((c) =>
        currentStoryboard.value!.characters!.includes(c.id as any),
      );
    }
  }

  return [];
});

// 可选择的角色列表
const availableCharacters = computed(() => {
  return characters.value || [];
});

// 可选择的道具列表
const availableProps = computed(() => {
  return props.value || [];
});

// 当前分镜的道具列表
const currentStoryboardProps = computed(() => {
  if (!currentStoryboard.value?.props) return [];
  return currentStoryboard.value.props;
});

// 检查道具是否在当前镜头中
const isPropInCurrentShot = (propId: number) => {
  if (!currentStoryboard.value?.props) return false;
  return currentStoryboard.value.props.some((p: any) => p.id === propId);
};

// 切换道具在镜头中的状态
const togglePropInShot = async (propId: number) => {
  if (!currentStoryboard.value) return;

  let newProps = [...(currentStoryboard.value.props || [])];
  if (isPropInCurrentShot(propId)) {
    newProps = newProps.filter((p: any) => p.id !== propId);
  } else {
    const prop = props.value.find((p) => p.id === propId);
    if (prop) {
      newProps.push(prop);
    }
  }

  // 乐观更新
  currentStoryboard.value.props = newProps;

  try {
    const propIds = newProps.map((p: any) => p.id);
    await propAPI.associateWithStoryboard(
      Number(currentStoryboard.value.id),
      propIds,
    );
  } catch (error) {
    ElMessage.error($t("editor.updatePropFailed"));
  }
};

// 检查角色是否已在当前镜头中
const isCharacterInCurrentShot = (charId: number) => {
  if (!currentStoryboard.value?.characters) return false;

  if (
    Array.isArray(currentStoryboard.value.characters) &&
    currentStoryboard.value.characters.length > 0
  ) {
    const firstItem = currentStoryboard.value.characters[0];
    if (typeof firstItem === "object" && (firstItem as any).id) {
      return currentStoryboard.value.characters.some((c: any) => c.id === charId);
    }
    if (typeof firstItem === "number") {
      return (currentStoryboard.value.characters as any[]).includes(charId);
    }
  }

  return false;
};

// 切换角色在镜头中的状态
const showCharacterImage = (char: any) => {
  previewCharacter.value = char;
  showCharacterImagePreview.value = true;
};

// 展示场景大图
const showSceneImage = () => {
  if (currentStoryboard.value?.background?.image_url) {
    showSceneImagePreview.value = true;
  }
};

// 保存分镜字段
const saveStoryboardField = async (fieldName: string) => {
  if (!currentStoryboard.value) return;
  try {
    const updateData: any = {};
    updateData[fieldName] = (currentStoryboard.value as any)[fieldName];

    await dramaAPI.updateStoryboard(
      currentStoryboard.value.id.toString(),
      updateData,
    );
  } catch (error: any) {
    ElMessage.error("保存失败: " + (error.message || "未知错误"));
  }
};

// 提取帧提示词
// 提取帧提示词
const extractFramePrompt = async () => {
  if (!currentStoryboard.value) return;

  const storyboardId = currentStoryboard.value.id;
  // 记录点击时的帧类型，后续任务完成时用于判断是否需要更新当前显示
  const targetFrameType = selectedFrameType.value;

  if (targetFrameType === "panel") {
    // 如果是分镜板模式，还需要捕获当前的panelCount
    // 注意：这里简单起见使用当前的panelCount，理想情况下应该传递参数或锁定UI
  }

  // 设置当前镜头的生成状态为true
  const stateKey = `${storyboardId}_${targetFrameType}`;
  generatingPromptStates.value[stateKey] = true;

  try {
    const params: any = { frame_type: targetFrameType };
    if (targetFrameType === "panel") {
      params.panel_count = panelCount.value;
    }

    const { task_id } = await generateFramePrompt(Number(storyboardId), params);

    // 轮询任务状态（独立函数，不依赖组件当前状态）
    const pollTask = async () => {
      while (true) {
        const task = await taskAPI.getStatus(task_id);
        if (task.status === "completed") {
          let result = task.result;
          if (typeof result === "string") {
            try {
              result = JSON.parse(result);
            } catch (e) {
              console.error("Failed to parse task result", e);
              throw new Error("解析任务结果失败");
            }
          }
          return (result as any).response;
        } else if (task.status === "failed") {
          throw new Error(task.message || task.error || "生成失败");
        }
        // 等待1秒后继续轮询
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    };

    const result: any = await pollTask();

    // 根据返回结果构建提示词字符串
    let extractedPrompt = "";
    if (result.single_frame) {
      extractedPrompt = result.single_frame.prompt;
    } else if (result.multi_frame && result.multi_frame.frames) {
      // 多帧情况，将所有帧的prompt合并
      extractedPrompt = result.multi_frame.frames
        .map((frame: any) => frame.prompt)
        .join("\n\n");
    }

    // 更新存储（这一步必须做，无论用户是否还在当前页面）
    // 更新 session storage
    const storageKey = getPromptStorageKey(storyboardId, targetFrameType);
    if (storageKey) {
      sessionStorage.setItem(storageKey, extractedPrompt);
    }

    // 如果任务完成时，用户当前的选中状态正好是该镜头+该类型，则立即更新显示
    if (
      currentStoryboard.value &&
      currentStoryboard.value.id === storyboardId &&
      selectedFrameType.value === targetFrameType
    ) {
      currentFramePrompt.value = extractedPrompt;
      framePrompts.value[targetFrameType] = extractedPrompt;
    }

    // 更新内存缓存（稍微复杂点，framePrompts 是响应式的且绑定当前镜头，这里只做sessionStorage持久化即可，
    // 因为切换镜头时会重新读取sessionStorage。
    // 但为了确保如果用户没切走也能看到，上面已经更新了 currentFramePrompt

    ElMessage.success(`${getFrameTypeLabel(targetFrameType)}提示词提取成功`);
  } catch (error: any) {
    ElMessage.error("提取失败: " + (error.message || "未知错误"));
  } finally {
    // 清除该镜头的生成状态
    const stateKey = `${storyboardId}_${targetFrameType}`;
    if (generatingPromptStates.value[stateKey]) {
      generatingPromptStates.value[stateKey] = false;
    }
  }
};

// 检查是否正在生成提示词
const isGeneratingPrompt = (
  storyboardId: string | number | undefined,
  frameType: string,
) => {
  if (!storyboardId) return false;
  return !!generatingPromptStates.value[`${storyboardId}_${frameType}`];
};

// 获取帧类型的中文标签
const getFrameTypeLabel = (frameType: string): string => {
  const labels: Record<string, string> = {
    key: "关键帧",
    first: "首帧",
    last: "尾帧",
    panel: "分镜版",
  };
  return labels[frameType] || frameType;
};

// 加载分镜的图片列表
const loadStoryboardImages = async (
  storyboardId: string | number,
  frameType?: string,
) => {
  loadingImages.value = true;
  try {
    const params: any = {
      storyboard_id: Number(storyboardId),
      page: 1,
      page_size: 50,
    };
    // 如果指定了帧类型，添加过滤
    if (frameType) {
      params.frame_type = frameType;
    }
    const result = await imageAPI.listImages(params);
    generatedImages.value = result.items || [];

    // 如果有进行中的任务，启动轮询
    const hasPendingOrProcessing = generatedImages.value.some(
      (img) => img.status === "pending" || img.status === "processing",
    );
    if (hasPendingOrProcessing) {
      startPolling();
    }
  } catch (error: any) {
    console.error("加载图片列表失败:", error);
  } finally {
    loadingImages.value = false;
  }
};

// 启动状态轮询
const startPolling = () => {
  if (pollingTimer) return;

  // 记录开始轮询时的帧类型
  pollingFrameType = selectedFrameType.value;

  pollingTimer = setInterval(async () => {
    if (!currentStoryboard.value) {
      stopPolling();
      return;
    }

    // 如果帧类型已切换，停止轮询（防止更新到错误的帧类型）
    if (selectedFrameType.value !== pollingFrameType) {
      stopPolling();
      return;
    }

    try {
      const params: any = {
        storyboard_id: Number(currentStoryboard.value.id),
        page: 1,
        page_size: 50,
      };
      // 使用轮询开始时记录的帧类型
      if (pollingFrameType) {
        params.frame_type = pollingFrameType;
      }
      const result = await imageAPI.listImages(params);

      // 再次检查帧类型是否仍然匹配，避免竞态条件
      if (selectedFrameType.value === pollingFrameType) {
        generatedImages.value = result.items || [];
      }

      // 如果没有进行中的任务，停止轮询并刷新视频参考图片
      const hasPendingOrProcessing = (result.items || []).some(
        (img: any) => img.status === "pending" || img.status === "processing",
      );
      if (!hasPendingOrProcessing) {
        stopPolling();
        // 刷新视频参考图片列表
        if (currentStoryboard.value) {
          loadVideoReferenceImages(currentStoryboard.value.id);
        }
      }
    } catch (error) {
      console.error("轮询图片状态失败:", error);
    }
  }, 3000); // 每3秒轮询一次
};

// 停止轮询
const stopPolling = () => {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
  pollingFrameType = null;
};

// 生成图片
const generateFrameImage = async () => {
  if (!currentStoryboard.value || !currentFramePrompt.value) return;

  generatingImage.value = true;
  try {
    // 收集参考图片的 local_path
    const referenceImages: string[] = [];

    // 1. 添加场景图片（从background字段获取 local_path）
    if (currentStoryboard.value.background?.local_path) {
      referenceImages.push(currentStoryboard.value.background.local_path);
    }

    // 2. 添加当前镜头登场的角色图片（使用 local_path）
    const storyboardCharacters = currentStoryboardCharacters.value;
    if (storyboardCharacters && storyboardCharacters.length > 0) {
      storyboardCharacters.forEach((char: any) => {
        if (char.local_path) {
          referenceImages.push(char.local_path);
        }
      });
    }

    const result = await imageAPI.generateImage({
      drama_id: dramaId.toString(),
      prompt: currentFramePrompt.value,
      storyboard_id: Number(currentStoryboard.value.id),
      image_type: "storyboard",
      frame_type: selectedFrameType.value,
      reference_images:
        referenceImages.length > 0 ? referenceImages : undefined,
    });

    generatedImages.value.unshift(result);

    // 提示信息
    const refMsg =
      referenceImages.length > 0
        ? ` (已添加${referenceImages.length}张参考图)`
        : "";
    ElMessage.success(`图片生成任务已提交${refMsg}`);

    // 启动轮询
    startPolling();
  } catch (error: any) {
    ElMessage.error("生成失败: " + (error.message || "未知错误"));
  } finally {
    generatingImage.value = false;
  }
};

// 获取状态标签类型
const getStatusType = (status: string) => {
  const statusMap: Record<string, any> = {
    pending: "info",
    processing: "warning",
    completed: "success",
    failed: "danger",
  };
  return statusMap[status] || "info";
};

// 播放视频
const playVideo = (video: VideoGeneration) => {
  previewVideo.value = video;
  showVideoPreview.value = true;
};

// 添加视频到素材库
const addVideoToAssets = async (video: VideoGeneration) => {
  if (video.status !== "completed" || !video.video_url) {
    ElMessage.warning("只能添加已完成的视频到素材库");
    return;
  }

  addingToAssets.value.add(video.id);

  try {
    // 检查该镜头是否已存在素材
    let isReplacing = false;
    if (video.storyboard_id) {
      const existingAsset = videoAssets.value.find(
        (asset: any) => asset.storyboard_id === video.storyboard_id,
      );

      if (existingAsset) {
        isReplacing = true;
        // 自动替换：先删除旧素材
        try {
          await assetAPI.deleteAsset(existingAsset.id);
        } catch (error) {
          console.error("删除旧素材失败:", error);
        }
      }
    }

    // 添加新素材
    await assetAPI.importFromVideo(video.id);
    ElMessage.success("已添加到素材库");

    // 重新加载素材库列表
    await loadVideoAssets();

    // 如果是替换操作，更新时间线中使用该分镜的所有视频片段
    if (isReplacing && video.storyboard_id && video.video_url) {
      if (timelineEditorRef.value) {
        timelineEditorRef.value.updateClipsByStoryboardId(
          video.storyboard_id,
          video.video_url,
        );
      } else {
        console.warn("⚠️ timelineEditorRef.value 为空，无法更新时间线");
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || "添加失败");
  } finally {
    addingToAssets.value.delete(video.id);
  }
};

// 删除视频
const handleDeleteVideo = async (video: VideoGeneration) => {
  if (!currentStoryboard.value) return;

  try {
    await ElMessageBox.confirm(
      "确定要删除这个视频吗？删除后无法恢复。",
      "确认删除",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      },
    );

    await videoAPI.deleteVideo(video.id);
    ElMessage.success("删除成功");

    // 重新加载当前镜头的视频列表
    await loadStoryboardVideos(Number(currentStoryboard.value.id));
  } catch (error: any) {
    if (error !== "cancel") {
      console.error("删除视频失败:", error);
      ElMessage.error(error.message || "删除失败");
    }
  }
};

// 获取状态中文文本
const getStatusText = (status: string) => {
  const statusTextMap: Record<string, string> = {
    pending: "等待中",
    processing: "生成中",
    completed: "已完成",
    failed: "失败",
  };
  return statusTextMap[status] || status;
};

// 获取帧类型中文文本
const getFrameTypeText = (frameType?: string) => {
  if (!frameType) return "";
  const frameTypeMap: Record<string, string> = {
    first: "首帧",
    key: "关键帧",
    last: "尾帧",
    panel: "分镜板",
    action: "动作序列",
  };
  return frameTypeMap[frameType] || frameType;
};

// 获取分镜缩略图
const getStoryboardThumbnail = (storyboard: any) => {
  // 优先使用composed_image
  if (storyboard.composed_image) {
    return storyboard.composed_image;
  }

  // 如果没有composed_image，从image_url字段获取
  if (storyboard.image_url) {
    return storyboard.image_url;
  }

  return null;
};

// 处理图片选择（根据模型能力）
const handleImageSelect = (imageId: number) => {
  if (!selectedReferenceMode.value) {
    ElMessage.warning("请先选择参考图模式");
    return;
  }

  if (!currentModelCapability.value) {
    ElMessage.warning("请先选择视频生成模型");
    return;
  }

  const capability = currentModelCapability.value;
  const currentIndex = selectedImagesForVideo.value.indexOf(imageId);

  // 已选中，则取消选择
  if (currentIndex > -1) {
    selectedImagesForVideo.value.splice(currentIndex, 1);
    return;
  }

  // 获取当前点击的图片对象
  const clickedImage = videoReferenceImages.value.find(
    (img) => img.id === imageId,
  );
  if (!clickedImage) return;

  // 根据选择的参考图模式处理
  switch (selectedReferenceMode.value) {
    case "single":
      // 单图模式：只能选1张，直接替换
      selectedImagesForVideo.value = [imageId];
      break;

    case "first_last":
      // 首尾帧模式：根据图片类型分别处理
      const frameType = clickedImage.frame_type;

      if (
        frameType === "first" ||
        frameType === "panel" ||
        frameType === "key"
      ) {
        // 首帧：直接替换
        selectedImagesForVideo.value = [imageId];
      } else if (frameType === "last") {
        // 尾帧：设置到单独的变量
        selectedLastImageForVideo.value = imageId;
      } else {
        ElMessage.warning("首尾帧模式下，请选择首帧或尾帧类型的图片");
      }
      break;

    case "multiple":
      // 多图模式：检查是否超出最大数量
      if (selectedImagesForVideo.value.length >= capability.maxImages) {
        ElMessage.warning(`最多只能选择${capability.maxImages}张图片`);
        return;
      }
      selectedImagesForVideo.value.push(imageId);
      break;

    default:
      ElMessage.warning("未知的参考图模式");
  }
};

// 预览图片（使用已导入的 getImageUrl 工具函数来获取正确的图片URL）
const previewImage = (url: string) => {
  // 使用Element Plus的图片预览
  const viewer = document.createElement("div");
  viewer.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 9999; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center;" onclick="this.remove()">
      <img src="${url}" style="max-width: 90vw; max-height: 90vh; object-fit: contain;" onclick="event.stopPropagation();" />
    </div>
  `;
  document.body.appendChild(viewer);
};

// 获取已选图片对象列表
const selectedImageObjects = computed(() => {
  return selectedImagesForVideo.value
    .map((id) => videoReferenceImages.value.find((img) => img.id === id))
    .filter((img): img is ImageGeneration => !!(img && img.image_url));
});

// 首尾帧模式：获取首帧图片
const firstFrameSlotImage = computed(() => {
  if (selectedImagesForVideo.value.length === 0) return null;
  const firstImageId = selectedImagesForVideo.value[0];
  // 同时搜索当前镜头图片和上一镜头尾帧
  return (
    videoReferenceImages.value.find((img) => img.id === firstImageId) ||
    previousStoryboardLastFrames.value.find((img) => img.id === firstImageId)
  );
});

// 首尾帧模式：获取尾帧图片
const lastFrameSlotImage = computed(() => {
  if (!selectedLastImageForVideo.value) return null;
  // 同时搜索当前镜头图片和上一镜头尾帧
  return (
    videoReferenceImages.value.find(
      (img) => img.id === selectedLastImageForVideo.value,
    ) ||
    previousStoryboardLastFrames.value.find(
      (img) => img.id === selectedLastImageForVideo.value,
    )
  );
});

// 移除已选择的图片
const removeSelectedImage = (imageId: number) => {
  // 检查是否是尾帧
  if (selectedLastImageForVideo.value === imageId) {
    selectedLastImageForVideo.value = null;
    return;
  }

  // 检查是否是首帧或其他图片
  const index = selectedImagesForVideo.value.indexOf(imageId);
  if (index > -1) {
    selectedImagesForVideo.value.splice(index, 1);
  }
};

// 生成视频
const generateVideo = async () => {
  if (!selectedVideoModel.value) {
    ElMessage.warning("请先选择视频生成模型");
    return;
  }

  if (!currentStoryboard.value) {
    ElMessage.warning("请先选择分镜");
    return;
  }

  // 检查参考图模式
  if (
    selectedReferenceMode.value !== "none" &&
    selectedImagesForVideo.value.length === 0
  ) {
    ElMessage.warning("请选择参考图片");
    return;
  }

  // 获取第一张选中的图片（仅在需要图片的模式下）
  let selectedImage = null;
  if (
    selectedReferenceMode.value !== "none" &&
    selectedImagesForVideo.value.length > 0
  ) {
    // 同时搜索当前镜头图片和上一镜头尾帧
    selectedImage =
      videoReferenceImages.value.find(
        (img) => img.id === selectedImagesForVideo.value[0],
      ) ||
      previousStoryboardLastFrames.value.find(
        (img) => img.id === selectedImagesForVideo.value[0],
      );
    if (!selectedImage || !selectedImage.image_url) {
      ElMessage.error("请选择有效的参考图片");
      return;
    }
  }

  generatingVideo.value = true;
  try {
    // 从模型名称提取正确的provider
    const provider = extractProviderFromModel(selectedVideoModel.value);

    // 构建请求参数
    const requestParams: any = {
      drama_id: dramaId.toString(),
      storyboard_id: Number(currentStoryboard.value.id),
      prompt:
        currentStoryboard.value.video_prompt ||
        currentStoryboard.value.action ||
        currentStoryboard.value.description ||
        "",
      duration: videoDuration.value,
      provider: provider,
      model: selectedVideoModel.value,
      reference_mode: selectedReferenceMode.value,
    };

    // 根据参考图模式设置参数
    switch (selectedReferenceMode.value) {
      case "single":
        // 单图模式 - 优先使用 local_path
        if (selectedImage.local_path) {
          requestParams.image_local_path = selectedImage.local_path;
        } else if (selectedImage.image_url) {
          requestParams.image_url = selectedImage.image_url;
        }
        requestParams.image_gen_id = selectedImage.id;
        break;

      case "first_last":
        // 首尾帧模式（同时搜索当前镜头图片和上一镜头尾帧）
        const firstImage =
          videoReferenceImages.value.find(
            (img) => img.id === selectedImagesForVideo.value[0],
          ) ||
          previousStoryboardLastFrames.value.find(
            (img) => img.id === selectedImagesForVideo.value[0],
          );
        const lastImage =
          videoReferenceImages.value.find(
            (img) => img.id === selectedLastImageForVideo.value,
          ) ||
          previousStoryboardLastFrames.value.find(
            (img) => img.id === selectedLastImageForVideo.value,
          );

        // 优先使用 local_path
        if (firstImage?.local_path) {
          requestParams.first_frame_local_path = firstImage.local_path;
        } else if (firstImage?.image_url) {
          requestParams.first_frame_url = firstImage.image_url;
        }
        if (lastImage?.local_path) {
          requestParams.last_frame_local_path = lastImage.local_path;
        } else if (lastImage?.image_url) {
          requestParams.last_frame_url = lastImage.image_url;
        }
        break;

      case "multiple":
        // 多图模式 - 优先使用 local_path
        const selectedImages = selectedImagesForVideo.value
          .map((id) => videoReferenceImages.value.find((img) => img.id === id))
          .filter((img) => img?.local_path || img?.image_url)
          .map((img) => img!.local_path || img!.image_url);
        requestParams.reference_image_urls = selectedImages;
        break;

      case "none":
        // 无参考图模式
        break;
    }

    const result = await videoAPI.generateVideo(requestParams);

    generatedVideos.value.unshift(result);
    ElMessage.success("视频生成任务已提交");

    // 启动视频轮询
    startVideoPolling();
  } catch (error: any) {
    ElMessage.error("生成失败: " + (error.message || "未知错误"));
  } finally {
    generatingVideo.value = false;
  }
};

// 加载分镜的视频参考图片（所有帧类型）
const loadVideoReferenceImages = async (storyboardId: string | number) => {
  try {
    const result = await imageAPI.listImages({
      storyboard_id: Number(storyboardId),
      page: 1,
      page_size: 100,
    });
    videoReferenceImages.value = result.items || [];
  } catch (error: any) {
    console.error("加载视频参考图片失败:", error);
  }
};

// 加载分镜的视频列表
const loadStoryboardVideos = async (storyboardId: string | number) => {
  loadingVideos.value = true;
  try {
    const result = await videoAPI.listVideos({
      storyboard_id: storyboardId.toString(),
      page: 1,
      page_size: 50,
    });
    generatedVideos.value = result.items || [];

    // 如果有进行中的任务，启动轮询
    const hasPendingOrProcessing = generatedVideos.value.some(
      (v) => v.status === "pending" || v.status === "processing",
    );
    if (hasPendingOrProcessing) {
      startVideoPolling();
    }
  } catch (error: any) {
    console.error("加载视频列表失败:", error);
  } finally {
    loadingVideos.value = false;
  }
};

// 启动视频状态轮询
const startVideoPolling = () => {
  if (videoPollingTimer) return;

  videoPollingTimer = setInterval(async () => {
    if (!currentStoryboard.value) {
      stopVideoPolling();
      return;
    }

    try {
      // 保存旧的视频列表用于对比
      const oldVideos = [...generatedVideos.value];

      const result = await videoAPI.listVideos({
        storyboard_id: currentStoryboard.value.id.toString(),
        page: 1,
        page_size: 50,
      });
      generatedVideos.value = result.items || [];

      // 检测是否有视频从 processing 变为 completed
      const hasNewlyCompleted = generatedVideos.value.some((newVideo) => {
        const oldVideo = oldVideos.find((v) => v.id === newVideo.id);
        return (
          oldVideo &&
          (oldVideo.status === "pending" || oldVideo.status === "processing") &&
          newVideo.status === "completed"
        );
      });

      // 如果有视频完成，重新加载分镜列表以更新 duration
      if (hasNewlyCompleted && episodeId.value) {
        try {
          const storyboardsRes = await dramaAPI.getStoryboards(
            episodeId.value.toString(),
          );
          storyboards.value = (storyboardsRes as any)?.storyboards || [];
        } catch (error) {
          console.error("重新加载分镜列表失败:", error);
        }
      }

      // 如果没有进行中的任务，停止轮询
      const hasPendingOrProcessing = generatedVideos.value.some(
        (v) => v.status === "pending" || v.status === "processing",
      );
      if (!hasPendingOrProcessing) {
        stopVideoPolling();
      }
    } catch (error) {
      console.error("轮询视频状态失败:", error);
    }
  }, 5000); // 每5秒轮询一次
};

// 停止视频轮询
const stopVideoPolling = () => {
  if (videoPollingTimer) {
    clearInterval(videoPollingTimer);
    videoPollingTimer = null;
  }
};

const toggleCharacterInShot = async (charId: number) => {
  if (!currentStoryboard.value) return;

  // 初始化characters数组
  if (!currentStoryboard.value.characters) {
    currentStoryboard.value.characters = [];
  }

  const char = characters.value.find((c) => c.id === charId);
  if (!char) return;

  // 检查是否已存在
  const existIndex = currentStoryboard.value.characters.findIndex((c) =>
    typeof c === "object" ? c.id === charId : Number(c) === charId,
  );

  if (existIndex > -1) {
    // 移除角色
    currentStoryboard.value.characters.splice(existIndex, 1);
  } else {
    // 添加角色（作为对象）
    currentStoryboard.value.characters.push(char);
  }

  // 保存到后端
  try {
    const characterIds = currentStoryboard.value.characters.map((c) =>
      typeof c === "object" ? c.id : Number(c),
    );

    await dramaAPI.updateStoryboard(currentStoryboard.value.id.toString(), {
      character_ids: characterIds,
    });

    if (existIndex > -1) {
      ElMessage.success(`已移除角色: ${char.name}`);
    } else {
      ElMessage.success(`已添加角色: ${char.name}`);
    }
  } catch (error: any) {
    ElMessage.error("保存失败: " + (error.message || "未知错误"));
    // 回滚操作
    if (existIndex > -1) {
      currentStoryboard.value.characters.push(char);
    } else {
      currentStoryboard.value.characters.splice(
        currentStoryboard.value.characters.length - 1,
        1,
      );
    }
  }
};

const removeCharacterFromShot = async (charId: number) => {
  if (!currentStoryboard.value) return;

  // 初始化characters数组
  if (!currentStoryboard.value.characters) {
    currentStoryboard.value.characters = [];
  }

  const char = characters.value.find((c) => c.id === charId);
  if (!char) return;

  // 检查是否已存在
  const existIndex = currentStoryboard.value.characters.findIndex((c) =>
    typeof c === "object" ? c.id === charId : Number(c) === charId,
  );

  if (existIndex > -1) {
    // 移除角色
    currentStoryboard.value.characters.splice(existIndex, 1);
  }

  // 保存到后端
  try {
    const characterIds = currentStoryboard.value.characters.map((c) =>
      typeof c === "object" ? c.id : Number(c),
    );

    await dramaAPI.updateStoryboard(currentStoryboard.value.id.toString(), {
      character_ids: characterIds,
    });

    ElMessage.success(`已移除角色: ${char.name}`);
  } catch (error: any) {
    ElMessage.error("保存失败: " + (error.message || "未知错误"));
    // 回滚操作
    currentStoryboard.value.characters.push(char);
  }
};

const loadData = async () => {
  try {
    // 加载剧集信息
    const dramaRes = await dramaAPI.get(dramaId.toString());
    drama.value = dramaRes;

    // 找到当前章节
    const ep = dramaRes.episodes?.find(
      (e) => e.episode_number === episodeNumber,
    );
    if (!ep) {
      ElMessage.error("章节不存在");
      router.back();
      return;
    }

    episode.value = ep;
    episodeId.value = ep.id;

    // 加载分镜列表
    const storyboardsRes = await dramaAPI.getStoryboards(ep.id.toString());

    // API返回格式: {storyboards: [...], total: number}
    storyboards.value = (storyboardsRes as any)?.storyboards || [];

    // 默认选中第一个分镜
    if (storyboards.value.length > 0 && !currentStoryboardId.value) {
      currentStoryboardId.value = storyboards.value[0].id;
    }

    // 加载角色列表
    characters.value = dramaRes.characters || [];

    // 加载可用场景列表
    availableScenes.value = dramaRes.scenes || [];

    // 加载道具列表
    props.value = dramaRes.props || [];

    // 加载视频素材库
    await loadVideoAssets();
  } catch (error: any) {
    ElMessage.error("加载数据失败: " + (error.message || "未知错误"));
  }
};

const selectScene = async (sceneId: number) => {
  if (!currentStoryboard.value) return;

  try {
    // TODO: 调用API更新分镜的scene_id
    await dramaAPI.updateStoryboard(currentStoryboard.value.id.toString(), {
      scene_id: String(sceneId),
    });

    // 重新加载数据
    await loadData();
    showSceneSelector.value = false;
    ElMessage.success("场景关联成功");
  } catch (error: any) {
    ElMessage.error(error.message || "场景关联失败");
  }
};

const selectStoryboard = (id: string) => {
  currentStoryboardId.value = id;
};

const handleTimelineSelect = (sceneId: number) => {
  selectStoryboard(String(sceneId));
};

const togglePlay = () => {
  if (currentPlayState.value === "playing") {
    currentPlayState.value = "paused";
  } else {
    currentPlayState.value = "playing";
  }
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

const openInNewTab = (url?: string) => {
  if (url) window.open(url, '_blank');
};

const zoomIn = () => {
  ElMessage.info("时间线缩放功能开发中");
};

const zoomOut = () => {
  ElMessage.info("时间线缩放功能开发中");
};

const generateImage = async () => {
  if (!currentStoryboard.value) return;

  try {
    ElMessage.info("图片生成功能开发中");
  } catch (error: any) {
    ElMessage.error(error.message || "生成失败");
  }
};

const uploadImage = () => {
  if (!currentStoryboard.value) {
    ElMessage.warning("请先选择镜头");
    return;
  }

  // 创建隐藏的文件输入
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.onchange = async (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    // 验证文件大小 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      ElMessage.error("图片大小不能超过 10MB");
      return;
    }

    try {
      // 创建 FormData
      const formData = new FormData();
      formData.append("file", file);

      // 上传到服务器
      const response = await fetch("/api/v1/upload/image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("上传失败");
      }

      const result = await response.json();
      const imageUrl = result.data?.url;

      if (imageUrl && currentStoryboard.value) {
        // 创建图片生成记录（关联到当前镜头和帧类型）
        await imageAPI.uploadImage({
          storyboard_id: Number(currentStoryboard.value.id),
          drama_id: Number(dramaId),
          frame_type: selectedFrameType.value || "first",
          image_url: imageUrl,
          prompt: currentFramePrompt.value || "用户上传图片",
        });

        // 刷新图片列表
        await loadStoryboardImages(
          currentStoryboard.value.id,
          selectedFrameType.value,
        );

        ElMessage.success("图片上传成功");
      }
    } catch (error: any) {
      console.error("上传图片失败:", error);
      ElMessage.error(error.message || "上传失败");
    }
  };
  input.click();
};

// 删除图片
const handleDeleteImage = async (img: ImageGeneration) => {
  if (!currentStoryboard.value) return;

  try {
    await ElMessageBox.confirm("确定要删除这张图片吗？", "确认删除", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
    });

    await imageAPI.deleteImage(img.id);
    ElMessage.success("删除成功");

    // 重新加载当前帧类型的图片列表
    await loadStoryboardImages(
      currentStoryboard.value.id,
      selectedFrameType.value,
    );
  } catch (error: any) {
    if (error !== "cancel") {
      console.error("删除图片失败:", error);
      ElMessage.error(error.message || "删除失败");
    }
  }
};

// 加载所有已生成的图片（用于宫格编辑器）
const loadAllGeneratedImages = async () => {
  if (!currentStoryboard.value) return;

  try {
    const result = await imageAPI.listImages({
      storyboard_id: Number(currentStoryboard.value.id),
      page: 1,
      page_size: 100,
    });
    allGeneratedImages.value = result.items || [];
  } catch (error: any) {
    console.error("加载所有图片失败:", error);
  }
};

// 处理宫格图片创建成功
const handleGridImageSuccess = async () => {
  if (currentStoryboard.value) {
    // 刷新动作序列图片列表
    await loadStoryboardImages(currentStoryboard.value.id, "action");
    // 重新加载所有图片
    await loadAllGeneratedImages();
  }
};

// 打开裁剪对话框
const openCropDialog = (img: ImageGeneration) => {
  cropImageData.value = img;
  cropImageUrl.value = getImageUrl(img) || "";
  showCropDialog.value = true;
};

// 处理裁剪保存
const handleCropSave = async (images: { blob: Blob; frameType: string }[]) => {
  if (!currentStoryboard.value || !cropImageData.value) return;

  try {
    // 将 Blob 转换为 base64 data URL
    const convertBlobToBase64 = (blob: Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    };

    // 上传裁剪后的图片并创建新的图片生成记录
    for (const img of images) {
      // 将 Blob 转换为 base64
      const imageUrl = await convertBlobToBase64(img.blob);

      // 调用上传接口
      await imageAPI.uploadImage({
        storyboard_id: Number(currentStoryboard.value.id),
        drama_id: Number(dramaId),
        frame_type: img.frameType,
        image_url: imageUrl,
        prompt: cropImageData.value.prompt || "",
      });
    }

    ElMessage.success("裁剪图片保存成功");

    // 刷新图片列表 - 刷新所有帧类型的图片，确保新裁剪的图片能在视频生成tab中被选择到
    if (currentStoryboard.value) {
      // 刷新当前镜头的所有图片（不限制帧类型）
      await loadStoryboardImages(currentStoryboard.value.id);
      // 刷新所有生成的图片列表
      await loadAllGeneratedImages();
    }
  } catch (error) {
    console.error("Failed to save cropped images:", error);
    ElMessage.error("保存裁剪图片失败");
  }
};

const goBack = () => {
  router.replace({
    name: "EpisodeWorkflowNew",
    params: { id: dramaId, episodeNumber },
  });
};

const handleAddStoryboard = async () => {
  if (!episodeId.value) return;

  try {
    const nextShotNumber =
      storyboards.value.length > 0
        ? Math.max(...storyboards.value.map((s) => s.storyboard_number)) + 1
        : 1;

    await dramaAPI.createStoryboard({
      episode_id: Number(episodeId.value),
      storyboard_number: nextShotNumber,
      title: `镜头 ${nextShotNumber}`,
      description: "新镜头描述",
      action: "动作描述",
      dialogue: "",
      duration: 5,
      scene_id:
        storyboards.value.length > 0
          ? Number(storyboards.value[storyboards.value.length - 1].scene_id)
          : undefined,
    });

    ElMessage.success("添加分镜成功");
    await loadData(); // Refresh list

    // Select the new storyboard (the last one)
    if (storyboards.value.length > 0) {
      selectStoryboard(storyboards.value[storyboards.value.length - 1].id);
    }
  } catch (error: any) {
    console.error("添加分镜失败:", error);
    ElMessage.error(error.message || "添加分镜失败");
  }
};

const handleDeleteStoryboard = async (storyboard: any) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除镜头 ${storyboard.storyboard_number} 吗？此操作不可恢复。`,
      "删除确认",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      },
    );

    await dramaAPI.deleteStoryboard(storyboard.id);
    ElMessage.success("删除分镜成功");

    // If deleted current storyboard, clear selection or select another
    if (currentStoryboardId.value === storyboard.id) {
      currentStoryboardId.value = null;
    }

    await loadData();
  } catch (error: any) {
    if (error !== "cancel") {
      console.error("删除分镜失败:", error);
      ElMessage.error(error.message || "删除分镜失败");
    }
  }
};

// 加载视频合成列表
const loadVideoMerges = async () => {
  if (!episodeId.value) return;

  try {
    loadingMerges.value = true;
    const result = await videoMergeAPI.listMerges({
      episode_id: episodeId.value.toString(),
      page: 1,
      page_size: 20,
    });
    videoMerges.value = result.merges;

    // 检查是否有进行中的任务
    const hasProcessingTasks = result.merges.some(
      (merge: any) =>
        merge.status === "pending" || merge.status === "processing",
    );

    if (hasProcessingTasks) {
      startMergePolling();
    } else {
      stopMergePolling();
    }
  } catch (error: any) {
    console.error("加载视频合成列表失败:", error);
    ElMessage.error("加载视频合成列表失败");
  } finally {
    loadingMerges.value = false;
  }
};

// 启动视频合成列表轮询
const startMergePolling = () => {
  if (mergePollingTimer) return;

  mergePollingTimer = setInterval(async () => {
    if (!episodeId.value) {
      stopMergePolling();
      return;
    }

    try {
      const result = await videoMergeAPI.listMerges({
        episode_id: episodeId.value.toString(),
        page: 1,
        page_size: 20,
      });
      videoMerges.value = result.merges;

      // 检查是否还有进行中的任务
      const hasProcessingTasks = result.merges.some(
        (merge: any) =>
          merge.status === "pending" || merge.status === "processing",
      );

      if (!hasProcessingTasks) {
        stopMergePolling();
      }
    } catch (error) {}
  }, 3000); // 每3秒轮询一次
};

// 停止视频合成列表轮询
const stopMergePolling = () => {
  if (mergePollingTimer) {
    clearInterval(mergePollingTimer);
    mergePollingTimer = null;
  }
};

// 处理视频合成完成事件
const handleMergeCompleted = async (mergeId: number) => {
  // 刷新视频合成列表
  await loadVideoMerges();
  // 切换到视频合成标签页
  activeTab.value = "merges";
};

// 下载视频
const downloadVideo = async (url: string, title: string) => {
  try {
    const loadingMsg = ElMessage.info({
      message: "正在准备下载...",
      duration: 0,
    });

    // 处理相对路径，添加 /static/ 前缀
    const videoUrl = url.startsWith("http") ? url : `/static/${url}`;

    // 使用fetch获取视频blob
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    // 创建下载链接
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `${title}.mp4`;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();

    // 清理
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    }, 100);

    loadingMsg.close();
    ElMessage.success("视频下载已开始");
  } catch (error) {
    console.error("下载视频失败:", error);
    ElMessage.error("视频下载失败，请稍后重试");
  }
};

// 预览合成视频
const previewMergedVideo = (url: string) => {
  // 处理相对路径，添加 /static/ 前缀
  const videoUrl = url.startsWith("http") ? url : `/static/${url}`;
  window.open(videoUrl, "_blank");
};

// 删除视频合成记录
const deleteMerge = async (mergeId: number) => {
  try {
    await ElMessageBox.confirm(
      "确定要删除此合成记录吗？此操作不可恢复。",
      "删除确认",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      },
    );

    await videoMergeAPI.deleteMerge(mergeId);
    ElMessage.success("删除成功");
    // 刷新列表
    await loadVideoMerges();
  } catch (error: any) {
    if (error !== "cancel") {
      console.error("删除失败:", error);
      ElMessage.error(error.response?.data?.message || "删除失败");
    }
  }
};

// 格式化日期时间
const formatDateTime = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 7) return `${days}天前`;

  // 超过7天显示完整日期
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
};

onMounted(async () => {
  await loadData();
  await loadVideoModels();
  await loadVideoMerges();
});

// 组件卸载时停止轮询
onBeforeUnmount(() => {
  stopPolling();
  stopVideoPolling();
  stopMergePolling();
});

// ===== 新增: Accordion 展开状态 =====
const expandedSections = ref<string[]>(['shot-settings', 'image-gen'])

const toggleSection = (key: string) => {
  const idx = expandedSections.value.indexOf(key)
  if (idx === -1) {
    expandedSections.value.push(key)
  } else {
    expandedSections.value.splice(idx, 1)
  }
}

const isSectionExpanded = (key: string) => expandedSections.value.includes(key)

// ===== 新增: 当前分镜预览图/视频URL =====
const currentPreviewUrl = computed((): string | null => {
  if (!currentStoryboard.value) return null
  // 次选: 已生成的首帧图片
  const firstFrameImg = generatedImages.value.find((i: any) => i.frame_type === 'first' && i.image_url)
  if (firstFrameImg?.image_url) return firstFrameImg.image_url
  // 末选: 背景场景图
  if ((currentStoryboard.value as any).background?.image_url) {
    return (currentStoryboard.value as any).background.image_url
  }
  return null
})

const currentPreviewVideo = computed((): string | null => {
  const latestVideo = generatedVideos.value.find((v: any) => v.video_url)
  return latestVideo?.video_url || null
})


</script>

<style scoped lang="scss">
/* ===== Professional Editor V2 ===== */

.professional-editor-v2 {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-primary, #f5f7fa);
}

.back-btn { font-size: 14px; }
.episode-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #303133);
  margin-left: 12px;
}

/* ===== 主编辑区 ===== */
.editor-main-v2 {
  display: grid;
  grid-template-columns: 220px 1fr 300px;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

/* ===== 左侧 ===== */
.storyboard-panel-v2 {
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary, #f0f2f5);
  border-right: 1px solid var(--border-color, #e4e7ed);
  overflow: hidden;
}

.panel-header-v2 {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color, #e4e7ed);
  flex-shrink: 0;

  .panel-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #303133);
  }
}

.storyboard-cards {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.storyboard-card {
  display: flex;
  align-items: center;
  gap: 7px;
  background: #fff;
  border: 2px solid transparent;
  border-radius: 7px;
  padding: 5px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  position: relative;

  &:hover { border-color: #a0cfff; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  &.active { border-color: #409eff; background: #ecf5ff; }
}

.card-thumbnail {
  width: 68px;
  height: 44px;
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
  background: #e0e0e0;

  .thumbnail-img { width: 100%; height: 100%; object-fit: cover; }
  .thumbnail-placeholder {
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
    background: #e8e8e8;
  }
  .shot-number-badge {
    position: absolute; bottom: 2px; left: 2px;
    background: rgba(0,0,0,.6); color: #fff;
    font-size: 9px; padding: 0 3px; border-radius: 2px; line-height: 15px;
  }
}

.card-info {
  flex: 1;
  min-width: 0;

  .card-title {
    font-size: 12px; font-weight: 500;
    color: var(--text-primary, #303133);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    margin-bottom: 3px;
  }
  .card-meta {
    display: flex; align-items: center; justify-content: space-between;
    .card-duration { font-size: 11px; color: #909399; }
  }
  .status-dot {
    font-size: 10px; padding: 1px 4px; border-radius: 3px; font-weight: 500;
    &.dot-image { background: #ecf5ff; color: #409eff; }
    &.dot-empty { background: #f4f4f5; color: #c0c4cc; }
  }
}

.card-delete-btn {
  flex-shrink: 0; opacity: 0; transition: opacity 0.15s;
}
.storyboard-card:hover .card-delete-btn { opacity: 1; }

/* ===== 中间 ===== */
.center-area-v2 {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #111;
}

.preview-area-v2 {
  flex: 0 0 52%;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid #2a2a2a;

  .preview-media {
    max-width: 100%; max-height: 100%;
    object-fit: contain; display: block;
  }
  .preview-placeholder {
    display: flex; flex-direction: column;
    align-items: center; gap: 10px; color: #555;
    p { font-size: 13px; margin: 0; }
  }
  .preview-info-overlay {
    position: absolute; bottom: 8px; left: 8px;
    display: flex; gap: 6px; align-items: center;
    .preview-shot-num {
      background: rgba(0,0,0,.7); color: #fff;
      font-size: 11px; padding: 2px 6px; border-radius: 4px; font-weight: 600;
    }
    .preview-shot-title { color: rgba(255,255,255,.8); font-size: 12px; }
    .preview-shot-duration {
      background: rgba(64,158,255,.8); color: #fff;
      font-size: 11px; padding: 2px 6px; border-radius: 4px;
    }
  }
}

.timeline-area-v2 {
  flex: 1;
  overflow: hidden;
  background: var(--bg-primary, #f5f7fa);
  min-height: 0;
}

.empty-timeline {
  height: 100%;
  display: flex; align-items: center; justify-content: center;
}

/* ===== 右侧 Accordion ===== */
.edit-panel-v2 {
  display: flex;
  flex-direction: column;
  background: #fff;
  border-left: 1px solid var(--border-color, #e4e7ed);
  overflow-y: auto;
  overflow-x: hidden;

  &.edit-panel-empty {
    align-items: center; justify-content: center;
  }
}

.accordion-section {
  border-bottom: 1px solid var(--border-color, #e4e7ed);
  flex-shrink: 0;
}

.accordion-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 9px 12px; cursor: pointer; user-select: none;
  background: #fafafa; transition: background 0.15s;

  &:hover { background: #ecf5ff; }

  .accordion-title {
    font-size: 13px; font-weight: 600;
    color: var(--text-primary, #303133);
  }
  .accordion-arrow {
    font-size: 11px; color: #c0c4cc;
    transition: transform 0.2s;
  }
}

.accordion-body {
  padding: 10px 12px;
  display: flex; flex-direction: column; gap: 8px;
}

/* ===== 通用字段 ===== */
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

/* 生成控制 */
.gen-controls-v2 {
  display: flex; gap: 7px; flex-wrap: wrap;
}

/* 结果网格 */
.result-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 7px;
}

.result-item {
  position: relative;
  aspect-ratio: 16/9;
  border-radius: 5px;
  overflow: hidden;
  background: #f0f0f0;
  cursor: pointer;

  .el-image { width: 100%; height: 100%; }

  &.grid-entry {
    border: 2px dashed #dcdfe6;
    display: flex; align-items: center; justify-content: center;
    &:hover { border-color: #409eff; }
  }

  .result-placeholder {
    width: 100%; height: 100%;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 4px; color: #909399; font-size: 11px;
    p { margin: 0; }
  }

  .result-actions {
    position: absolute; top: 3px; right: 3px;
    display: flex; gap: 3px;
    opacity: 0; transition: opacity 0.15s;
  }
  &:hover .result-actions { opacity: 1; }

  .result-action-btn {
    width: 22px; height: 22px;
    background: rgba(0,0,0,.65); border-radius: 3px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    &:hover { background: rgba(0,0,0,.85); }
  }
}

.video-result-item {
  .video-thumb-v2 {
    width: 100%; height: 100%; position: relative;
    video { width: 100%; height: 100%; object-fit: cover; }
    .play-overlay-v2 {
      position: absolute; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,.3); opacity: 0; transition: opacity 0.15s;
    }
    &:hover .play-overlay-v2 { opacity: 1; }
  }
}

/* 视频生成：参考图 */
.ref-image-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 5px; margin-top: 5px;
  max-height: 180px; overflow-y: auto;
}
.ref-image-item {
  position: relative; aspect-ratio: 16/9;
  border-radius: 3px; overflow: hidden;
  border: 2px solid transparent; cursor: pointer;
  background: #f0f0f0;
  &.selected { border-color: #409eff; }
  .ref-selected-mark {
    position: absolute; top: 2px; right: 2px;
    background: #52c41a; color: #fff;
    font-size: 9px; padding: 0 3px; border-radius: 2px;
  }
}

.frame-slots-row {
  display: flex; align-items: center; gap: 8px; margin-top: 6px;
}
.frame-slot {
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  .frame-slot-label { font-size: 11px; color: #909399; }
}
.image-slot-mini {
  width: 60px; height: 38px;
  border: 2px dashed #dcdfe6; border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; cursor: pointer;
  background: #fafafa;
  img { width: 100%; height: 100%; object-fit: cover; }
}

.video-prompt-display {
  font-size: 12px; color: #606266;
  background: #fafafa; border: 1px solid #e4e7ed;
  border-radius: 5px; padding: 7px 9px;
  line-height: 1.6; max-height: 80px; overflow-y: auto;
}

/* 视频合成 */
.merge-list-v2 { display: flex; flex-direction: column; gap: 7px; }
.merge-item-v2 {
  border: 1px solid #e4e7ed; border-radius: 5px;
  padding: 9px; background: #fafafa;
  &.merge-completed { border-color: #b3e19d; background: #f0f9eb; }
  &.merge-processing { border-color: #fcd891; background: #fdf6ec; }
  &.merge-failed { border-color: #fbc4c4; background: #fef0f0; }

  .merge-item-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 7px;
    .merge-item-title { font-size: 13px; font-weight: 500; color: #303133; }
  }
  .merge-item-actions { display: flex; gap: 5px; flex-wrap: wrap; }
  .merge-error-v2 { margin-top: 5px; font-size: 11px; color: #f56c6c; }
}

/* ===== 对话框复用原样式 ===== */
.character-image-preview-v2,
.scene-image-preview-v2 {
  text-align: center;
  img { max-width: 100%; max-height: 500px; }
}

.character-selector-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 12px; max-height: 420px; overflow-y: auto; padding: 4px;
}
.character-card {
  display: flex; flex-direction: column; align-items: center;
  gap: 6px; padding: 10px; border: 2px solid transparent;
  border-radius: 8px; cursor: pointer;
  transition: border-color 0.15s;
  &.selected { border-color: #409eff; background: #ecf5ff; }
  &:hover { border-color: #a0cfff; }

  .character-avatar-large {
    width: 64px; height: 64px; border-radius: 50%;
    overflow: hidden; background: #f0f0f0;
    display: flex; align-items: center; justify-content: center;
    img { width: 100%; height: 100%; object-fit: cover; }
    span { font-size: 22px; font-weight: 600; }
  }
  .character-info {
    text-align: center;
    .character-name { font-size: 13px; font-weight: 500; }
    .character-role { font-size: 11px; color: #909399; }
  }
  .character-check { margin-top: 4px; }
}
.empty-characters { grid-column: 1/-1; }

.scene-selector-grid {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 12px; max-height: 420px; overflow-y: auto; padding: 4px;
}
.scene-card {
  display: flex; flex-direction: column;
  border: 2px solid transparent; border-radius: 8px;
  overflow: hidden; cursor: pointer; transition: border-color 0.15s;
  &.selected { border-color: #409eff; }
  &:hover { border-color: #a0cfff; }

  .scene-image {
    height: 80px; background: #f0f0f0;
    display: flex; align-items: center; justify-content: center;
    img { width: 100%; height: 100%; object-fit: cover; }
  }
  .scene-info {
    padding: 6px 8px;
    .scene-location { font-size: 13px; font-weight: 500; }
    .scene-time { font-size: 11px; color: #909399; }
  }
}
.empty-scenes { grid-column: 1/-1; }

.video-preview-container { padding: 4px 0; }
.video-meta { margin-top: 10px; }
</style>

<style>
.el-image-viewer__wrapper { z-index: 9999; }
</style>
