<template>
  <div class="studio" v-if="drama">
    <header class="studio-topbar">
      <div class="studio-topbar-main">
        <button class="back-btn topbar-back" @click="navigateTo(`/drama/${dramaId}`)">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          返回项目
        </button>
        <div class="studio-identity">
          <h1 class="studio-title">{{ drama.title }}</h1>
          <span class="studio-episode-chip">第 {{ episodeNumber }} 集</span>
          <div class="studio-meta-row">
            <span class="studio-meta-pill">{{ currentSubStageLabel }}</span>
            <span class="studio-meta-pill is-progress">{{ pipelineProgress }}/{{ pipelineTotal }}</span>
            <span class="studio-meta-inline">{{ chars.length }} 角色 · {{ sbs.length }} 镜头</span>
          </div>
        </div>
      </div>

      <div class="studio-topbar-side">
        <div class="studio-model-picks">
          <ModelSelect
            v-if="textModelOptions.length"
            v-model="rewriteModel"
            label="改写"
            :options="textModelOptions"
            :default-label="`默认 · ${textModelOptions[0].model}`"
            :show-config="textModelMultiCfg"
          />
          <ModelSelect
            v-if="imageModelOptions.length"
            v-model="imageModel"
            label="图片"
            :options="imageModelOptions"
            :default-label="`默认 · ${imageModelOptions[0].model}`"
            :show-config="imageModelMultiCfg"
          />
          <ModelSelect
            v-if="videoModelOptions.length"
            v-model="videoModel"
            label="视频"
            :options="videoModelOptions"
            :default-label="`默认 · ${videoModelOptions[0].model}`"
            :show-config="videoModelMultiCfg"
          />
        </div>
        <div class="studio-actions">
          <button class="btn" @click="refresh">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            刷新
          </button>
          <button class="btn btn-primary" @click="panel = mergeUrl ? 'export' : (sbs.length ? 'production' : 'script')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {{ mergeUrl ? '查看成片' : (sbs.length ? '继续制作' : '开始制作') }}
          </button>
        </div>
      </div>
    </header>

    <div class="studio-body">
    <!-- ========== LEFT SIDEBAR ========== -->
    <aside class="sidebar">
      <nav class="pipeline">
        <div
          v-for="section in sidebarSections"
          :key="section.id"
          class="pipe-section"
        >
          <div class="pipe-section-label">{{ section.label }}</div>
          <button
            v-for="item in section.items"
            :key="item.key"
            :class="['pipe-item pipe-item-sub', { active: activeSubStepKey === item.key, done: item.done }]"
            @click="goSubStep(item.key)"
          >
            <span class="pipe-icon" :class="item.done ? 'icon-done' : activeSubStepKey === item.key ? 'icon-active' : ''">
              <svg v-if="item.done" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              <component v-else :is="item.icon" :size="11" />
            </span>
            <span class="pipe-copy">
              <span class="pipe-label">{{ item.label }}</span>
              <span v-if="item.desc" class="pipe-sub">{{ item.desc }}</span>
            </span>
          </button>
        </div>
      </nav>

      <!-- Bottom: Progress + Refresh -->
      <div class="sidebar-bottom">
        <div class="progress-wrap">
          <div class="progress-head">
            <span class="progress-label">制作进度</span>
            <span class="progress-val">{{ pipelineProgress }}/{{ pipelineTotal }}</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: (pipelineProgress / pipelineTotal * 100) + '%' }"></div>
          </div>
        </div>
        <div class="sidebar-jumper" v-if="sidebarJumpSteps.length">
          <button
            v-for="step in sidebarJumpSteps"
            :key="step.key"
            :class="['sidebar-jump-dot', { active: activeSubStepKey === step.key, done: step.done }]"
            @click="goSubStep(step.key)"
            :title="step.label"
          ></button>
        </div>
        <button class="refresh-btn" @click="refresh">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
          刷新数据
        </button>
      </div>
    </aside>

    <!-- ========== MAIN CONTENT ========== -->
    <main class="main">
      <div v-if="activeSubSteps.length" class="stage-subnav seg">
        <button
          v-for="sub in activeSubSteps"
          :key="sub.key"
          :class="['stage-subnav-item seg-item', { active: activeSubStepKey === sub.key, done: sub.done }]"
          @click="goSubStep(sub.key)"
        >
          <span>{{ sub.label }}</span>
          <span v-if="sub.done" class="stage-subnav-dot"></span>
        </button>
      </div>

      <!-- ===== SCRIPT PANEL ===== -->
      <div v-if="panel === 'script'" class="content-panel">
        <!-- Step 0: Raw Content -->
        <div v-if="scriptStep === 0" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">01</span>
                <span class="step-name">原始内容</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="rawLen" class="char-count">{{ rawLen }} 字</span>
              <button class="btn btn-sm" @click="saveRaw(); toast.success('已保存')">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                保存
              </button>
            </div>
          </div>
          <textarea
            class="fill-textarea"
            v-model="localRaw"
            placeholder="粘贴小说原文、故事大纲或分镜描述..."
          />
        </div>

        <!-- Step 1: Rewrite -->
        <div v-else-if="scriptStep === 1" class="step-editor">
          <div class="step-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <span class="step-num">02</span>
                <span class="step-name">AI 改写</span>
              </div>
            </div>
            <div class="toolbar-right">
              <span v-if="scriptLen" class="char-count">{{ scriptLen }} 字</span>
              <button v-if="rawContent" class="btn btn-sm" @click="skipRewrite">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/><path d="M13 18l6-6-6-6"/></svg>
                跳过改写
              </button>
              <button v-if="scriptContent" class="btn btn-sm" @click="doRewrite" :disabled="rn">
                <Loader2 v-if="rn && rt === 'script_rewriter'" :size="11" class="animate-spin" />
                <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                重新改写
              </button>
            </div>
          </div>

          <div v-if="!scriptContent && !rn" class="step-empty">
            <div class="empty-visual">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
            </div>
            <div class="empty-title">AI 改写为格式化剧本</div>
            <div class="empty-desc">你可以先用 AI 把原始内容整理成格式化剧本，也可以跳过这一步，直接进入资产制作。</div>
            <div class="step-empty-actions">
              <button class="btn btn-primary" @click="doRewrite">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                开始改写
              </button>
              <button class="btn" @click="skipRewrite">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/><path d="M13 18l6-6-6-6"/></svg>
                跳过改写
              </button>
            </div>
          </div>
          <div v-else-if="rn && rt === 'script_rewriter'" class="step-loading">
            <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
            <div class="loading-text">正在改写剧本...</div>
          </div>
          <textarea v-else class="fill-textarea" v-model="localScript" placeholder="格式化剧本内容..." />
        </div>
      </div>

      <!-- ===== PRODUCTION PANEL ===== -->
      <div v-else-if="panel === 'production'" class="content-panel">
        <!-- Guard: current production step prerequisites -->
        <div v-if="productionBlockMessage" class="step-empty" style="flex:1">
          <div class="empty-visual">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </div>
          <div class="empty-title">尚未准备就绪</div>
          <div class="empty-desc">{{ productionBlockMessage }}</div>
          <button class="btn btn-primary" @click="goProductionBlockTarget">{{ productionBlockActionLabel }}</button>
        </div>

        <template v-else>
          <div class="step-toolbar prod-toolbar">
            <div class="toolbar-left">
              <div class="step-indicator">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                <span class="step-name">制作工作台</span>
              </div>
            </div>
            <div class="prod-tabs">
              <button
                v-for="t in prodTabDefs"
                :key="t.id"
                :class="['prod-tab', { active: prodTab === t.id }]"
                @click="prodTab = t.id"
              >
                <component :is="t.icon" :size="11" />
                {{ t.label }}
                <span v-if="t.badge" class="prod-tab-badge">{{ t.badge }}</span>
              </button>
            </div>
          </div>

          <!-- Sub: Assets -->
          <div v-if="prodTab === 'assets'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">资产</span>
              <span class="tag mono">{{ assetReadyCount }}/{{ assetTotalCount }} 已就绪</span>
              <span class="tag">{{ lockedImageConfigLabel }}</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" :disabled="rn" @click="doExtract">
                  <Loader2 v-if="rt === 'extractor'" :size="11" class="animate-spin" />
                  <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  {{ chars.length || scenes.length || propItems.length ? '重新提取' : '开始提取' }}
                </button>
                <button class="btn btn-sm" @click="batchCharImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  批量生成
                </button>
                <button class="btn btn-sm" @click="batchSceneImages">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  批量场景
                </button>
              </div>
            </div>
            <div v-if="rn && rt === 'extractor'" class="step-loading">
              <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
              <div class="loading-text">正在提取角色、场景和道具...</div>
            </div>
            <div v-else-if="!chars.length && !scenes.length && !propItems.length" class="step-empty asset-empty-state">
              <div class="empty-visual">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </div>
              <div class="empty-title">开始提取资产</div>
              <div class="empty-desc">角色、场景和道具会在提取后显示在这里，然后可以继续生成角色形象和场景图片。</div>
              <button class="btn btn-primary" :disabled="rn" @click="doExtract">
                <Loader2 v-if="rt === 'extractor'" :size="13" class="animate-spin" />
                <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                开始提取
              </button>
            </div>
            <template v-else>
            <template v-if="visualChars.length">
            <div class="asset-section-title">角色</div>
            <div class="character-asset-grid">
              <article
                v-for="c in visualChars"
                :key="c.id"
                class="card character-asset-card"
                tabindex="0"
                role="button"
                @click="openAssetDetail('character', c)"
                @keydown.enter.prevent="openAssetDetail('character', c)"
                @keydown.space.prevent="openAssetDetail('character', c)"
              >
                <div class="character-asset-main">
                  <div class="character-asset-overview"><div class="character-portrait">
                      <img
                        v-if="c.image_url || c.imageUrl"
                        :src="assetImageSrc(c)"
                        class="previewable-image"
                        @click.stop="openImageViewer(assetImageSrc(c), `${c.name} 角色形象`)"
                      />
                      <div v-else class="character-portrait-empty">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                      </div>
                      <span class="asset-cover-badge" :class="(c.image_url || c.imageUrl) ? 'is-ready' : (isPendingCharImage(c.id) ? 'is-pending' : '')">
                        {{ (c.image_url || c.imageUrl) ? '形象已生成' : (isPendingCharImage(c.id) ? '形象生成中' : '形象待生成') }}
                      </span>
                    </div>

                    <div class="character-asset-head">
                      <div class="character-title-block">
                        <div class="character-name-row">
                          <strong class="character-name">{{ c.name }}</strong>
                          <span class="tag">{{ c.role || '角色' }}</span>
                        </div>
                        <div class="character-visual-summary" :title="characterVisualSummary(c)">
                          <span>样貌：{{ characterAppearanceValue(c) }}</span>
                          <span>妆造：{{ characterStylingValue(c) }}</span>
                        </div>
                      </div>
                      <button class="btn btn-sm character-gen-btn" :disabled="isPendingCharImage(c.id)" @click.stop="genCharImg(c.id)">
                        <Loader2 v-if="isPendingCharImage(c.id)" :size="11" class="animate-spin" />
                        {{ (c.image_url || c.imageUrl) ? '重绘' : (isPendingCharImage(c.id) ? '生成中' : '生成') }}
                      </button>
                    </div>
                  </div>
                  <div class="asset-final-prompt" :title="c.final_prompt || c.finalPrompt || ''">
                    <span class="afp-label">最终提示词 · 三视图</span>
                    <span :class="['afp-text', !(c.final_prompt || c.finalPrompt) && 'dim']">{{ c.final_prompt || c.finalPrompt || '首次生成形象时由提示词 Agent 自动生成' }}</span>
                  </div>
                </div>
              </article>
            </div>
            </template>

            <template v-if="scenes.length">
            <div class="asset-section-title">场景</div>
            <div class="asset-grid">
              <div
                v-for="s in scenes"
                :key="s.id"
                class="card asset-card asset-click-card"
                tabindex="0"
                role="button"
                @click="openAssetDetail('scene', s)"
                @keydown.enter.prevent="openAssetDetail('scene', s)"
                @keydown.space.prevent="openAssetDetail('scene', s)"
              >
                <div class="asset-cover wide">
                  <img
                    v-if="s.image_url || s.imageUrl"
                    :src="assetImageSrc(s)"
                    class="previewable-image"
                    @click.stop="openImageViewer(assetImageSrc(s), `${s.location} 场景图`)"
                  />
                  <div v-else class="asset-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </div>
                  <span class="asset-cover-badge" :class="(s.image_url || s.imageUrl) ? 'is-ready' : (isPendingSceneImage(s.id) ? 'is-pending' : '')">{{ (s.image_url || s.imageUrl) ? '已生成' : (isPendingSceneImage(s.id) ? '生成中' : '待生成') }}</span>
                </div>
                <div class="asset-body">
                  <div class="asset-name" :title="s.location">{{ s.location }}</div>
                  <div class="asset-meta asset-desc dim" :title="sceneDescriptionValue(s)">{{ sceneDescriptionValue(s) }}</div>
                  <div v-if="sceneLightingValue(s)" class="asset-meta asset-light dim" :title="sceneLightingValue(s)">光照 · {{ sceneLightingValue(s) }}</div>
                  <div class="asset-meta asset-final" :class="{ dim: !(s.final_prompt || s.finalPrompt) }" :title="s.final_prompt || s.finalPrompt || ''">
                    <span class="afp-label">最终提示词 · 固定视角</span>
                    {{ s.final_prompt || s.finalPrompt || '首次生成图片时由提示词 Agent 自动生成（前景/中景/后景）' }}
                  </div>
                </div>
                <div class="asset-foot">
                  <span :class="['dot', (s.image_url || s.imageUrl) && 'ok', isPendingSceneImage(s.id) && 'pending']" />
                  <button class="btn btn-sm ml-auto" :disabled="isPendingSceneImage(s.id)" @click.stop="genSceneImg(s.id)">
                    <Loader2 v-if="isPendingSceneImage(s.id)" :size="11" class="animate-spin" />
                    {{ (s.image_url || s.imageUrl) ? '重绘' : (isPendingSceneImage(s.id) ? '生成中' : '生成') }}
                  </button>
                </div>
              </div>
            </div>
            </template>

            <div class="asset-section-title">道具</div>
            <div v-if="propItems.length" class="asset-grid">
              <div
                v-for="p in propItems"
                :key="p.id"
                class="card asset-card asset-click-card prop-card"
                tabindex="0"
                role="button"
                @click="openAssetDetail('prop', p)"
                @keydown.enter.prevent="openAssetDetail('prop', p)"
                @keydown.space.prevent="openAssetDetail('prop', p)"
              >
                <div class="asset-cover wide">
                  <img
                    v-if="p.image_url || p.imageUrl"
                    :src="assetImageSrc(p)"
                    class="previewable-image"
                    @click.stop="openImageViewer(assetImageSrc(p), `${p.name} 道具图`)"
                  />
                  <div v-else class="asset-cover-empty">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                  </div>
                  <span class="asset-cover-badge" :class="(p.image_url || p.imageUrl) ? 'is-ready' : (isPendingPropImage(p.id) ? 'is-pending' : '')">{{ (p.image_url || p.imageUrl) ? '已生成' : (isPendingPropImage(p.id) ? '生成中' : '待生成') }}</span>
                </div>
                <div class="asset-body">
                  <div class="prop-name-row">
                    <span class="asset-name" :title="p.name">{{ p.name }}</span>
                    <span class="tag">{{ p.type || '道具' }}</span>
                  </div>
                  <div class="asset-meta asset-desc dim" :title="p.description || ''">{{ p.description || '暂无描述' }}</div>
                  <div class="asset-meta asset-final" :class="{ dim: !(p.final_prompt || p.finalPrompt) }" :title="p.final_prompt || p.finalPrompt || ''">
                    <span class="afp-label">最终提示词 · 白底单品</span>
                    {{ p.final_prompt || p.finalPrompt || '首次生成图片时由提示词 Agent 自动生成（白底单品）' }}
                  </div>
                </div>
                <div class="asset-foot">
                  <span :class="['dot', (p.image_url || p.imageUrl) && 'ok', isPendingPropImage(p.id) && 'pending']" />
                  <button class="btn btn-sm ml-auto" :disabled="isPendingPropImage(p.id)" @click.stop="genPropImg(p.id)">
                    <Loader2 v-if="isPendingPropImage(p.id)" :size="11" class="animate-spin" />
                    {{ (p.image_url || p.imageUrl) ? '重绘' : (isPendingPropImage(p.id) ? '生成中' : '生成') }}
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="asset-props-empty">本集暂无涉及事态发展的关键道具</div>
            </template>
          </div>

          <!-- Sub: Storyboard Split -->
          <div v-if="prodTab === 'storyboard'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">分镜拆分</span>
              <span class="tag mono">{{ sbs.length }} 镜头 · {{ totalDuration }}s</span>
              <span class="tag">{{ lockedVideoConfigLabel }}</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" :disabled="rn" @click="doBreakdown">
                  <Loader2 v-if="rt === 'storyboard_breaker'" :size="11" class="animate-spin" />
                  <svg v-else width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  {{ sbs.length ? '重新拆分' : '开始拆分' }}
                </button>
              </div>
            </div>

            <div v-if="sbs.length" class="storyboard-workbench">
              <aside class="storyboard-shot-list">
                <div class="shot-list-head">
                  <div>
                    <div class="shot-list-title">分镜列表</div>
                    <div class="shot-list-sub">检查拆分描述和绑定的角色场景</div>
                  </div>
                  <span class="tag mono">{{ totalDuration }}s</span>
                </div>
                <div class="shot-list-body">
                  <button
                    v-for="(sb, i) in sbs"
                    :key="sb.id"
                    type="button"
                    class="storyboard-shot-card"
                    :class="{ active: selectedSb?.id === sb.id }"
                    @click="selectedSb = sb"
                  >
                    <div class="storyboard-shot-head">
                      <div class="shot-num">#{{ String(i + 1).padStart(2, '0') }}</div>
                      <span class="storyboard-shot-chip">{{ sb.duration || 10 }}s</span>
                      <span v-if="getSceneName(sb)" class="shot-location"><MapPin :size="9" />{{ getSceneName(sb) }}</span>
                      <span v-if="hasVid(sb)" class="shot-chip-video" title="已生成视频"><Play :size="8" />已出片</span>
                    </div>
                    <div class="shot-body">
                      <div class="shot-desc" :class="{ 'is-empty': !sb.description }">{{ sb.description || '暂无画面描述' }}</div>
                    </div>
                    <div class="shot-meta">
                      <div class="shot-avatars">
                        <template v-if="getStoryboardCharacters(sb).length">
                          <span
                            v-for="c in getStoryboardCharacters(sb).slice(0, 3)"
                            :key="c.id"
                            class="shot-avatar"
                            :title="c.name"
                          >
                            <img v-if="assetImageSrc(c)" :src="assetImageSrc(c)" :alt="c.name" />
                            <template v-else>{{ (c.name || '?').slice(0, 1) }}</template>
                          </span>
                          <span v-if="getStoryboardCharacters(sb).length > 3" class="shot-avatar shot-avatar-more">+{{ getStoryboardCharacters(sb).length - 3 }}</span>
                        </template>
                        <span v-else class="shot-avatars-empty">0 角色</span>
                      </div>
                      <div class="shot-flags">
                        <span class="shot-flag flag-dialogue" :class="{ on: !!sb.dialogue }" :title="sb.dialogue ? '有对白' : '无对白'"><i class="dot"></i>白</span>
                        <span class="shot-flag flag-video" :class="{ on: hasVid(sb) }" :title="hasVid(sb) ? '已生成视频' : '未生成视频'"><i class="dot"></i>视</span>
                      </div>
                    </div>
                  </button>
                </div>
              </aside>

              <section class="storyboard-editor-main" v-if="selectedSb">
                <div class="sb-header-top">
                  <div class="sb-nav-group">
                    <button
                      type="button"
                      class="btn btn-icon btn-sm sb-nav-btn"
                      :disabled="sbs.indexOf(selectedSb) <= 0"
                      @click="selectedSb = sbs[sbs.indexOf(selectedSb) - 1]"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <div class="detail-head-copy">
                      <span class="detail-head-title">分镜 #{{ sbs.indexOf(selectedSb) + 1 }}</span>
                      <span class="dim sb-header-total">/ 共 {{ sbs.length }} 个</span>
                    </div>
                    <button
                      type="button"
                      class="btn btn-icon btn-sm sb-nav-btn"
                      :disabled="sbs.indexOf(selectedSb) >= sbs.length - 1"
                      @click="selectedSb = sbs[sbs.indexOf(selectedSb) + 1]"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                  </div>
                </div>
                <div class="sb-header-fields">
                  <span class="sb-field-label">时长</span>
                  <span class="sb-duration-input">
                    <input :value="selectedSb.duration || 10" class="input" type="number" min="1" max="60" @blur="updateField(selectedSb, 'duration', Number($event.target.value))" />
                    <span class="sb-duration-unit">s</span>
                  </span>
                  <span class="sb-field-label">场景</span>
                  <BaseSelect
                    class="sb-scene-select"
                    :model-value="selectedSb.scene_id || selectedSb.sceneId || ''"
                    :options="sceneOptions"
                    placeholder="未绑定场景"
                    :searchable="false"
                    @update:model-value="updateField(selectedSb, 'scene_id', $event === '' ? null : Number($event))"
                  />
                  <span class="sb-field-label">角色</span>
                  <div class="role-pills">
                    <button
                      v-for="char in visualChars"
                      :key="char.id"
                      type="button"
                      :class="['role-pill', { active: isStoryboardCharacterSelected(selectedSb, char.id) }]"
                      @click="toggleStoryboardCharacter(selectedSb, char.id)"
                    >
                      {{ char.name }}
                    </button>
                    <span v-if="!visualChars.length" class="dim" style="font-size:12px">当前集还没有角色</span>
                  </div>
                </div>

                <div class="storyboard-editor-scroll">
                  <div class="detail-section">
                    <div class="detail-section-head">
                      <span class="detail-section-title">分镜描述</span>
                    </div>
                    <label class="field">
                      <span class="field-label">画面描述</span>
                      <textarea :value="selectedSb.description || ''" class="textarea" rows="4" @blur="updateField(selectedSb, 'description', $event.target.value)" placeholder="分镜画面描述" />
                    </label>
                    <div class="field-grid field-grid-2">
                      <label class="field">
                        <span class="field-label">动作</span>
                        <textarea :value="selectedSb.action || ''" class="textarea" rows="3" @blur="updateField(selectedSb, 'action', $event.target.value)" placeholder="角色动作与表演" />
                      </label>
                      <label class="field">
                        <span class="field-label">氛围</span>
                        <textarea :value="selectedSb.atmosphere || ''" class="textarea" rows="3" @blur="updateField(selectedSb, 'atmosphere', $event.target.value)" placeholder="光线、色调、空气感、环境氛围" />
                      </label>
                    </div>
                    <label v-if="dialogueOpen || selectedSb.dialogue" class="field">
                      <span class="field-label">对白 / 旁白</span>
                      <textarea :value="selectedSb.dialogue || ''" class="textarea" rows="2" @blur="updateField(selectedSb, 'dialogue', $event.target.value)" placeholder="角色名：台词内容 或 旁白：内容" />
                    </label>
                    <button v-else type="button" class="dialogue-add" @click="dialogueOpen = true">
                      <MessageSquarePlus :size="12" />
                      添加对白 / 旁白
                    </button>
                  </div>
                </div>
              </section>

              <aside class="storyboard-reference-panel" v-if="selectedSb">
                <div class="storyboard-ref-head">
                  <div>
                    <div class="storyboard-ref-title">参考素材</div>
                    <div class="storyboard-ref-copy">将作为视频参考图</div>
                  </div>
                  <span class="tag mono">{{ getShotReferenceAssets(selectedSb).filter(item => item.ready).length }}/{{ getShotReferenceAssets(selectedSb).length }}</span>
                </div>
                <div class="storyboard-ref-list">
                  <template v-for="group in ['角色', '场景']" :key="group">
                    <div v-if="getShotReferenceAssets(selectedSb).filter(a => a.type === group).length" class="storyboard-ref-group">
                      <div class="storyboard-ref-group-label">{{ group }}</div>
                      <div
                        v-for="asset in getShotReferenceAssets(selectedSb).filter(a => a.type === group)"
                        :key="asset.key"
                        :class="['storyboard-ref-item', { ready: asset.ready }]"
                      >
                        <button
                          type="button"
                          class="storyboard-ref-thumb"
                          :disabled="!asset.ready"
                          @click.stop="asset.ready && openImageViewer(assetImageSrc({ imageUrl: asset.imageUrl }), `${asset.name} ${asset.type}`)"
                        >
                          <img v-if="asset.ready" :src="assetImageSrc({ imageUrl: asset.imageUrl })" class="previewable-image" />
                          <span v-else>{{ asset.type === '场景' ? '景' : '角' }}</span>
                        </button>
                        <div class="storyboard-ref-main">
                          <div class="storyboard-ref-line">
                            <span class="storyboard-ref-name">{{ asset.name }}</span>
                            <span :class="['storyboard-ref-state', asset.ready ? 'is-ready' : '']">{{ asset.ready ? '可参考' : '未生成' }}</span>
                          </div>
                          <div class="storyboard-ref-meta">{{ asset.type }} · {{ asset.meta }}</div>
                          <button v-if="!asset.ready" type="button" class="storyboard-ref-goto" @click.stop="prodTab = 'assets'">去生成 →</button>
                        </div>
                      </div>
                    </div>
                  </template>
                  <div v-if="!getShotReferenceAssets(selectedSb).length" class="storyboard-ref-empty">
                    当前分镜还没有绑定角色或场景。
                  </div>
                </div>
              </aside>
            </div>

            <div v-else-if="rn && rt === 'storyboard_breaker'" class="step-loading">
              <Loader2 :size="24" class="animate-spin" style="color:var(--accent)" />
              <div class="loading-text">正在拆分分镜...</div>
            </div>

            <div v-else class="step-empty video-task-empty-state">
              <div class="empty-visual">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><rect x="2" y="2" width="20" height="20" rx="2.5"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="10" y1="8" x2="10" y2="16"/><line x1="13" y1="8" x2="13" y2="16"/></svg>
              </div>
              <div class="empty-title">开始拆分分镜</div>
              <div class="empty-desc">根据剧本、角色和场景拆分镜头，生成分镜描述和绑定信息。</div>
              <button class="btn btn-primary" :disabled="rn" @click="doBreakdown">
                <Loader2 v-if="rt === 'storyboard_breaker'" :size="13" class="animate-spin" />
                <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                开始拆分
              </button>
            </div>
          </div>

          <!-- Sub: Videos -->
          <div v-if="prodTab === 'videos'" class="prod-content">
            <div class="prod-section-bar">
              <span class="dim" style="font-size:12px">{{ sbs.length }} 个镜头</span>
              <span class="tag mono">{{ shotVidCount }}/{{ sbs.length }} 已生成</span>
              <div class="ml-auto flex gap-1">
                <button class="btn btn-sm" :disabled="!sbs.length" @click="batchVideos">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  批量视频
                </button>
              </div>
            </div>
            <div v-if="!sbs.length" class="step-empty video-task-empty-state">
              <div class="empty-visual">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
              </div>
              <div class="empty-title">先生成分镜</div>
              <div class="empty-desc">视频任务来自分镜拆分结果。先生成分镜描述和视频提示词，再批量生成视频。</div>
              <div class="locked-config-banner">当前集视频模型：{{ lockedVideoConfigLabel }}</div>
              <button class="btn btn-primary" :disabled="rn" @click="prodTab = 'storyboard'; doBreakdown()">
                <Loader2 v-if="rt === 'storyboard_breaker'" :size="13" class="animate-spin" />
                <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                AI 生成分镜
              </button>
            </div>
            <div v-else class="video-task-workbench">
              <section class="video-task-list">
                <div class="video-task-head">
                <div>
                  <div class="video-task-title">视频任务列表</div>
                  <div class="video-task-meta">按镜头顺序 · {{ videoTaskRows.length }} 个任务</div>
                </div>
                <div class="video-task-metrics">
                  <span class="video-task-metric is-pending">{{ pendingVideoIds.length }} 生成中</span>
                  <span class="video-task-metric is-done">{{ videoTaskDoneCount }} 完成</span>
                  <span class="video-task-metric is-failed">{{ videoTaskFailedCount }} 失败</span>
                </div>
                </div>
                <div class="video-task-table">
                <div
                  v-for="task in videoTaskRows"
                  :key="task.id"
                  :class="['video-task-row', 'is-' + videoTaskState(task.storyboard), { active: selectedSb?.id === task.storyboard.id }]"
                  role="button"
                  tabindex="0"
                  @click="selectedSb = task.storyboard"
                  @keydown.enter.prevent="selectedSb = task.storyboard"
                  @keydown.space.prevent="selectedSb = task.storyboard"
                >
                  <div class="video-task-preview">
                    <video
                      v-if="hasVid(task.storyboard)"
                      :src="'/' + getVideoUrl(task.storyboard)"
                      controls
                      preload="metadata"
                      playsinline
                    />
                    <div v-else class="video-task-empty">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    </div>
                    <span class="video-task-index">#{{ String(task.index + 1).padStart(2, '0') }}</span>
                  </div>
                  <div class="video-task-main">
                    <div class="video-task-line">
                      <strong class="video-task-name truncate">{{ task.title }}</strong>
                    </div>
                    <div class="video-task-meta-line">
                      <span v-if="task.meta" class="video-task-loc truncate">{{ task.meta }}</span>
                      <span class="video-task-sep">·</span>
                      <span>{{ task.duration }}s</span>
                      <span class="video-task-sep">·</span>
                      <span>参考 {{ task.referenceCount }}</span>
                    </div>
                    <div v-if="task.error" class="video-task-error">{{ task.error }}</div>
                  </div>
                  <span :class="['video-task-status', 'is-' + videoTaskState(task.storyboard)]">
                    <span :class="['dot', videoTaskState(task.storyboard) === 'done' && 'ok', videoTaskState(task.storyboard) === 'pending' && 'pending']" />
                    {{ videoTaskStatusLabel(task.storyboard) }}
                  </span>
                  <button
                    class="btn btn-sm video-task-action"
                    :disabled="videoTaskState(task.storyboard) === 'pending'"
                    @click.stop="genVid(task.storyboard)"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                    {{ videoTaskActionLabel(task.storyboard) }}
                  </button>
                </div>
                </div>
              </section>

              <aside v-if="selectedSb" class="video-task-inspector">
                <div class="video-inspector-head">
                  <div>
                    <div class="video-inspector-title">分镜 {{ String(selectedVideoTaskNumber).padStart(2, '0') }}</div>
                    <div class="video-inspector-sub">详细信息</div>
                  </div>
                  <span :class="['video-task-status', 'is-' + videoTaskState(selectedSb)]">
                    <span :class="['dot', videoTaskState(selectedSb) === 'done' && 'ok', videoTaskState(selectedSb) === 'pending' && 'pending']" />
                    {{ videoTaskStatusLabel(selectedSb) }}
                  </span>
                </div>

                <div class="video-inspector-body">
                  <section class="video-inspector-section">
                    <div class="video-inspector-prompt-head">
                      <span class="video-inspector-label video-inspector-label-hero">视频提示词</span>
                      <button
                        type="button"
                        class="btn btn-sm"
                        :disabled="rn"
                        @click="genVideoPrompt(selectedSb)"
                      >
                        <Loader2 v-if="rn && rt === 'storyboard_breaker'" :size="11" class="animate-spin" />
                        {{ (selectedSb.video_prompt || selectedSb.videoPrompt) ? '重新生成' : 'AI 生成' }}
                      </button>
                    </div>
                    <MentionTextarea
                      :model-value="selectedSb.video_prompt || selectedSb.videoPrompt || ''"
                      :options="mentionOptions"
                      :rows="9"
                      input-class="textarea video-inspector-prompt"
                      placeholder="用 @角色名 / @场景名 引用参考素材（如 @志远、@电子厂车间），生成时自动映射为参考图片；再按时间段描述画面运动与镜头…"
                      @commit="v => updateField(selectedSb, 'video_prompt', v)"
                    />
                  </section>

                  <section class="video-inspector-section">
                    <span class="video-inspector-label">参考素材</span>
                    <div class="video-inspector-assets">
                      <button
                        v-for="asset in getShotReferenceAssets(selectedSb)"
                        :key="asset.key"
                        type="button"
                        class="video-inspector-asset"
                        :disabled="!asset.ready"
                        @click="asset.ready && openImageViewer(assetImageSrc({ imageUrl: asset.imageUrl }), `${asset.name} ${asset.type}`)"
                      >
                        <img v-if="asset.ready" :src="assetImageSrc({ imageUrl: asset.imageUrl })" :alt="asset.name" />
                        <span v-else>{{ asset.type }}</span>
                        <small>{{ asset.name }}</small>
                      </button>
                      <div v-if="!getShotReferenceAssets(selectedSb).length" class="video-inspector-empty">当前分镜未绑定参考素材</div>
                    </div>
                  </section>

                  <section class="video-inspector-section">
                    <span class="video-inspector-label">参考图片 / 视频 / 音频</span>
                    <div v-if="videoRefImageUrls.length || videoRefVideoUrls.length || videoRefAudioUrls.length" class="video-ref-media-list">
                      <span v-for="(url, i) in videoRefImageUrls" :key="'ref-i-' + i" class="video-ref-media-chip">
                        图片 {{ i + 1 }}
                        <button type="button" class="video-ref-media-remove" @click="removeRefMedia('image', i)">×</button>
                      </span>
                      <span v-for="(url, i) in videoRefVideoUrls" :key="'ref-v-' + i" class="video-ref-media-chip">
                        视频 {{ i + 1 }}
                        <button type="button" class="video-ref-media-remove" @click="removeRefMedia('video', i)">×</button>
                      </span>
                      <span v-for="(url, i) in videoRefAudioUrls" :key="'ref-a-' + i" class="video-ref-media-chip">
                        音频 {{ i + 1 }}
                        <button type="button" class="video-ref-media-remove" @click="removeRefMedia('audio', i)">×</button>
                      </span>
                    </div>
                    <div class="video-ref-media-actions">
                      <button type="button" class="btn btn-sm" :disabled="uploadingRefMedia || refImageFull" @click="uploadRefMedia('image')">
                        上传参考图片 ({{ refImageUsedCount }}/9)
                      </button>
                      <button type="button" class="btn btn-sm" :disabled="uploadingRefMedia || videoRefVideoUrls.length >= 3" @click="uploadRefMedia('video')">
                        上传参考视频 ({{ videoRefVideoUrls.length }}/3)
                      </button>
                      <button type="button" class="btn btn-sm" :disabled="uploadingRefMedia || videoRefAudioUrls.length >= 3" @click="uploadRefMedia('audio')">
                        上传参考音频 ({{ videoRefAudioUrls.length }}/3)
                      </button>
                    </div>
                    <div
                      v-if="videoRefAudioUrls.length && !getShotReferenceImages(selectedSb).length && !videoRefVideoUrls.length"
                      class="video-ref-media-hint"
                    >参考音频需至少 1 个参考图片或视频</div>
                  </section>

                  <section class="video-inspector-section">
                    <span class="video-inspector-label">生成参数</span>
                    <div class="video-param-row">
                      <span class="video-param-name">生成时长</span>
                      <span class="video-param-control">
                        <input v-model.number="videoDuration" type="number" min="4" max="15" class="input video-duration-input" />
                        <span class="video-param-unit">s（4-15）</span>
                      </span>
                    </div>
                  </section>

                  <button
                    class="btn btn-primary video-inspector-action"
                    :disabled="videoTaskState(selectedSb) === 'pending'"
                    @click="genVid(selectedSb)"
                  >
                    {{ videoTaskActionLabel(selectedSb) }}
                  </button>
                </div>
              </aside>
            </div>
          </div>

          <!-- Production Navigator -->
        </template>
      </div>

      <!-- ===== EXPORT PANEL ===== -->
      <div v-else class="content-panel">
        <div v-if="!sbs.length" class="step-empty" style="flex:1">
          <div class="empty-visual">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
          <div class="empty-title">尚未准备就绪</div>
          <div class="empty-desc">请先完成分镜和制作流程</div>
          <button class="btn btn-primary" @click="panel = 'script'">前往剧本</button>
        </div>
        <div v-else class="export-split">
          <div class="export-main">
            <template v-if="mergeUrl">
              <div class="export-player">
                <video :src="'/' + mergeUrl" controls class="export-video" />
              </div>
              <div class="export-bar">
                <span class="tag tag-success">拼接完成</span>
                <span class="dim" style="font-size:12px">{{ sbs.length }} 镜头 · {{ totalDuration }}s</span>
                <a :href="'/' + mergeUrl" download class="btn btn-primary ml-auto">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  下载视频
                </a>
              </div>
            </template>
            <template v-else>
              <div class="step-empty">
                <div class="empty-visual">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                </div>
                <div class="empty-title">拼接全集视频</div>
                <div class="empty-desc">将 {{ shotVidCount }} 个已生成镜头视频拼接为完整视频</div>
                <button class="btn btn-primary" :disabled="shotVidCount === 0" @click="doMerge" style="margin-top:12px">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  开始拼接
                </button>
              </div>
            </template>
          </div>
          <div class="export-list">
            <div class="export-list-head">镜头概览</div>
            <div class="export-list-body">
              <div v-for="(sb, i) in sbs" :key="sb.id" class="exp-row">
                <span class="mono dim" style="font-size:10px">#{{ String(i+1).padStart(2,'0') }}</span>
                <span class="truncate" style="flex:1;font-size:11px">{{ sb.description || sb.title || '—' }}</span>
                <span :class="['dot', hasVid(sb) && 'ok']" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="showBottomBubble" class="step-bubble">
        <button
          v-if="panel === 'script'"
          class="bubble-btn"
          :disabled="scriptStep === 0"
          @click="goPrevStep"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ prevStepLabel || '上一步' }}
        </button>
        <button
          v-else-if="panel === 'production'"
          class="bubble-btn"
          :disabled="prodTabIdx === 0"
          @click="prodTabIdx = Math.max(0, prodTabIdx - 1)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
          {{ prodTabDefs[Math.max(0, prodTabIdx - 1)]?.label || '上一步' }}
        </button>

        <div class="bubble-dots">
          <button
            v-for="step in bubbleSteps"
            :key="step.key"
            :class="['bubble-dot', { done: step.done, current: step.key === activeBubbleKey }]"
            @click="goSubStep(step.key)"
            :title="step.label"
          ></button>
        </div>

        <button
          v-if="panel === 'script'"
          class="bubble-btn primary"
          :disabled="!canGoNext"
          @click="goNextStep"
        >
          {{ nextStepLabel || '下一步' }}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
        <button
          v-else-if="panel === 'production'"
          class="bubble-btn primary"
          :disabled="prodTab === 'videos' && !canExport"
          @click="goNextProd"
        >
          {{ prodTabIdx < prodTabDefs.length - 1 ? (prodTabDefs[prodTabIdx + 1]?.label || '下一步') : '进入导出' }}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>

      <div v-if="assetDetail.open && assetDetail.item" class="overlay asset-detail-overlay" @click.self="closeAssetDetail">
        <section
          class="dialog asset-detail-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="(assetDetail.type === 'character' ? '角色' : assetDetail.type === 'scene' ? '场景' : '道具') + '详情'"
        >
          <header class="dialog-head asset-detail-head">
            <div class="asset-detail-title-block">
              <span class="asset-detail-kicker">{{ assetTypeLabel(assetDetail.type) }}</span>
              <h2 class="asset-detail-title">{{ assetDetailTitle(assetDetail) }}</h2>
            </div>
            <div class="asset-detail-head-actions">
              <span class="tag" v-if="assetDetail.type === 'character'">{{ assetDetail.item.role || '角色' }}</span>
              <span class="tag" v-else-if="assetDetail.type === 'prop'">{{ assetDetail.item.type || '道具' }}</span>
              <span class="tag" v-else>{{ assetDetail.item.time || '未设时间' }}</span>
              <button class="btn btn-ghost btn-icon" @click="closeAssetDetail">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </header>

          <div class="dialog-body asset-detail-body">
            <div class="asset-detail-shell">
              <aside class="asset-detail-preview-panel">
                <div class="asset-detail-section-title">
                  <span>视觉预览</span>
                  <span :class="['asset-detail-state', assetImageSrc(assetDetail.item) ? 'is-ready' : '']">
                    {{ assetImageSrc(assetDetail.item) ? '已生成' : '待生成' }}
                  </span>
                </div>

                <button
                  type="button"
                  class="asset-detail-media-frame"
                  :disabled="!assetImageSrc(assetDetail.item)"
                  @click.stop="openImageViewer(assetImageSrc(assetDetail.item), `${assetDetailTitle(assetDetail)} ${assetDetail.type === 'character' ? '角色形象' : assetDetail.type === 'scene' ? '场景图' : '道具图'}`)"
                >
                  <img
                    v-if="assetImageSrc(assetDetail.item)"
                    :src="assetImageSrc(assetDetail.item)"
                    class="previewable-image"
                  />
                  <span v-else class="asset-detail-media-empty">
                    <svg v-if="assetDetail.type === 'character'" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <svg v-else-if="assetDetail.type === 'prop'" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                    <svg v-else width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </span>
                </button>

                <div class="asset-detail-meta-row">
                  <div class="asset-detail-meta-item">
                    <span>类型</span>
                    <strong>{{ assetDetail.type === 'character' ? '角色形象' : assetDetail.type === 'prop' ? '道具' : '场景图片' }}</strong>
                  </div>
                  <div class="asset-detail-meta-item">
                    <span>{{ assetDetail.type === 'character' ? '定位' : assetDetail.type === 'prop' ? '道具类型' : '时间' }}</span>
                    <strong>{{ assetDetail.type === 'character' ? (assetDetail.item.role || '角色') : assetDetail.type === 'prop' ? (assetDetail.item.type || '道具') : (assetDetail.item.time || '未设时间') }}</strong>
                  </div>
                </div>
              </aside>

              <section class="asset-detail-editor-panel">
                <div class="asset-detail-section-title">
                  <span>编辑信息</span>
                  <span class="dim">{{ assetDetail.type === 'character' ? '样貌与妆造会影响角色形象' : assetDetail.type === 'prop' ? '物品外貌会影响道具图' : '空间与光影会影响场景图' }}</span>
                </div>

                <div v-if="assetDetail.type === 'prop'" class="asset-detail-edit-grid asset-detail-edit-grid--prop">
                  <label class="asset-detail-edit-field">
                    <span>物品外貌</span>
                    <textarea
                      v-model="assetDetailDraft.description"
                      class="textarea asset-detail-textarea"
                      rows="6"
                      placeholder="材质、颜色、形状、大小、新旧程度、磨损痕迹等"
                    />
                  </label>
                </div>

                <div v-else :class="['asset-detail-edit-grid', `asset-detail-edit-grid--${assetDetail.type}`]">
                  <label v-if="assetDetail.type === 'character'" class="asset-detail-edit-field">
                    <span>样貌</span>
                    <textarea
                      v-model="assetDetailDraft.appearance"
                      class="textarea asset-detail-textarea"
                      rows="6"
                      placeholder="年龄感、五官、体态、气质等"
                    />
                  </label>
                  <label v-if="assetDetail.type === 'character'" class="asset-detail-edit-field">
                    <span>妆造</span>
                    <textarea
                      v-model="assetDetailDraft.styling"
                      class="textarea asset-detail-textarea"
                      rows="6"
                      placeholder="发型、服装、妆面、配饰等"
                    />
                  </label>
                  <label v-if="assetDetail.type === 'scene'" class="asset-detail-edit-field">
                    <span>场景描述</span>
                    <textarea
                      v-model="assetDetailDraft.prompt"
                      class="textarea asset-detail-textarea"
                      rows="5"
                      placeholder="空间、陈设、年代质感、关键视觉元素等"
                    />
                  </label>
                  <label v-if="assetDetail.type === 'scene'" class="asset-detail-edit-field">
                    <span>场景光影</span>
                    <textarea
                      v-model="assetDetailDraft.lighting"
                      class="textarea asset-detail-textarea"
                      rows="5"
                      placeholder="光源、色调、明暗、氛围等"
                    />
                  </label>
                </div>

              </section>
            </div>

            <section class="asset-detail-prompt-panel">
              <div class="asset-detail-section-title">
                <span>{{ assetDetail.type === 'character' ? '最终提示词 · 三视图' : assetDetail.type === 'scene' ? '最终提示词 · 固定视角' : '最终提示词 · 白底单品' }}</span>
                <div class="asset-detail-prompt-head-actions">
                  <button
                    v-if="!assetFinalPrompt"
                    class="btn btn-sm"
                    :disabled="isGeneratingPrompt(assetDetail.type, assetDetail.item.id) || isAssetImagePending(assetDetail.type, assetDetail.item.id)"
                    @click="genAssetFinalPrompt"
                  >
                    <Loader2 v-if="isGeneratingPrompt(assetDetail.type, assetDetail.item.id)" :size="11" class="animate-spin" />
                    {{ isGeneratingPrompt(assetDetail.type, assetDetail.item.id) ? '生成中' : '生成提示词' }}
                  </button>
                  <span :class="['asset-detail-state', assetFinalPrompt && 'is-ready']">
                    {{ assetFinalPrompt ? '已生成' : '待生成' }}
                  </span>
                  <button
                    v-if="assetPromptDraft"
                    class="btn btn-ghost btn-sm asset-detail-copy-btn"
                    @click="copyAssetFinalPrompt"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    复制
                  </button>
                </div>
              </div>
              <textarea
                :value="assetPromptDraft"
                @input="onAssetPromptInput"
                class="textarea asset-detail-prompt-textarea"
                rows="5"
                :placeholder="assetDetail.type === 'character'
                  ? '可手动编写三视图最终提示词，或点击「生成提示词」由 Agent 生成'
                  : assetDetail.type === 'scene'
                    ? '可手动编写固定视角最终提示词，或点击「生成提示词」由 Agent 生成'
                    : '可手动编写白底单品最终提示词，或点击「生成提示词」由 Agent 生成'"
              />
              <p class="asset-detail-prompt-hint">
                {{ assetDetail.type === 'character'
                  ? '提示词可直接编辑，保存后生效；修改样貌或妆造并保存后，最终提示词将被清空，下次生成形象时由提示词 Agent 重新生成。'
                  : assetDetail.type === 'scene'
                    ? '提示词可直接编辑，保存后生效；修改场景描述或光影并保存后，最终提示词将被清空，下次生成场景图时由提示词 Agent 重新生成。'
                    : '提示词可直接编辑，保存后生效；修改物品外貌并保存后，最终提示词将被清空，下次生成道具图时由提示词 Agent 重新生成。' }}
              </p>
            </section>
          </div>

          <footer class="dialog-foot asset-detail-foot">
            <div class="asset-detail-secondary-actions">
              <button class="btn" @click="closeAssetDetail">关闭</button>
            </div>
            <div class="asset-detail-primary-actions">
              <button
                v-if="assetDetail.type === 'character'"
                class="btn"
                :disabled="isPendingCharImage(assetDetail.item.id)"
                @click="genCharImg(assetDetail.item.id)"
              >
                {{ assetImageSrc(assetDetail.item) ? '重绘形象' : (isPendingCharImage(assetDetail.item.id) ? '生成中' : '生成形象') }}
              </button>
              <button
                v-else-if="assetDetail.type === 'scene'"
                class="btn"
                :disabled="isPendingSceneImage(assetDetail.item.id)"
                @click="genSceneImg(assetDetail.item.id)"
              >
                {{ assetImageSrc(assetDetail.item) ? '重绘场景' : (isPendingSceneImage(assetDetail.item.id) ? '生成中' : '生成场景') }}
              </button>
              <button
                v-else-if="assetDetail.type === 'prop'"
                class="btn"
                :disabled="isPendingPropImage(assetDetail.item.id)"
                @click="genPropImg(assetDetail.item.id)"
              >
                {{ assetImageSrc(assetDetail.item) ? '重绘道具图' : (isPendingPropImage(assetDetail.item.id) ? '生成中' : '生成道具图') }}
              </button>
              <button class="btn btn-primary" :disabled="savingAssetDetail" @click="saveAssetDetail">
                <Loader2 v-if="savingAssetDetail" :size="12" class="animate-spin" />
                保存修改
              </button>
            </div>
          </footer>
        </section>
      </div>

      <div v-if="imageViewer.open && imageViewer.src" class="overlay image-viewer-overlay" @click.self="closeImageViewer">
        <div class="dialog image-viewer-dialog">
          <div class="image-viewer-head">
            <div class="image-viewer-title">{{ imageViewer.title || '图片预览' }}</div>
            <button class="btn btn-ghost btn-icon" @click="closeImageViewer">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="image-viewer-body">
            <img :src="imageViewer.src" :alt="imageViewer.title || '图片预览'" class="image-viewer-img" />
          </div>
        </div>
      </div>
    </main>
    </div>
  </div>
</template>

<script setup>
import { toast } from 'vue-sonner'
import {
  Users, Video, FileText, FolderKanban, Clapperboard, Download, Loader2,
  MapPin, Play, MessageSquarePlus,
} from 'lucide-vue-next'
import { dramaAPI, episodeAPI, storyboardAPI, characterAPI, sceneAPI, propAPI, videoAPI, mergeAPI, aiConfigAPI, uploadAPI } from '~/composables/useApi'
import { useAgent } from '~/composables/useAgent'

definePageMeta({ layout: 'studio' })

const route = useRoute()
const dramaId = Number(route.params.id)
const episodeNumber = Number(route.params.episodeNumber)

const drama = ref(null), episode = ref(null), chars = ref([]), scenes = ref([]), propItems = ref([]), sbs = ref([]), mergeData = ref(null)
const panel = ref('script')
const { running: rn, runningType: rt, run: runAgent } = useAgent()

const localRaw = ref(''), localScript = ref('')
const rawContent = computed(() => episode.value?.content || '')
const scriptContent = computed(() => episode.value?.script_content || episode.value?.scriptContent || '')
const epId = computed(() => episode.value?.id || 0)
const rawLen = computed(() => localRaw.value.replace(/\s/g, '').length || 0)
const scriptLen = computed(() => localScript.value.replace(/\s/g, '').length || 0)
const mergeUrl = computed(() => mergeData.value?.merged_url || mergeData.value?.mergedUrl || null)

const scriptStep = ref(0)
const prodTab = ref('assets')
const activeExtractTab = ref('characters')
const prodTabIdx = computed({
  get: () => prodTabDefs.value.findIndex(t => t.id === prodTab.value),
  set: (v) => { prodTab.value = prodTabDefs.value[v]?.id || 'assets' },
})
const imageConfigs = ref([])
const videoConfigs = ref([])
const textConfigs = ref([])
// 生成时可选模型：空串 = 跟随配置默认（models[0]）；选择持久化到 localStorage，刷新页面后保留
const MODEL_STORE_KEYS = { rewrite: 'huobao:model:rewrite', image: 'huobao:model:image', video: 'huobao:model:video' }
function readStoredModel(key) {
  try { return localStorage.getItem(key) || '' } catch { return '' }
}
const rewriteModel = ref(readStoredModel(MODEL_STORE_KEYS.rewrite))
const imageModel = ref(readStoredModel(MODEL_STORE_KEYS.image))
const videoModel = ref(readStoredModel(MODEL_STORE_KEYS.video))
function persistModel(modelRef, key) {
  watch(modelRef, v => {
    try { v ? localStorage.setItem(key, v) : localStorage.removeItem(key) } catch {}
  })
}
persistModel(rewriteModel, MODEL_STORE_KEYS.rewrite)
persistModel(imageModel, MODEL_STORE_KEYS.image)
persistModel(videoModel, MODEL_STORE_KEYS.video)
const pendingCharImageIds = ref([])
const pendingSceneImageIds = ref([])
const pendingPropImageIds = ref([])
const pendingVideoIds = ref([])
const failedVideoMessages = ref({})
// Seedance 2.0 视频生成面板：仅多模态参考（参考图 0-9 + 参考视频 0-3 + 参考音频 0-3 + 可选文本）
const videoRefVideoUrls = ref([])
const videoRefAudioUrls = ref([])
const videoRefImageUrls = ref([])
const videoDuration = ref(10)
const uploadingRefMedia = ref(false)
const imageViewer = ref({ open: false, src: '', title: '' })
const assetDetail = ref({ open: false, type: '', item: null })
const assetDetailDraft = ref({ appearance: '', styling: '', prompt: '', lighting: '', description: '' })
// 最终提示词手动编辑：dirty 时才随保存提交，避免无修改保存误清空 Agent 生成的提示词
const assetPromptDraft = ref('')
const assetPromptDirty = ref(false)
const savingAssetDetail = ref(false)

function configLabel(config) {
  if (!config) return '未配置'
  const modelName = configModels(config)[0] || ''
  return modelName ? `${config.name} · ${modelName} (${config.provider})` : `${config.name} (${config.provider})`
}

function isPendingCharImage(id) {
  return pendingCharImageIds.value.includes(id)
}

function openImageViewer(src, title = '') {
  if (!src) return
  imageViewer.value = { open: true, src, title }
}

function closeImageViewer() {
  imageViewer.value = { open: false, src: '', title: '' }
}

function openAssetDetail(type, item) {
  if (!item) return
  assetDetail.value = { open: true, type, item }
  assetDetailDraft.value = {
    appearance: item.appearance || '',
    styling: item.styling || '',
    prompt: item.prompt || (type === 'prop' ? '' : item.description) || '',
    lighting: item.lighting || '',
    description: item.description || '',
  }
  assetPromptDraft.value = item.final_prompt || item.finalPrompt || ''
  assetPromptDirty.value = false
}

function closeAssetDetail() {
  assetDetail.value = { open: false, type: '', item: null }
  assetDetailDraft.value = { appearance: '', styling: '', prompt: '', lighting: '', description: '' }
  assetPromptDraft.value = ''
  assetPromptDirty.value = false
}

function onAssetPromptInput(event) {
  assetPromptDraft.value = event.target.value
  assetPromptDirty.value = true
}

const assetFinalPrompt = computed(() => {
  const item = assetDetail.value?.item
  return item?.final_prompt || item?.finalPrompt || ''
})

/** 把生成好的最终提示词同步到列表项与弹窗项 */
function applyFinalPrompt(type, id, fp) {
  const patch = { final_prompt: fp, finalPrompt: fp }
  const list = type === 'character' ? chars.value : type === 'scene' ? scenes.value : propItems.value
  const target = list.find(x => x.id === id)
  if (target) Object.assign(target, patch)
  if (assetDetail.value.open && assetDetail.value.type === type && assetDetail.value.item?.id === id) {
    Object.assign(assetDetail.value.item, patch)
  }
}

const generatingPromptKeys = ref([])

function isGeneratingPrompt(type, id) {
  return generatingPromptKeys.value.includes(`${type}:${id}`)
}

/** 该资产图片是否在外层「生成」流程中（含提示词阶段与生图阶段） */
function isAssetImagePending(type, id) {
  return type === 'character' ? isPendingCharImage(id) : type === 'scene' ? isPendingSceneImage(id) : isPendingPropImage(id)
}

/**
 * 生成缺失的最终提示词（弹窗按钮与外层两段式生图共用同一 key 状态，避免重复触发）
 * 返回最终提示词；生成失败由接口抛错，Agent 返回空时返回 ''
 */
async function ensureAssetPrompt(type, id) {
  const key = `${type}:${id}`
  if (generatingPromptKeys.value.includes(key)) return ''
  generatingPromptKeys.value.push(key)
  try {
    const res = type === 'character'
      ? await characterAPI.generatePrompt(id, epId.value)
      : type === 'scene'
        ? await sceneAPI.generatePrompt(id, epId.value)
        : await propAPI.generatePrompt(id, epId.value)
    const fp = res?.final_prompt || res?.finalPrompt || ''
    if (fp) applyFinalPrompt(type, id, fp)
    return fp
  } finally {
    generatingPromptKeys.value = generatingPromptKeys.value.filter(k => k !== key)
  }
}

/** 弹窗内生成最终提示词（不生图）；已有最终提示词时不再生成，可直接编辑或先清空保存 */
async function genAssetFinalPrompt() {
  const detail = assetDetail.value
  if (!detail.open || !detail.item?.id) return
  if (assetFinalPrompt.value) return
  try {
    const fp = await ensureAssetPrompt(detail.type, detail.item.id)
    if (!fp) throw new Error('最终提示词生成失败，请重试')
    assetPromptDraft.value = fp
    assetPromptDirty.value = false
    toast.success('最终提示词已生成')
  } catch (e) {
    toast.error(e.message || '最终提示词生成失败')
  }
}

async function copyAssetFinalPrompt() {
  const text = assetPromptDraft.value || assetFinalPrompt.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    toast.success('最终提示词已复制')
  } catch {
    toast.error('复制失败，请手动选择文本复制')
  }
}

async function saveAssetDetail() {
  const detail = assetDetail.value
  if (!detail.open || !detail.item?.id) return
  const item = detail.item
  // 只提交真正修改过的字段：无修改保存不应触发后端的提示词失效置空
  const payload = {}
  let infoChanged = false
  if (detail.type === 'character') {
    if (assetDetailDraft.value.appearance !== (item.appearance || '')) payload.appearance = assetDetailDraft.value.appearance
    if (assetDetailDraft.value.styling !== (item.styling || '')) payload.styling = assetDetailDraft.value.styling
  } else if (detail.type === 'scene') {
    if (assetDetailDraft.value.prompt !== (item.prompt || '')) payload.prompt = assetDetailDraft.value.prompt
    if (assetDetailDraft.value.lighting !== (item.lighting || '')) payload.lighting = assetDetailDraft.value.lighting
  } else {
    if (assetDetailDraft.value.description !== (item.description || '')) payload.description = assetDetailDraft.value.description
  }
  infoChanged = Object.keys(payload).length > 0
  // 手动编辑过最终提示词才提交；空串视为清空
  if (assetPromptDirty.value) payload.final_prompt = assetPromptDraft.value.trim() || ''
  if (!infoChanged && !assetPromptDirty.value) {
    toast.info('没有需要保存的修改')
    return
  }
  savingAssetDetail.value = true
  try {
    if (detail.type === 'character') await characterAPI.update(item.id, payload)
    else if (detail.type === 'scene') await sceneAPI.update(item.id, payload)
    else await propAPI.update(item.id, payload)
    // 本地同步：手动编辑的提示词以草稿为准；仅信息字段变更时提示词已被后端置空
    const { final_prompt, ...infoPatch } = payload
    const promptValue = assetPromptDirty.value ? (payload.final_prompt || null) : (infoChanged ? null : (item.final_prompt || item.finalPrompt || null))
    Object.assign(item, infoPatch, { final_prompt: promptValue, finalPrompt: promptValue })
    const list = detail.type === 'character' ? chars.value : detail.type === 'scene' ? scenes.value : propItems.value
    const target = list.find(x => x.id === item.id)
    if (target) Object.assign(target, infoPatch, { final_prompt: promptValue, finalPrompt: promptValue })
    if (assetPromptDirty.value) assetPromptDraft.value = payload.final_prompt || ''
    assetPromptDirty.value = false
    toast.success('修改已保存')
  } catch (e) {
    toast.error(e.message || '保存失败')
  } finally {
    savingAssetDetail.value = false
  }
}

function assetImageSrc(item) {
  const raw = item?.image_url || item?.imageUrl || ''
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw
  return `/${raw}`
}

function assetDetailTitle(detail) {
  if (!detail?.item) return ''
  if (detail.type === 'character') return detail.item.name || '未命名角色'
  if (detail.type === 'prop') return detail.item.name || '未命名道具'
  return detail.item.location || '未命名场景'
}

function assetTypeLabel(type) {
  return { character: '角色资产', scene: '场景资产', prop: '道具资产' }[type] || '资产'
}

function characterAppearanceValue(char) {
  return char?.appearance || '样貌待补充'
}

function characterStylingValue(char) {
  return char?.styling || '妆造待补充'
}

function characterVisualSummary(char) {
  return `样貌：${characterAppearanceValue(char)} · 妆造：${characterStylingValue(char)}`
}

function sceneDescriptionValue(scene) {
  return scene?.prompt || scene?.description || '场景描述待补充'
}

function sceneLightingValue(scene) {
  return scene?.lighting || '场景光影待补充'
}

function handleImageViewerKeydown(event) {
  if (event.key !== 'Escape') return
  if (imageViewer.value.open) closeImageViewer()
  else if (assetDetail.value.open) closeAssetDetail()
}

onMounted(() => {
  window.addEventListener('keydown', handleImageViewerKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleImageViewerKeydown)
})

function isPendingSceneImage(id) {
  return pendingSceneImageIds.value.includes(id)
}

function isPendingVideo(id) {
  return pendingVideoIds.value.includes(id)
}

function videoFailMessage(id) {
  return failedVideoMessages.value[id] || ''
}

function videoTaskState(sb) {
  if (hasVid(sb)) return 'done'
  if (isPendingVideo(sb?.id)) return 'pending'
  if (videoFailMessage(sb?.id)) return 'failed'
  return 'ready'
}

function videoTaskStatusLabel(sb) {
  const state = videoTaskState(sb)
  if (state === 'done') return '已完成'
  if (state === 'pending') return '生成中'
  if (state === 'failed') return '失败'
  return '待生成'
}

function videoTaskActionLabel(sb) {
  const state = videoTaskState(sb)
  if (state === 'done') return '重新生成'
  if (state === 'pending') return '生成中'
  return '生成'
}

const videoTaskRows = computed(() => sbs.value.map((sb, index) => {
  const duration = Number(sb.duration || 5)
  const referenceCount = getShotReferenceImages(sb).length
  const sceneName = getSceneName(sb)
  return {
    id: sb.id,
    index,
    storyboard: sb,
    title: sb.description || `镜头 #${String(index + 1).padStart(2, '0')}`,
    meta: sceneName || `${referenceCount} 个参考素材`,
    duration: Number.isFinite(duration) ? duration : 5,
    referenceCount,
    state: videoTaskState(sb),
    error: videoFailMessage(sb.id),
  }
}))
const videoTaskDoneCount = computed(() => videoTaskRows.value.filter(task => task.state === 'done').length)
const videoTaskFailedCount = computed(() => videoTaskRows.value.filter(task => task.state === 'failed').length)

function isNarratorCharacter(char) {
  const text = `${char?.name || ''} ${char?.role || ''}`.toLowerCase()
  return text.includes('旁白') || text.includes('narrator') || text.includes('画外音')
}

const visualChars = computed(() => chars.value.filter(c => !isNarratorCharacter(c)))
const lockedImageConfigId = computed(() => episode.value?.image_config_id || episode.value?.imageConfigId || null)
const lockedVideoConfigId = computed(() => episode.value?.video_config_id || episode.value?.videoConfigId || null)
const lockedImageConfigLabel = computed(() => configLabel(imageConfigs.value.find(c => c.id === lockedImageConfigId.value)))
const lockedVideoConfigLabel = computed(() => configLabel(videoConfigs.value.find(c => c.id === lockedVideoConfigId.value)))
// 画面比例在创建项目时固定，视频生成统一使用
const dramaAspectRatio = computed(() => drama.value?.aspect_ratio || drama.value?.aspectRatio || '16:9')

// 生成可选模型列表：配置中的模型数组（首位为配置默认）；API 可能返回数组或 JSON 字符串
function configModels(cfg) {
  const raw = cfg?.model
  if (!raw) return []
  if (Array.isArray(raw)) return raw.filter(Boolean)
  try { const m = JSON.parse(raw); return Array.isArray(m) ? m.filter(Boolean) : [m].filter(Boolean) } catch { return [raw].filter(Boolean) }
}
// 汇总该类型全部启用配置的模型（去重，按优先级排序），选中模型时连同所属配置一起调用
function collectModelOptions(cfgs) {
  const seen = new Set()
  const out = []
  const sorted = [...cfgs].filter(c => c.is_active).sort((a, b) => (b.priority || 0) - (a.priority || 0))
  for (const c of sorted) {
    for (const m of configModels(c)) {
      if (seen.has(m)) continue
      seen.add(m)
      out.push({ model: m, configId: c.id, configName: c.name || c.provider })
    }
  }
  return out
}
function ownerConfigId(options, model) {
  return model ? (options.find(o => o.model === model)?.configId || undefined) : undefined
}
function hasMultiConfigs(options) {
  return new Set(options.map(o => o.configId)).size > 1
}
const textModelOptions = computed(() => collectModelOptions(textConfigs.value))
const imageModelOptions = computed(() => collectModelOptions(imageConfigs.value))
const videoModelOptions = computed(() => collectModelOptions(videoConfigs.value))

// 配置变化后校验持久化的模型是否仍存在（配置被删/模型被移除时回退默认，避免把失效模型传给后端）
function pruneStaleModel(modelRef, optionsRef) {
  watch(optionsRef, opts => {
    if (modelRef.value && opts.length && !opts.some(o => o.model === modelRef.value)) modelRef.value = ''
  }, { immediate: true })
}
pruneStaleModel(rewriteModel, textModelOptions)
pruneStaleModel(imageModel, imageModelOptions)
pruneStaleModel(videoModel, videoModelOptions)
const textModelMultiCfg = computed(() => hasMultiConfigs(textModelOptions.value))
const imageModelMultiCfg = computed(() => hasMultiConfigs(imageModelOptions.value))
const videoModelMultiCfg = computed(() => hasMultiConfigs(videoModelOptions.value))

// Production step helpers
function prodStepDone(id) {
  if (id === 'assets') return assetTotalCount.value > 0 && assetReadyCount.value === assetTotalCount.value
  if (id === 'storyboard') return !!sbs.value.length
  if (id === 'videos') return !!sbs.value.length && shotVidCount.value === sbs.value.length
  return false
}
const productionBlockMessage = computed(() => {
  if (!scriptContent.value) return '请先完成剧本编写'
  return ''
})
const productionBlockActionLabel = computed(() => {
  if (!scriptContent.value) return '前往剧本'
  return '返回处理'
})
function goProductionBlockTarget() {
  if (!scriptContent.value) {
    panel.value = 'script'
    scriptStep.value = rawContent.value ? 1 : 0
    return
  }
  panel.value = 'production'
  prodTab.value = 'assets'
}
const canExport = computed(() => !!sbs.value.length && shotVidCount.value === sbs.value.length)
function goNextProd() {
  if (prodTab.value === 'assets') {
    prodTab.value = 'storyboard'
    return
  }
  if (prodTab.value === 'storyboard') {
    prodTab.value = 'videos'
    return
  }
  if (prodTabIdx.value < prodTabDefs.value.length - 1) {
    prodTabIdx.value++
  } else {
    panel.value = 'export'
  }
}

// Script step navigation
const stepLabels = ['原始内容', 'AI 改写']
const prevStepLabel = computed(() => scriptStep.value > 0 ? stepLabels[scriptStep.value - 1] : '')
const nextStepLabel = computed(() => {
  if (scriptStep.value === 1) return '资产'
  return stepLabels[scriptStep.value + 1] || ''
})
const canGoNext = computed(() => {
  if (scriptStep.value === 0) return !!localRaw.value.trim()
  if (scriptStep.value === 1) return !!localScript.value.trim() || !!scriptContent.value
  return false
})
function goPrevStep() { if (scriptStep.value > 0) scriptStep.value-- }
function goNextStep() {
  if (scriptStep.value === 0 && localRaw.value.trim()) {
    saveRaw()
    scriptStep.value = 1
    return
  }
  if (scriptStep.value === 1 && canGoNext.value) {
    if (localScript.value.trim()) saveScr()
    panel.value = 'production'
    prodTab.value = 'assets'
  }
}

const charImgCount = computed(() => visualChars.value.filter(c => c.image_url || c.imageUrl).length)
const sceneImgCount = computed(() => scenes.value.filter(s => s.image_url || s.imageUrl).length)
const propImgCount = computed(() => propItems.value.filter(p => p.image_url || p.imageUrl).length)
const shotVidCount = computed(() => sbs.value.filter(s => s.video_url || s.videoUrl).length)
const visualCharTotal = computed(() => visualChars.value.length)
const pendingCharacterImageCount = computed(() => Math.max(visualCharTotal.value - charImgCount.value, 0))
const pendingSceneImageCount = computed(() => Math.max(scenes.value.length - sceneImgCount.value, 0))
const pendingAssetImageCount = computed(() => pendingCharacterImageCount.value + pendingSceneImageCount.value)
const assetTotalCount = computed(() => visualCharTotal.value + scenes.value.length + propItems.value.length)
const assetReadyCount = computed(() => charImgCount.value + sceneImgCount.value + propImgCount.value)

const prodTabDefs = computed(() => [
  { id: 'assets', label: '资产', icon: FolderKanban, badge: assetTotalCount.value ? `${assetReadyCount.value}/${assetTotalCount.value}` : '' },
  { id: 'storyboard', label: '分镜拆分', icon: Clapperboard, badge: sbs.value.length ? `${sbs.value.length}` : '' },
  { id: 'videos', label: '视频生成', icon: Video, badge: shotVidCount.value ? `${shotVidCount.value}/${sbs.value.length}` : '' },
])

const mainStageDefs = [
  { id: 'script', label: '剧本', desc: '内容改写与整理', icon: FileText },
  { id: 'assets', label: '资产', desc: '角色 / 场景 / 道具', icon: FolderKanban },
  { id: 'storyboard', label: '分镜', desc: '分镜拆分与提示词', icon: Clapperboard },
  { id: 'videos', label: '视频', desc: '视频任务与生成', icon: Video },
  { id: 'export', label: '导出', desc: '拼接与成片输出', icon: Download },
]

const sidebarSections = computed(() => ([
  {
    id: 'script',
    label: '剧本',
    items: [
      { key: 'script:raw', label: '原始内容', desc: '', icon: FileText, done: !!rawContent.value },
      { key: 'script:rewrite', label: 'AI 改写', desc: '', icon: FileText, done: !!scriptContent.value },
    ],
  },
  {
    id: 'production',
    label: '制作',
    items: [
      { key: 'prod:assets', label: '资产', desc: '', icon: Users, done: prodStepDone('assets') },
      { key: 'prod:storyboard', label: '分镜拆分', desc: '', icon: Clapperboard, done: prodStepDone('storyboard') },
      { key: 'prod:videos', label: '视频生成', desc: '', icon: Video, done: prodStepDone('videos') },
    ],
  },
  {
    id: 'export',
    label: '导出',
    items: [
      { key: 'export:merge', label: '拼接导出', desc: '', icon: Download, done: !!mergeUrl.value },
    ],
  },
]))

const activeMainStage = computed(() => {
  if (panel.value === 'export') return 'export'
  if (panel.value === 'production') {
    if (prodTab.value === 'assets') return 'assets'
    if (prodTab.value === 'storyboard') return 'storyboard'
    return 'videos'
  }
  return 'script'
})

function mainStageDone(stageId) {
  if (stageId === 'script') return !!scriptContent.value
  if (stageId === 'assets') return assetTotalCount.value > 0 && assetReadyCount.value === assetTotalCount.value
  if (stageId === 'videos') {
    return !!sbs.value.length && shotVidCount.value === sbs.value.length
  }
  if (stageId === 'storyboard') return !!sbs.value.length
  if (stageId === 'export') return !!mergeUrl.value
  return false
}

function goMainStage(stageId) {
  if (stageId === 'script') {
    panel.value = 'script'
    scriptStep.value = Math.min(scriptStep.value, 1)
    return
  }
  if (stageId === 'assets') {
    panel.value = 'production'
    prodTab.value = 'assets'
    return
  }
  if (stageId === 'videos') {
    panel.value = 'production'
    prodTab.value = 'videos'
    return
  }
  if (stageId === 'storyboard') {
    panel.value = 'production'
    prodTab.value = 'storyboard'
    return
  }
  panel.value = 'export'
}

const activeSubSteps = computed(() => {
  if (activeMainStage.value === 'script') {
    return [
      { key: 'script:raw', label: '原始内容', done: !!rawContent.value },
      { key: 'script:rewrite', label: 'AI 改写', done: !!scriptContent.value },
    ]
  }
  if (activeMainStage.value === 'assets') {
    return [
      { key: 'prod:assets', label: '资产', done: prodStepDone('assets') },
    ]
  }
  if (activeMainStage.value === 'videos') {
    return [
      { key: 'prod:videos', label: '视频生成', done: !!sbs.value.length && shotVidCount.value === sbs.value.length },
    ]
  }
  if (activeMainStage.value === 'storyboard') {
    return [
      { key: 'prod:storyboard', label: '分镜拆分', done: !!sbs.value.length },
    ]
  }
  return [
    { key: 'export:merge', label: '拼接导出', done: !!mergeUrl.value },
  ]
})

const activeSubStepKey = computed(() => {
  if (panel.value === 'script') {
    if (scriptStep.value === 0) return 'script:raw'
    return 'script:rewrite'
  }
  if (panel.value === 'production') return `prod:${prodTab.value}`
  return 'export:merge'
})

const sidebarJumpSteps = computed(() => {
  const section = sidebarSections.value.find((item) => item.items.some(step => step.key === activeSubStepKey.value))
  return section?.items || []
})

const bubbleSteps = computed(() => {
  if (panel.value === 'script') {
    return [
      { key: 'script:raw', label: '原始内容', done: !!rawContent.value },
      { key: 'script:rewrite', label: 'AI 改写', done: !!scriptContent.value },
    ]
  }
  if (panel.value === 'production') {
    return prodTabDefs.value.map(step => ({
      key: `prod:${step.id}`,
      label: step.label,
      done: prodStepDone(step.id),
    }))
  }
  return []
})

const activeBubbleKey = computed(() => {
  if (panel.value === 'script') return activeSubStepKey.value
  if (panel.value === 'production') return `prod:${prodTab.value}`
  return ''
})

const showBottomBubble = computed(() => panel.value === 'script' || panel.value === 'production')

function goSubStep(key) {
  if (key.startsWith('script:')) {
    panel.value = 'script'
    const stepMap = {
      'script:raw': 0,
      'script:rewrite': 1,
    }
    scriptStep.value = stepMap[key] ?? 0
    return
  }
  if (key.startsWith('prod:')) {
    panel.value = 'production'
    prodTab.value = key.replace('prod:', '')
    return
  }
  panel.value = 'export'
}

const pipelineTotal = 6
const pipelineProgress = computed(() => {
  let p = 0
  if (rawContent.value) p++
  if (scriptContent.value) p++
  if (chars.value.length) p++
  if (assetTotalCount.value > 0 && assetReadyCount.value === assetTotalCount.value) p++
  if (sbs.value.length) p++
  if (sbs.value.length && shotVidCount.value === sbs.value.length) p++
  return p
})

const currentStageLabel = computed(() => {
  if (panel.value === 'script') return `剧本阶段 · ${stepLabels[scriptStep.value]}`
  if (panel.value === 'production') return `制作阶段 · ${prodTabDefs.value[prodTabIdx.value]?.label || '制作'}`
  return mergeUrl.value ? '导出阶段 · 成片已生成' : '导出阶段 · 等待拼接'
})

const currentMainStageLabel = computed(() => {
  const current = mainStageDefs.find(stage => stage.id === activeMainStage.value)
  return current?.label || '工作台'
})

const currentSubStageLabel = computed(() => {
  const current = activeSubSteps.value.find(step => step.key === activeSubStepKey.value)
  return current?.label || currentStageLabel.value
})

const totalDuration = computed(() => sbs.value.reduce((s, sb) => s + (sb.duration || 10), 0))
const selectedSb = ref(null)
const selectedVideoTaskNumber = computed(() => {
  const index = videoTaskRows.value.findIndex(task => String(task.id) === String(selectedSb.value?.id))
  return index >= 0 ? index + 1 : 0
})

function updateField(sb, field, value) {
  const current = sb[field] ?? sb[toCamel(field)]
  if (current === value) return
  sb[field] = value
  const camelField = toCamel(field)
  if (camelField !== field) sb[camelField] = value
  storyboardAPI.update(sb.id, { [field]: value }).catch(e => toast.error(e.message))
}

function toCamel(field) {
  return field.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function getStoryboardCharacterIds(sb) {
  return sb?.character_ids || sb?.characterIds || []
}

function getStoryboardCharacters(sb) {
  const ids = getStoryboardCharacterIds(sb)
  return visualChars.value.filter(char => ids.includes(char.id))
}

function getStoryboardScene(sb) {
  const sceneId = sb?.scene_id || sb?.sceneId
  if (!sceneId) return null
  return scenes.value.find(s => s.id === sceneId) || null
}

function isStoryboardCharacterSelected(sb, charId) {
  return getStoryboardCharacterIds(sb).includes(charId)
}

function toggleStoryboardCharacter(sb, charId) {
  const currentIds = getStoryboardCharacterIds(sb)
  const nextIds = currentIds.includes(charId)
    ? currentIds.filter(id => id !== charId)
    : [...currentIds, charId]
  updateField(sb, 'character_ids', nextIds)
}

function getSceneName(sb) {
  const scene = getStoryboardScene(sb)
  if (!scene) return ''
  return `${scene.location} · ${scene.time || '未设时间'}`
}

const sceneOptions = computed(() => [
  { label: '未绑定场景', value: '' },
  ...scenes.value.map(s => ({ label: `${s.location} · ${s.time || '未设时间'}`, value: s.id })),
])

const dialogueOpen = ref(false)

function sceneShotCount(sceneId) {
  return sbs.value.filter(sb => String(sb?.scene_id || sb?.sceneId || '') === String(sceneId)).length
}

watch(rawContent, v => { localRaw.value = v }, { immediate: true })
watch(scriptContent, v => { localScript.value = v }, { immediate: true })

async function refresh() {
  try {
    drama.value = await dramaAPI.get(dramaId)
    const ep = drama.value.episodes?.find(e => (e.episode_number || e.episodeNumber) === episodeNumber)
    if (ep) {
      episode.value = ep
      try { chars.value = await episodeAPI.characters(ep.id) } catch { chars.value = [] }
      try { scenes.value = await episodeAPI.scenes(ep.id) } catch { scenes.value = [] }
      try { propItems.value = await episodeAPI.props(ep.id) } catch { propItems.value = [] }
      sbs.value = await episodeAPI.storyboards(ep.id)
      if (sbs.value.length) {
        const currentSelectedId = selectedSb.value?.id
        selectedSb.value = sbs.value.find(sb => sb.id === currentSelectedId) || sbs.value[0]
      } else {
        selectedSb.value = null
      }

      const epHasContent = !!(episode.value?.content)
      const epHasScript = !!(episode.value?.script_content || episode.value?.scriptContent)

      if (epHasScript || epHasContent) scriptStep.value = 1
      else scriptStep.value = 0
    }
  } catch (e) {
    toast.error(e.message)
  }
  try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
}

function saveRaw() { episodeAPI.update(epId.value, { content: localRaw.value }); episode.value.content = localRaw.value }
function saveScr() { episodeAPI.update(epId.value, { script_content: localScript.value }); episode.value.script_content = localScript.value }
function doRewrite() { saveRaw(); runAgent('script_rewriter', '请读取剧本并改写为格式化剧本，然后保存', dramaId, epId.value, refresh, rewriteModel.value || undefined, ownerConfigId(textModelOptions.value, rewriteModel.value)) }
function skipRewrite() {
  const raw = (localRaw.value || rawContent.value || '').trim()
  if (!raw) {
    toast.warning('请先填写原始内容')
    return
  }
  localScript.value = raw
  saveScr()
  toast.success('已跳过 AI 改写，当前将直接使用原始内容')
  panel.value = 'production'
  prodTab.value = 'assets'
}
function doExtract() { saveScr(); runAgent('extractor', '请从剧本中提取所有角色、场景和道具信息，提取时自动与项目已有数据进行去重合并', dramaId, epId.value, refresh) }
function doBreakdown() {
  const charList = chars.value.length
    ? chars.value.map(c => `${c.name}(ID:${c.id})`).join('、')
    : '（当前集还没有角色）'
  const sceneList = scenes.value.length
    ? scenes.value.map(s => `${s.location} · ${s.time || '未设时间'}(ID:${s.id})`).join('、')
    : '（当前集还没有场景）'
  runAgent('storyboard_breaker', `请基于当前集剧本拆分分镜（不需要生成视频提示词，video_prompt 在视频生成阶段按需生成）。

当前集已有角色：${charList}
当前集已有场景：${sceneList}

绑定要求：
- 每个镜头必须根据剧本内容，从上述当前集已有角色中选出出场的角色绑定 character_ids（ID 必须来自上述列表；有角色出场就必须绑定，不要遗漏）
- 每个镜头尽量匹配上述已有场景填写 scene_id（ID 必须来自上述列表），不要凭空创造新场景
- 只有纯环境空镜头才可以不绑定角色`, dramaId, epId.value, refresh)
}

// 按需为单个分镜生成视频提示词：由 storyboard_breaker 读取分镜字段生成并保存到 video_prompt
function genVideoPrompt(sb) {
  if (!sb) return
  const idx = sbs.value.indexOf(sb) + 1
  const cfg = videoConfigs.value.find(c => c.id === lockedVideoConfigId.value)
  const label = cfg ? `${cfg.name} (${cfg.provider})` : '默认'
  const charNames = getStoryboardCharacters(sb).map(c => c.name).join('、') || '无'
  runAgent('storyboard_breaker', `请为分镜 #${idx}(ID:${sb.id})生成视频提示词(video_prompt)。视频模型:${label},请根据该模型的特性和时长限制生成。

该分镜信息:时长 ${sb.duration || 10}s;场景:${getSceneName(sb) || '未绑定'};角色:${charNames}。

请先调用 read_storyboard_context 获取该分镜的画面描述、动作、氛围、对白/旁白,据此生成 video_prompt(按 3 秒分段换行、用 @角色名/@场景名 引用参考素材),然后调用 update_storyboard 保存到分镜 ID:${sb.id}。只更新 video_prompt 字段,不要改动其他字段,不要重新拆分整集。`, dramaId, epId.value, refresh)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function watchAsyncResult(check, attempts = 24, delay = 2500) {
  void (async () => {
    for (let i = 0; i < attempts; i++) {
      await sleep(delay)
      await refresh()
      if (check()) return
    }
  })()
}

async function genCharImg(id) {
  try {
    if (!isPendingCharImage(id)) pendingCharImageIds.value.push(id)
    const char = chars.value.find(c => c.id === id)
    if (char && !(char.final_prompt || char.finalPrompt)) {
      toast.info('正在生成最终提示词…')
      try {
        await ensureAssetPrompt('character', id)
      } catch {} // 提示词生成失败不阻断：后端生图前会再兜底生成或回退本地拼接
    }
    await characterAPI.generateImage(id, epId.value, imageModel.value || undefined, ownerConfigId(imageModelOptions.value, imageModel.value))
    toast.success('角色图片生成中')
    await refresh()
    watchAsyncResult(() => {
      const char = chars.value.find(c => c.id === id)
      const done = !!(char?.image_url || char?.imageUrl)
      if (done) pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
      return done
    })
  } catch (e) {
    pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
    toast.error(e.message)
  }
}
function batchCharImages() {
  const ids = visualChars.value.filter(c => !(c.image_url || c.imageUrl)).map(c => c.id)
  if (!ids.length) { toast.info('所有角色图片已生成'); return }
  pendingCharImageIds.value = [...new Set([...pendingCharImageIds.value, ...ids])]
  characterAPI.batchImages(ids, epId.value, imageModel.value || undefined, ownerConfigId(imageModelOptions.value, imageModel.value)).then(async () => {
    toast.success('角色图片批量生成中')
    await refresh()
    watchAsyncResult(() => ids.every(id => {
      const char = chars.value.find(c => c.id === id)
      const done = !!(char?.image_url || char?.imageUrl)
      if (done) pendingCharImageIds.value = pendingCharImageIds.value.filter(item => item !== id)
      return done
    }), 36)
  }).catch(e => {
    pendingCharImageIds.value = pendingCharImageIds.value.filter(item => !ids.includes(item))
    toast.error(e.message)
  })
}
async function genSceneImg(id) {
  try {
    if (!isPendingSceneImage(id)) pendingSceneImageIds.value.push(id)
    const scene = scenes.value.find(s => s.id === id)
    if (scene && !(scene.final_prompt || scene.finalPrompt)) {
      toast.info('正在生成最终提示词…')
      try {
        await ensureAssetPrompt('scene', id)
      } catch {} // 提示词生成失败不阻断：后端生图前会再兜底生成或回退本地拼接
    }
    await sceneAPI.generateImage(id, epId.value, imageModel.value || undefined, ownerConfigId(imageModelOptions.value, imageModel.value))
    toast.success('场景图片生成中')
    await refresh()
    watchAsyncResult(() => {
      const scene = scenes.value.find(s => s.id === id)
      const done = !!(scene?.image_url || scene?.imageUrl)
      if (done) pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
      return done
    })
  } catch (e) {
    pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
    toast.error(e.message)
  }
}
function isPendingPropImage(id) {
  return pendingPropImageIds.value.includes(id)
}
async function genPropImg(id) {
  try {
    if (!isPendingPropImage(id)) pendingPropImageIds.value.push(id)
    const prop = propItems.value.find(p => p.id === id)
    if (prop && !(prop.final_prompt || prop.finalPrompt)) {
      toast.info('正在生成最终提示词…')
      try {
        await ensureAssetPrompt('prop', id)
      } catch {} // 提示词生成失败不阻断：后端生图前会再兜底生成或回退本地拼接
    }
    await propAPI.generateImage(id, epId.value, imageModel.value || undefined, ownerConfigId(imageModelOptions.value, imageModel.value))
    toast.success('道具图片生成中')
    await refresh()
    watchAsyncResult(() => {
      const prop = propItems.value.find(p => p.id === id)
      const done = !!(prop?.image_url || prop?.imageUrl)
      if (done) pendingPropImageIds.value = pendingPropImageIds.value.filter(item => item !== id)
      return done
    })
  } catch (e) {
    pendingPropImageIds.value = pendingPropImageIds.value.filter(item => item !== id)
    toast.error(e.message)
  }
}
function batchSceneImages() {
  const ids = scenes.value.filter(s => !(s.image_url || s.imageUrl)).map(s => s.id)
  if (!ids.length) { toast.info('所有场景图片已生成'); return }
  pendingSceneImageIds.value = [...new Set([...pendingSceneImageIds.value, ...ids])]
  ids.forEach(id => { sceneAPI.generateImage(id, epId.value, imageModel.value || undefined, ownerConfigId(imageModelOptions.value, imageModel.value)).then(() => refresh()).catch(e => toast.error(e.message)) })
  toast.success('场景图片批量生成中')
  watchAsyncResult(() => ids.every(id => {
    const scene = scenes.value.find(s => s.id === id)
    const done = !!(scene?.image_url || scene?.imageUrl)
    if (done) pendingSceneImageIds.value = pendingSceneImageIds.value.filter(item => item !== id)
    return done
  }), 36)
}
function getVideoUrl(s) { return s?.video_url || s?.videoUrl || s?.composed_video_url || s?.composedVideoUrl || null }
function hasVid(s) { return !!getVideoUrl(s) }

function getShotReferenceImages(sb) {
  const refs = []
  const pushRef = (value) => {
    if (!value || refs.includes(value) || refs.length >= 9) return
    refs.push(value)
  }
  const scene = getStoryboardScene(sb)
  pushRef(scene?.image_url || scene?.imageUrl)
  for (const char of getStoryboardCharacters(sb)) {
    pushRef(char?.image_url || char?.imageUrl)
  }
  // 手动上传的参考图片追加到尾部（总计 ≤9）
  for (const url of videoRefImageUrls.value) pushRef(url)
  return refs
}

function getShotReferenceAssets(sb) {
  const assets = []
  const scene = getStoryboardScene(sb)
  if (scene) {
    const imageUrl = scene.image_url || scene.imageUrl || ''
    assets.push({
      key: `scene-${scene.id}`,
      type: '场景',
      name: scene.location || '未命名场景',
      meta: scene.time || '场景图',
      imageUrl,
      ready: !!imageUrl,
    })
  }
  for (const char of getStoryboardCharacters(sb)) {
    const imageUrl = char.image_url || char.imageUrl || ''
    assets.push({
      key: `character-${char.id}`,
      type: '角色',
      name: char.name || '未命名角色',
      meta: char.role || '角色形象',
      imageUrl,
      ready: !!imageUrl,
    })
  }
  return assets.slice(0, 6)
}

// 场景/角色自动绑定占用的参考图片槽位（按素材卡片数，最多 9）
const autoReferenceImageCount = computed(() => {
  const sb = selectedSb.value
  if (!sb) return 0
  let count = 0
  if (getStoryboardScene(sb)) count += 1
  count += getStoryboardCharacters(sb).length
  return Math.min(count, 9)
})

// 已占用的参考图片数（场景/角色素材 + 手动上传），展示为 n/9
const refImageUsedCount = computed(() => Math.min(9, autoReferenceImageCount.value + videoRefImageUrls.value.length))
// 是否已达 9 张上限（禁用继续上传）
const refImageFull = computed(() => refImageUsedCount.value >= 9)

// 视频提示词 @ 引用候选：当前集已有场景（按地点引用）与角色（按名字引用）
const mentionOptions = computed(() => [
  ...scenes.value.map(s => ({
    label: `${s.location} · ${s.time || '未设时间'}`,
    value: s.location,
    group: '场景',
    image: assetImageSrc(s),
  })),
  ...visualChars.value.map(c => ({
    label: c.name,
    value: c.name,
    group: '角色',
    image: assetImageSrc(c),
  })),
])

// 按参考图顺序（场景图在前、角色图在后）为 @名字 建立索引映射，供视频提示词引用替换
function getShotReferenceIndexMap(sb) {
  const ordered = []
  const seen = new Set()
  const push = (name, url) => {
    if (!url || seen.has(url) || ordered.length >= 9) return
    seen.add(url)
    ordered.push({ name, imageUrl: url })
  }
  const scene = getStoryboardScene(sb)
  push(scene?.location || '', scene?.image_url || scene?.imageUrl)
  for (const char of getStoryboardCharacters(sb)) {
    push(char.name || '', char?.image_url || char?.imageUrl)
  }
  const nameToIndex = {}
  ordered.forEach((a, i) => { if (a.name && !(a.name in nameToIndex)) nameToIndex[a.name] = i + 1 })
  return nameToIndex
}

// 将视频提示词里的 @名字 替换为 @图片N名字（N 为参考图序号，1 起），生成时使用
function resolveVideoPromptRefs(sb) {
  const prompt = sb.video_prompt || sb.videoPrompt || ''
  const map = getShotReferenceIndexMap(sb)
  const names = Object.keys(map).sort((a, b) => b.length - a.length)
  if (!names.length) return prompt
  return prompt.replace(/@([^\s@]+)/g, (m, raw) => {
    for (const name of names) {
      if (raw.startsWith(name)) {
        return `@图片${map[name]}${name}${raw.slice(name.length)}`
      }
    }
    return m
  })
}

// 切换选中分镜时重置视频生成面板
watch(selectedSb, (sb) => {
  videoRefVideoUrls.value = []
  videoRefAudioUrls.value = []
  videoRefImageUrls.value = []
  videoDuration.value = Number(sb?.duration || 10)
  dialogueOpen.value = false
})

function pickFile(accept, cb) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.onchange = () => { const f = input.files?.[0]; if (f) cb(f) }
  input.click()
}

function uploadRefMedia(kind) {
  if (kind === 'image') {
    if (refImageFull.value) { toast.info('参考图片已达上限（含场景/角色素材）'); return }
    pickFile('image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp', async (file) => {
      uploadingRefMedia.value = true
      try {
        const res = await uploadAPI.image(file)
        videoRefImageUrls.value = [...videoRefImageUrls.value, res.url]
        toast.success('参考图片已上传')
      } catch (e) { toast.error(e.message) } finally { uploadingRefMedia.value = false }
    })
    return
  }
  const isVideo = kind === 'video'
  const list = isVideo ? videoRefVideoUrls : videoRefAudioUrls
  const label = isVideo ? '视频' : '音频'
  if (list.value.length >= 3) { toast.info(`参考${label}最多 3 个`); return }
  const accept = isVideo ? 'video/mp4,video/quicktime,video/webm,.m4v' : 'audio/mpeg,audio/wav,audio/mp4,.aac'
  pickFile(accept, async (file) => {
    uploadingRefMedia.value = true
    try {
      const res = isVideo ? await uploadAPI.video(file) : await uploadAPI.audio(file)
      list.value = [...list.value, res.url]
      toast.success(`参考${label}已上传`)
    } catch (e) { toast.error(e.message) } finally { uploadingRefMedia.value = false }
  })
}

function removeRefMedia(kind, index) {
  const list = kind === 'image' ? videoRefImageUrls : kind === 'video' ? videoRefVideoUrls : videoRefAudioUrls
  list.value = list.value.filter((_, i) => i !== index)
}

async function genVid(sb) {
  const referenceImages = getShotReferenceImages(sb)
  const params = {
    storyboard_id: sb.id,
    drama_id: dramaId,
    prompt: resolveVideoPromptRefs(sb),
    duration: Number(videoDuration.value || sb.duration || 10),
    aspect_ratio: dramaAspectRatio.value,
    generate_audio: true,
    model: videoModel.value || undefined,
    config_id: ownerConfigId(videoModelOptions.value, videoModel.value),
    reference_image_urls: referenceImages,
    reference_video_urls: videoRefVideoUrls.value,
    reference_audio_urls: videoRefAudioUrls.value,
  }
  if (params.reference_audio_urls.length && !referenceImages.length && !params.reference_video_urls.length) {
    toast.error('参考音频需要至少 1 个参考图片或视频')
    return
  }
  if (!params.prompt && !referenceImages.length && !params.reference_video_urls.length && !params.reference_audio_urls.length) {
    toast.error('需要至少一个参考素材或视频提示词')
    return
  }
  try {
    delete failedVideoMessages.value[sb.id]
    if (!isPendingVideo(sb.id)) pendingVideoIds.value.push(sb.id)
    const generation = await videoAPI.generate(params)
    toast.success('视频生成中')
    await refresh()
    pollVideoGeneration(generation?.id, sb.id)
  } catch (e) {
    pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== sb.id)
    failedVideoMessages.value = {
      ...failedVideoMessages.value,
      [sb.id]: e.message || '视频生成失败',
    }
    toast.error(e.message)
  }
}
async function pollVideoGeneration(generationId, storyboardId) {
  if (!generationId) {
    watchAsyncResult(() => {
      const target = sbs.value.find(s => s.id === storyboardId)
      const done = !!(target?.video_url || target?.videoUrl)
      if (done) pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
      return done
    }, 60, 4000)
    return
  }
  for (let i = 0; i < 120; i++) {
    await sleep(4000)
    try {
      const res = await videoAPI.get(generationId)
      await refresh()
      if (res?.status === 'completed') {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        delete failedVideoMessages.value[storyboardId]
        toast.success('视频生成完成')
        return
      }
      if (res?.status === 'failed') {
        pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
        failedVideoMessages.value = {
          ...failedVideoMessages.value,
          [storyboardId]: res?.error_msg || res?.errorMsg || '视频生成失败',
        }
        toast.error(failedVideoMessages.value[storyboardId])
        return
      }
    } catch {}
  }
  pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== storyboardId)
  failedVideoMessages.value = {
    ...failedVideoMessages.value,
    [storyboardId]: '视频生成超时',
  }
  toast.error('视频生成超时')
}
function batchVideos() {
  const missing = sbs.value.filter(s => !hasVid(s) && !isPendingVideo(s.id))
  if (!missing.length) {
    toast.info('所有镜头视频已生成')
    return
  }
  const pendingIds = missing.map(s => s.id)
  pendingIds.forEach(id => {
    const sb = sbs.value.find(item => item.id === id)
    if (sb) genVid(sb)
  })
  if (pendingIds.length) {
    pendingVideoIds.value = [...new Set([...pendingVideoIds.value, ...pendingIds])]
    watchAsyncResult(() => pendingIds.every(id => {
      const target = sbs.value.find(s => s.id === id)
      const done = !!getVideoUrl(target)
      if (done) pendingVideoIds.value = pendingVideoIds.value.filter(item => item !== id)
      return done
    }), 80, 4000)
  }
}
async function doMerge() {
  await mergeAPI.merge(epId.value); toast.success('拼接中...')
  const poll = setInterval(async () => {
    try { mergeData.value = await mergeAPI.status(epId.value) } catch {}
    if (mergeData.value?.status === 'completed' || mergeData.value?.status === 'failed') {
      clearInterval(poll)
      mergeData.value.status === 'completed' ? toast.success('拼接完成') : toast.error('拼接失败')
    }
  }, 3000)
}
async function loadConfigs() {
  try {
    const [imgCfgs, vidCfgs, txtCfgs] = await Promise.all([
      aiConfigAPI.list('image'),
      aiConfigAPI.list('video'),
      aiConfigAPI.list('text'),
    ])
    imageConfigs.value = imgCfgs || []
    videoConfigs.value = vidCfgs || []
    textConfigs.value = txtCfgs || []
  } catch (e) { console.error('Failed to load AI configs', e) }
}

onMounted(() => { refresh(); loadConfigs() })
</script>

<style scoped>
/* ===== Studio Layout ===== */
.studio {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  padding: 8px;
  gap: 8px;
  background: var(--surface-base);
}

.studio-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  min-height: 48px;
  padding: 6px 10px;
  border-radius: var(--radius-lg);
  background: rgba(251,251,253,0.72);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

.studio-topbar-main,
.sidebar,
.main {
  background: var(--surface-raised);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
}

.studio-topbar-main {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  border: 0;
  box-shadow: none;
  backdrop-filter: none;
  background: transparent;
  min-width: 0;
}

.topbar-back {
  width: auto;
  min-width: 72px;
  padding: 0 12px;
  height: 26px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
  font-size: 11px;
}

.studio-identity {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.studio-overline {
  display: none;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-3);
}

.studio-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.studio-title {
  font-size: 13px;
  line-height: 1;
  letter-spacing: -0.04em;
  white-space: nowrap;
}

.studio-episode-chip {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  background: var(--accent-bg);
  color: var(--accent-text);
  font-size: 9px;
  font-weight: 700;
}

.studio-meta-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  min-width: 0;
}

.studio-meta-pill {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 8px;
  border-radius: var(--radius-pill);
  background: var(--accent-bg);
  color: var(--accent-text);
  font-size: 8px;
  font-weight: 600;
  white-space: nowrap;
}

.studio-meta-pill.is-stage {
  background: var(--accent-bg);
  color: var(--accent-text);
}
.studio-meta-pill.is-progress {
  background: var(--success-bg);
  color: var(--success);
}
.studio-meta-inline {
  font-size: 9px;
  color: var(--text-3);
  font-weight: 600;
  white-space: nowrap;
}

.studio-topbar-side {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.studio-actions {
  display: flex;
  gap: 6px;
}
.studio-topbar .btn {
  height: 26px;
  padding: 0 9px;
  font-size: 10.5px;
  white-space: nowrap;
}

.studio-body {
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr);
  gap: 8px;
  min-height: 0;
  flex: 1;
}

/* ===== Sidebar ===== */
.sidebar {
  width: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  border-radius: var(--radius);
}
.back-btn {
  min-width: 40px; width: auto; height: 40px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  gap: 6px;
  padding: 0 12px;
  border: none; border-radius: var(--radius-pill);
  background: rgba(0,0,0,0.05); color: var(--text-1);
  cursor: pointer; transition: all 0.18s var(--ease-out);
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
}
.back-btn:hover {
  background: rgba(0,0,0,0.09);
  color: var(--text-0);
}
.back-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3.5px var(--button-focus);
}

/* Pipeline Nav */
.pipeline { flex: 1; overflow-y: auto; padding: 12px 10px 8px; display: flex; flex-direction: column; gap: 8px; }
.pipe-section { display: flex; flex-direction: column; gap: 2px; }
.pipe-section-label {
  font-size: 9px; font-weight: 700; color: var(--text-3);
  text-transform: uppercase; letter-spacing: 0.06em;
  padding: 0 7px 2px;
}
.pipe-item {
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px;
  padding: 7px 10px;
  border-radius: var(--radius);
  font-size: 12px; font-weight: 600;
  background: transparent; border: 1px solid transparent; color: var(--text-2); cursor: pointer;
  transition: all 0.18s var(--ease-out); width: 100%; text-align: left;
}
.pipe-item:hover {
  background: var(--button-bg);
  border-color: var(--button-border);
  color: var(--text-0);
  box-shadow: var(--button-shadow);
}
.pipe-item.active {
  background: var(--accent-bg);
  color: var(--accent-text);
  border-color: transparent;
  box-shadow: none;
}
.pipe-item:focus-visible {
  outline: none;
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px var(--button-focus), var(--button-shadow);
}
.pipe-item.done { color: var(--text-2); }
.pipe-item-sub {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  padding: 5px 8px;
  position: relative;
  min-height: 34px;
}

.pipe-item-sub:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 15px;
  top: 23px;
  bottom: -6px;
  width: 1px;
  background: var(--border);
}

.pipe-icon {
  width: 16px; height: 16px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-2); border: 1px solid var(--border);
  color: var(--text-3); flex-shrink: 0; transition: all 0.15s;
  position: relative;
  z-index: 1;
}
.pipe-item.active .pipe-icon { background: var(--accent); border-color: var(--accent); color: #fff; }
.pipe-item.done .pipe-icon { background: var(--success-bg); border-color: rgba(52,199,89,0.3); color: var(--success); }
.pipe-item.active.done .pipe-icon { background: var(--accent); border-color: var(--accent); color: #fff; }
.icon-active { background: var(--accent) !important; border-color: var(--accent) !important; color: #fff !important; }
.icon-done { background: var(--success-bg) !important; border-color: rgba(52,199,89,0.3) !important; color: var(--success) !important; }
.pipe-item.active.done .icon-done { background: var(--accent) !important; border-color: var(--accent) !important; color: #fff !important; }

.pipe-label { flex: 1; font-size: 11px; }
.pipe-copy { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.pipe-sub {
  display: none;
  font-size: 8.5px;
  line-height: 1.35;
  color: var(--text-3);
  font-weight: 500;
}
.pipe-badge {
  font-size: 9px; font-weight: 700; padding: 1px 5px;
  border-radius: 99px; background: var(--bg-3); color: var(--text-3);
  font-family: var(--font-mono);
}
.pipe-badge.badge-done { background: var(--success-bg); color: var(--success); }
.pipe-spinner { width: 10px; height: 10px; border: 1.5px solid var(--accent-bg); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }

/* Sidebar Bottom */
.sidebar-bottom {
  padding: 9px 10px 10px;
  border-top: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 7px;
  flex-shrink: 0;
  background: var(--surface-soft);
}
.sidebar-jumper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 2px 0 1px;
}
.sidebar-jump-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  border: none;
  padding: 0;
  background: rgba(0,0,0,0.14);
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
}
.sidebar-jump-dot:hover {
  transform: scale(1.08);
}
.sidebar-jump-dot.active {
  width: 20px;
  background: var(--accent);
}
.sidebar-jump-dot.done {
  background: var(--success);
}
.sidebar-jump-dot.active.done {
  width: 20px;
  background: var(--accent);
}
.sidebar-jump-dot:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--button-focus);
}
.progress-wrap { display: flex; flex-direction: column; gap: 5px; }
.progress-head { display: flex; justify-content: space-between; }
.progress-label { font-size: 10.5px; color: var(--text-3); font-weight: 500; }
.progress-val { font-size: 10.5px; color: var(--text-2); font-family: var(--font-mono); font-weight: 600; }
.progress-track { height: 5px; background: rgba(0,0,0,0.08); border-radius: 99px; overflow: hidden; }
.progress-fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width 0.4s var(--ease-out); }
.refresh-btn {
  width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 28px;
  padding: 0 10px; font-size: 11.5px; font-weight: 650; color: var(--button-text);
  background: var(--button-bg); border: 1px solid var(--button-border); border-radius: var(--button-radius);
  cursor: pointer; transition: all 0.18s var(--ease-out);
  box-shadow: var(--button-shadow);
}
.refresh-btn:hover {
  background: var(--button-bg-hover);
  border-color: var(--button-border-hover);
  color: var(--button-text-hover);
  box-shadow: var(--button-shadow-hover);
}
.refresh-btn:focus-visible {
  outline: none;
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px var(--button-focus), var(--button-shadow-hover);
}

/* ===== Main Content ===== */
.main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; min-height: 0; border-radius: var(--radius); }
.content-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; min-height: 0; }
.stage-subnav {
  align-self: flex-start;
  margin: 10px 12px 0;
  max-width: calc(100% - 24px);
  overflow-x: auto;
  flex-shrink: 0;
}
.stage-subnav-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.stage-subnav-item.active {
  background: #fff;
  color: var(--text-0);
  box-shadow: 0 1px 4px rgba(0,0,0,0.12);
}
.stage-subnav-item.done {
  color: var(--text-1);
}
.stage-subnav-item.active.done {
  color: var(--text-0);
}
.stage-subnav-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--success);
}

/* Toolbar */
.step-toolbar {
  display: flex; align-items: center; gap: 10px;
  min-height: 44px;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
  background: var(--surface-raised); flex-shrink: 0;
}
.prod-toolbar { background: var(--surface-raised); }
.toolbar-left { display: flex; align-items: center; gap: 8px; flex: 1; }
.toolbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.step-indicator { display: flex; align-items: center; gap: 8px; }
.step-num {
  width: 26px; height: 26px; border-radius: 10px;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--accent-bg);
  font-family: var(--font-mono); font-size: 10px; font-weight: 800; color: var(--accent-text); letter-spacing: 0.05em;
}
.step-name { font-size: 12.5px; font-weight: 700; color: var(--text-1); font-family: var(--font-display); }
.char-count { font-size: 11px; color: var(--text-3); font-family: var(--font-mono); }

/* Editor Area */
.step-editor { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.fill-textarea {
  flex: 1; border: none; border-radius: 0; padding: 26px 28px;
  font-size: 13.5px; line-height: 1.9; resize: none; outline: none;
  font-family: var(--font-body); background: var(--bg-input); color: var(--text-0);
}
.fill-textarea:focus { box-shadow: none; }

/* Step Empty State */
.step-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; min-height: 300px; gap: 10px; padding: 46px;
  animation: fadeIn 0.3s var(--ease-out);
}
.empty-visual {
  width: 72px; height: 72px; border-radius: 22px;
  background: var(--bg-1); color: var(--accent);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 8px;
}
.empty-title { font-size: 22px; font-weight: 700; font-family: var(--font-display); color: var(--text-0); }
.empty-desc { font-size: 13px; color: var(--text-2); max-width: 420px; text-align: center; line-height: 1.8; }
.step-empty-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center; }

/* Step Loading */
.step-loading {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  flex: 1; gap: 12px;
}
.loading-text { font-size: 13px; color: var(--text-2); }

/* Step Navigator Bubble */
.step-bubble {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: flex; align-items: center; gap: 12px;
  padding: 6px 8px;
  border-radius: var(--radius-pill);
  background: rgba(255,255,255,0.8);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-lift);
}
.bubble-btn {
  display: flex; align-items: center; gap: 6px;
  min-height: var(--button-height-sm);
  padding: 0 12px; border-radius: var(--radius-pill); font-size: 11.5px; font-weight: 650;
  border: none; background: var(--button-bg); color: var(--button-text); cursor: pointer;
  transition: all 0.18s var(--ease-out); white-space: nowrap;
  line-height: 1;
}
.bubble-btn:hover:not(:disabled) {
  background: var(--button-bg-hover);
  color: var(--button-text-hover);
}
.bubble-btn:disabled { opacity: 0.44; cursor: not-allowed; }
.bubble-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--button-focus);
}
.bubble-btn.primary {
  margin-left: auto;
  background: var(--action-primary);
  color: var(--action-primary-text);
}
.bubble-btn.primary:hover:not(:disabled) { background: var(--action-primary-hover); }
.bubble-btn.primary:disabled { opacity: 0.5; }
.bubble-dots { display: flex; gap: 7px; padding: 0 4px; }
.bubble-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: rgba(0,0,0,0.14); cursor: pointer; transition: all 0.15s;
  border: none;
  padding: 0;
}
.bubble-dot.done { background: var(--success); }
.bubble-dot.current { background: var(--accent); transform: scale(1.2); }
.bubble-dot:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--button-focus);
}

/* Split layout (storyboard) */
.storyboard-workbench {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr) 280px;
  gap: 12px;
  padding: 12px 14px 16px;
  overflow: hidden;
}
.storyboard-shot-list {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  box-shadow: var(--shadow-card);
}
.storyboard-shot-card {
  width: 100%;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: #fff;
  color: var(--text-1);
  cursor: pointer;
  text-align: left;
  transition: background 0.16s var(--ease-out), border-color 0.16s var(--ease-out), box-shadow 0.16s var(--ease-out);
}
.storyboard-shot-card + .storyboard-shot-card { margin-top: 7px; }
.storyboard-shot-card:hover {
  border-color: var(--border-strong);
  box-shadow: var(--shadow-card);
}
.storyboard-shot-card.active {
  background: #fff;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(0,113,227,0.15);
}
.storyboard-shot-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
.storyboard-shot-chip {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--bg-2);
  color: var(--text-2);
  font-size: 10px;
  font-weight: 650;
  white-space: nowrap;
}
.storyboard-editor-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
}
.sb-header-top {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-raised);
}
.sb-header-top .detail-head-copy { flex-direction: row; align-items: baseline; gap: 4px; min-width: 0; }
.sb-header-total { font-size: 11px; white-space: nowrap; }
.sb-header-fields {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-soft);
}
.sb-field-label { font-size: 12px; color: var(--text-3); flex-shrink: 0; }
.sb-duration-input { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }
.sb-duration-input .input { width: 56px; height: 30px; padding: 4px 8px; font-size: 12.5px; }
.sb-duration-unit { font-size: 11px; color: var(--text-3); }
.sb-scene-select { min-width: 180px; max-width: 260px; flex-shrink: 0; }
.sb-scene-select .base-select-trigger { min-height: 30px; }
.sb-header-fields .role-pills { min-width: 0; }
.storyboard-editor-scroll {
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
/* 编辑器内：取消卡片式分块，改为整白面板 + 发丝分隔线 */
.storyboard-editor-scroll .detail-section {
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
}
.storyboard-editor-scroll .detail-section:last-child {
  border-bottom: none;
}
/* 上一条 / 下一条导航 */
.sb-nav-group {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.sb-nav-btn {
  flex-shrink: 0;
}
.storyboard-reference-panel {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface-muted);
}
.storyboard-ref-head {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--border);
}
.storyboard-ref-title { font-size: 13px; font-weight: 800; color: var(--text-0); }
.storyboard-ref-copy { margin-top: 3px; font-size: 11px; color: var(--text-3); }
.storyboard-ref-list {
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.storyboard-ref-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.storyboard-ref-group + .storyboard-ref-group {
  margin-top: 6px;
}
.storyboard-ref-group-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: 0.02em;
  padding: 0 2px;
}
.storyboard-ref-goto {
  align-self: flex-start;
  border: none;
  background: transparent;
  padding: 2px 6px;
  margin-left: -6px;
  border-radius: var(--radius-sm, 6px);
  font-size: 11px;
  font-weight: 600;
  color: var(--accent);
  cursor: pointer;
}
.storyboard-ref-goto:hover {
  background: var(--accent-bg);
}
.storyboard-ref-item {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 9px;
  align-items: center;
  padding: 7px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: #fff;
}
.storyboard-ref-thumb {
  width: 48px;
  aspect-ratio: 1;
  border-radius: var(--radius);
  border: 1px solid var(--surface-outline);
  overflow: hidden;
  background: var(--bg-2);
  color: var(--text-3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 800;
}
.storyboard-ref-thumb:disabled { cursor: default; }
.storyboard-ref-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* 对白折叠入口 */
.dialogue-add {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 9px 12px;
  border: 1px dashed var(--surface-outline);
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-3);
  font-size: 12px;
  cursor: pointer;
  transition: color 0.16s var(--ease-out), border-color 0.16s var(--ease-out), background 0.16s var(--ease-out);
}
.dialogue-add:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-bg);
}
.storyboard-ref-main { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.storyboard-ref-line { display: flex; align-items: center; gap: 6px; min-width: 0; }
.storyboard-ref-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 750;
  color: var(--text-0);
}
.storyboard-ref-state {
  flex-shrink: 0;
  font-size: 10px;
  color: var(--text-3);
}
.storyboard-ref-state.is-ready { color: var(--success); }
.storyboard-ref-meta {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.storyboard-ref-empty {
  padding: 14px 10px;
  color: var(--text-3);
  font-size: 12px;
  line-height: 1.5;
  border: 1px dashed var(--surface-outline);
  border-radius: var(--radius);
}
.split-layout { flex: 1; display: flex; min-height: 0; overflow: hidden; }
.shot-list { width: 296px; flex-shrink: 0; overflow-y: auto; border-right: 1px solid var(--border); background: var(--bg-0); }
.shot-list-head {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 12px 10px;
  border-bottom: 1px solid var(--surface-outline);
  background: var(--surface-raised);
  backdrop-filter: blur(10px);
}
.shot-list-title { font-size: 13px; font-weight: 700; color: var(--text-0); }
.shot-list-sub { margin-top: 3px; font-size: 11px; color: var(--text-3); line-height: 1.45; }
.shot-list-body { flex: 1; min-height: 0; overflow-y: auto; padding: 6px; }
.shot-num {
  font-size: 11px; font-family: var(--font-mono); font-weight: 700;
  color: var(--accent); background: var(--accent-bg);
  padding: 2px 6px; border-radius: 4px; flex-shrink: 0;
  letter-spacing: 0.03em;
}
.shot-body { }
.shot-desc { font-size: 12px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--text-1); }
.shot-desc.is-empty { color: var(--text-3); font-style: italic; }
.shot-meta { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; }
.shot-location {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.shot-location svg { flex-shrink: 0; }
.shot-chip-video {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  flex-shrink: 0;
  height: 16px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--info-bg);
  color: var(--info);
  font-size: 10px;
  font-weight: 650;
  white-space: nowrap;
}
.shot-avatars { display: flex; align-items: center; min-width: 0; }
.shot-avatar {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--surface-raised);
  background: var(--bg-2);
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 700;
  overflow: hidden;
  flex-shrink: 0;
}
.shot-avatar + .shot-avatar { margin-left: -4px; }
.shot-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.shot-avatar-more { font-size: 8px; color: var(--text-3); }
.shot-avatars-empty { font-size: 10px; color: var(--text-3); }
.shot-flags { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.shot-flag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
}
.shot-flag .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--bg-3); flex-shrink: 0; }
.shot-flag.on { color: var(--text-2); }
.shot-flag.flag-dialogue.on .dot { background: var(--warning); }
.shot-flag.flag-video.on .dot { background: var(--info); }
.shot-dialogue {
  font-size: 10px; color: var(--text-3); margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  padding-left: 2px; border-left: 2px solid var(--border);
  padding-left: 6px;
}

.detail-panel { flex: 1; display: flex; flex-direction: column; overflow-y: auto; min-width: 0; }
.detail-head { display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.detail-head-copy { display: flex; flex-direction: column; gap: 2px; }
.detail-head-title { font-size: 14px; font-weight: 700; color: var(--text-0); }
.detail-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.detail-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.9fr);
  gap: 12px;
  padding: 12px;
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  border: 1px solid var(--border);
}
.detail-hero-copy { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.detail-hero-label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.12em;
  text-transform: uppercase; color: var(--text-3);
}
.detail-hero-text { font-size: 13px; color: var(--text-1); line-height: 1.7; }
.detail-status-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.detail-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
  border: 1px solid var(--border);
}
.detail-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.detail-section-title { font-size: 12px; font-weight: 700; color: var(--text-0); }
.detail-section-copy { font-size: 11px; color: var(--text-3); }

/* Field */
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 12px; font-weight: 500; color: var(--text-1); }
.field-row { display: flex; gap: 12px; }
.field-grid { display: grid; gap: 12px; }
.field-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.field-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.locked-config {
  display: inline-flex;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  background: var(--surface-muted);
  border: 1px solid var(--surface-outline);
  color: var(--text-1);
  font-size: 11px;
  font-weight: 600;
}
.locked-config-banner {
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-2);
}
.role-pills { display: flex; flex-wrap: wrap; gap: 8px; }
.role-pill {
  min-height: var(--button-height-sm);
  padding: 0 12px;
  border-radius: var(--button-radius);
  border: 1px solid var(--button-border);
  background: var(--button-bg);
  color: var(--button-text);
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  cursor: pointer;
  transition: all 0.18s var(--ease-out);
  box-shadow: var(--button-shadow);
}
.role-pill:hover {
  border-color: var(--button-border-hover);
  background: var(--button-bg-hover);
  color: var(--button-text-hover);
  box-shadow: var(--button-shadow-hover);
}
.role-pill.active {
  border-color: var(--accent-glow);
  background: var(--accent-bg);
  color: var(--accent-text);
  box-shadow: var(--button-shadow);
}
.role-pill:focus-visible {
  outline: none;
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px var(--button-focus), var(--button-shadow-hover);
}

/* Production tabs */
.prod-tabs { display: flex; gap: 4px; background: var(--bg-2); border-radius: var(--radius); padding: 2px; }
.prod-tab {
  display: flex; align-items: center; gap: 4px; min-height: 26px; padding: 0 10px; font-size: 11px;
  border: 1px solid transparent; background: transparent; color: var(--text-2); cursor: pointer;
  border-radius: calc(var(--radius) - 2px); transition: all 0.18s var(--ease-out); font-weight: 650;
  line-height: 1;
}
.prod-tab:hover { color: var(--text-0); background: var(--button-bg); border-color: var(--button-border); }
.prod-tab.active { background: var(--accent-bg); color: var(--accent-text); font-weight: 650; border-color: var(--accent-glow); box-shadow: none; }
.prod-tab:focus-visible {
  outline: none;
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px var(--button-focus), var(--button-shadow);
}
.prod-tab-badge { font-size: 10px; font-family: var(--font-mono); padding: 0 4px; background: var(--bg-3); border-radius: 99px; }
.prod-tab.active .prod-tab-badge { background: var(--accent-bg); color: var(--accent-text); }

/* Production content */
.prod-content { flex: 1; overflow-y: auto; padding: 10px 12px 64px; display: flex; flex-direction: column; gap: 10px; }
.prod-section-bar { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }

/* Asset grid */
.asset-section-title {
  margin-top: 2px;
  font-size: 12px;
  font-weight: 800;
  color: var(--text-1);
  letter-spacing: 0.04em;
}
.prop-name-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.prop-name-row .asset-name {
  min-width: 0;
}
.asset-props-empty {
  padding: 14px;
  border: 1px dashed var(--surface-outline);
  border-radius: var(--radius);
  color: var(--text-3);
  font-size: 12px;
  text-align: center;
}
.asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; align-items: stretch; }
.character-asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 260px));
  justify-content: start;
  gap: 10px;
}
.asset-card {
  display: flex; flex-direction: column; overflow: hidden;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
}
.asset-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lift); }
.asset-click-card,
.character-asset-card {
  cursor: pointer;
}
.asset-click-card:focus-visible,
.character-asset-card:focus-visible {
  outline: none;
  border-color: var(--accent-glow);
  box-shadow: 0 0 0 3px var(--button-focus), var(--shadow-panel);
}
.character-asset-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
}
.character-asset-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lift);
  border-color: var(--border-strong);
}
.character-portrait {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  align-self: start;
  margin: 0;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--bg-2);
  overflow: hidden;
}
.character-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.character-portrait-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
}
.character-asset-main {
  min-width: 0;
  width: 100%;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.character-asset-overview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.character-asset-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}
.character-title-block {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.character-name-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex-wrap: wrap;
}
.character-name {
  font-size: 13px;
  line-height: 1.25;
  color: var(--text-0);
}
.character-gen-btn { flex-shrink: 0; align-self: center; }
.studio-model-picks {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-right: 12px;
  padding-right: 12px;
  border-right: 1px solid var(--border);
}
.asset-final-prompt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-top: 7px;
  border-top: 1px solid var(--border);
  font-size: 10.5px;
  line-height: 1.5;
}
.afp-label {
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: var(--text-3);
}
.afp-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
  color: var(--text-2);
}
.afp-text.dim { color: var(--text-3); }
.asset-final {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
  color: var(--text-2);
}
.asset-final .afp-label { margin-right: 4px; }
.character-visual-summary {
  max-width: 100%;
  display: flex;
  gap: 8px;
  overflow: hidden;
  color: var(--text-3);
  font-size: 10.5px;
  line-height: 1.45;
  white-space: nowrap;
}
.character-visual-summary span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.asset-cover { position: relative; aspect-ratio: 1; background: var(--bg-2); overflow: hidden; }
.asset-cover.wide { aspect-ratio: 16/9; }
.asset-cover img { width: 100%; height: 100%; object-fit: cover; }
.previewable-image { cursor: zoom-in; transition: transform 0.18s var(--ease-out), filter 0.18s var(--ease-out); }
.previewable-image:hover { transform: scale(1.015); filter: saturate(1.04); }
.asset-cover-badge {
  position: absolute;
  top: 7px;
  left: 7px;
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 1px 4px rgba(0,0,0,0.08);
  color: var(--text-2);
  font-size: 9.5px;
  font-weight: 700;
}
.asset-cover-badge.is-ready {
  background: var(--success-bg);
  color: #248a3d;
}
.asset-cover-badge.is-pending {
  background: var(--accent-bg);
  color: var(--accent-text);
}
.asset-cover-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.asset-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 11px 8px;
  min-width: 0;
}
.asset-name {
  font-size: 13px;
  font-weight: 650;
  color: var(--text-0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.asset-meta { font-size: 11px; line-height: 1.5; }
.asset-desc {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
}
.asset-light {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.asset-foot { display: flex; align-items: center; gap: 4px; padding: 7px 11px; border-top: 1px solid var(--border); }

/* Frame grid */
.frame-grid { display: flex; flex-direction: column; gap: 8px; }
.frame-row {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 14px; cursor: pointer;
  border-radius: var(--radius-lg);
  transition: all 0.15s;
  border: 1.5px solid transparent;
}
.frame-row:hover { background: var(--bg-0); border-color: var(--border); }
.frame-row.active {
  background: var(--bg-0);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
.frame-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.frame-top { display: flex; align-items: center; gap: 8px; }
.frame-num {
  font-size: 13px; font-family: var(--font-mono); font-weight: 800;
  color: var(--accent);
}
.frame-badge {
  font-size: 11px; font-weight: 600; padding: 2px 8px;
  border-radius: 20px;
  background: var(--accent-bg); color: var(--accent);
  border: 1px solid var(--accent-glow);
  white-space: nowrap;
}
.frame-desc {
  font-size: 12px; line-height: 1.5; color: var(--text-1);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.frame-meta { display: flex; align-items: center; gap: 6px; }
.frame-thumbs { display: flex; gap: 8px; flex-shrink: 0; }
.frame-thumb-wrap { display: flex; flex-direction: column; gap: 3px; align-items: center; }
.frame-thumb-label { font-size: 10px; font-weight: 600; color: var(--text-3); }
.frame-thumb {
  position: relative; width: 130px; aspect-ratio: 16/9;
  border-radius: 6px; overflow: hidden;
  background: var(--bg-2); cursor: pointer;
  transition: all 0.15s; border: 1.5px solid var(--border);
}
.frame-thumb:hover { border-color: var(--accent); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
.frame-thumb img { width: 100%; height: 100%; object-fit: cover; }
.frame-thumb-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.frame-re {
  position: absolute; top: 3px; right: 3px; width: 18px; height: 18px;
  border-radius: 50%; background: rgba(0,0,0,0.5); color: #fff;
  display: none; align-items: center; justify-content: center;
}
.frame-thumb:hover .frame-re { display: flex; }
.frame-scroll { flex: 1; overflow-y: auto; padding: 10px 12px; }
.dot { width: 7px; height: 7px; border-radius: 50%; background: var(--bg-3); flex-shrink: 0; }
.dot.ok { background: var(--success); }
.dot.pending {
  background: var(--accent);
  box-shadow: 0 0 0 3px rgba(0,113,227,0.14);
}

/* Video tasks */
.video-task-workbench {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(460px, 55%);
  overflow: hidden;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius-lg);
  background: var(--surface-raised);
}
.video-task-list {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 0;
  border-radius: 0;
  background: var(--surface-raised);
}
.video-task-head {
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--surface-outline);
}
.video-task-title {
  font-size: 13px;
  line-height: 1.2;
  font-weight: 850;
  color: var(--text-0);
}
.video-task-meta {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-3);
}
.video-task-metrics {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
}
.video-task-metric,
.video-task-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 22px;
  padding: 0 8px;
  border: 1px solid var(--surface-outline);
  border-radius: 999px;
  background: rgba(0,0,0,0.04);
  color: var(--text-2);
  font-size: 11px;
  font-weight: 750;
  white-space: nowrap;
}
.video-task-metric.is-done,
.video-task-status.is-done {
  color: var(--success);
  border-color: rgba(52,199,89,0.32);
  background: var(--success-bg);
}
.video-task-metric.is-pending,
.video-task-status.is-pending,
.video-task-status.is-ready {
  color: var(--accent-text);
  border-color: var(--accent-glow);
  background: var(--accent-bg);
}
.video-task-metric.is-failed,
.video-task-status.is-failed,
.video-task-status.is-blocked {
  color: var(--warning);
  border-color: rgba(255,159,10,0.32);
  background: var(--warning-bg);
}
.video-task-table {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.video-task-row {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-top: 1px solid var(--surface-outline);
  transition: background 0.16s var(--ease-out), border-color 0.16s var(--ease-out);
  cursor: pointer;
}
.video-task-row:first-child {
  border-top: 0;
}
.video-task-row:hover,
.video-task-row.is-pending {
  background: var(--bg-hover);
}
.video-task-row.is-failed {
  background: var(--error-bg);
}
.video-task-row.active {
  background: var(--accent-bg);
  box-shadow: inset 0 0 0 1.5px var(--accent), 0 0 0 3px rgba(0,113,227,0.15);
}
.video-task-row:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.video-task-preview {
  position: relative;
  width: 84px;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--bg-2);
}
.video-task-preview video,
.video-task-preview img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.video-task-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
}
.video-task-index {
  position: absolute;
  left: 5px;
  top: 5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(0,0,0,0.56);
  color: #fff;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 800;
}
.video-task-main {
  min-width: 0;
}
.video-task-line {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.video-task-name {
  min-width: 0;
  font-size: 13px;
  line-height: 1.35;
  color: var(--text-0);
}
.video-task-meta-line {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-3);
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
}
.video-task-loc {
  color: var(--text-2);
}
.video-task-sep { color: var(--text-3); opacity: 0.5; }
.video-task-error {
  margin-top: 5px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--error);
}
.video-task-status {
  justify-self: end;
  align-self: center;
}
.video-task-action {
  justify-self: end;
  align-self: center;
  min-width: 76px;
  justify-content: center;
}
.video-task-inspector {
  min-width: 0;
  overflow-y: auto;
  border-left: 1px solid var(--border);
  background: var(--surface-muted);
}
.video-inspector-head {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--surface-outline);
}
.video-inspector-title { color: var(--text-0); font-size: 14px; font-weight: 700; }
.video-inspector-sub { margin-top: 2px; color: var(--text-3); font-size: 11px; }
.video-inspector-body { display: flex; flex-direction: column; gap: 16px; padding: 16px 18px 18px; }
.video-inspector-section { display: flex; flex-direction: column; gap: 7px; }
.video-inspector-label { color: var(--text-0); font-size: 12px; font-weight: 700; }
.video-inspector-label-hero {
  color: var(--accent);
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.video-inspector-label-hero::before {
  content: '';
  width: 3px;
  height: 13px;
  border-radius: 2px;
  background: var(--accent);
}
.video-inspector-prompt-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.video-inspector-prompt {
  min-height: 176px;
  font-size: 13px;
  line-height: 1.6;
  border-color: var(--accent-bg);
  background: var(--accent-bg);
}
.video-inspector-assets { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 8px; }
.video-inspector-asset {
  position: relative;
  min-height: 86px;
  overflow: hidden;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--bg-2);
  color: var(--text-3);
  cursor: pointer;
}
.video-inspector-asset:disabled { cursor: default; }
.video-inspector-asset img { width: 100%; height: 86px; display: block; object-fit: cover; }
.video-inspector-asset > span { min-height: 86px; display: flex; align-items: center; justify-content: center; font-size: 11px; }
.video-inspector-asset small {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  padding: 4px 6px;
  overflow: hidden;
  background: rgba(0,0,0,0.55);
  color: #fff;
  font-size: 10px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.video-inspector-empty { padding: 12px; border: 1px dashed var(--surface-outline); border-radius: var(--radius); color: var(--text-3); font-size: 11px; }
.video-inspector-params { display: grid; gap: 8px; }
.video-inspector-params div { display: flex; justify-content: space-between; gap: 12px; font-size: 12px; }
.video-inspector-params dt { color: var(--text-3); }
.video-inspector-params dd { margin: 0; color: var(--text-1); text-align: right; }
.video-inspector-action { width: 100%; }
.video-ref-media-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.video-ref-media-chip {
  display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px;
  border: 1px solid var(--surface-outline); border-radius: 980px;
  font-size: 11px; color: var(--text-1); background: var(--surface-2, #f5f5f7);
}
.video-ref-media-remove {
  border: none; background: none; padding: 0; cursor: pointer;
  color: var(--text-3); font-size: 13px; line-height: 1;
}
.video-ref-media-remove:hover { color: var(--text-0); }
.video-ref-media-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.video-ref-media-hint { margin-top: 6px; font-size: 11px; color: var(--warning, #b25000); }
.video-param-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0; font-size: 12px; }
.video-param-name { color: var(--text-3); flex-shrink: 0; }
.video-param-value { color: var(--text-1); text-align: right; font-size: 11px; }
.video-param-control { display: inline-flex; align-items: center; gap: 6px; }
.video-param-unit { font-size: 11px; color: var(--text-3); }
.video-duration-input { width: 64px; padding: 4px 8px; font-size: 12px; }

/* Prod grid */
.prod-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
.prod-card {
  display: flex; flex-direction: column; overflow: hidden;
  transition: transform 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out), border-color 0.18s var(--ease-out);
  border-radius: 20px;
  background: var(--surface-raised);
  border: 1px solid var(--surface-outline);
}
.prod-card:hover { transform: translateY(-2px); box-shadow: var(--shadow-lift); }
.prod-cover { position: relative; aspect-ratio: 16/9; background: var(--bg-2); overflow: hidden; }
.prod-cover img { width: 100%; height: 100%; object-fit: cover; }
.prod-video { width: 100%; height: 100%; object-fit: cover; background: #000; display: block; }
.prod-cover-empty { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.prod-idx {
  position: absolute; top: 5px; left: 5px; font-size: 10px; font-weight: 700;
  font-family: var(--font-mono); background: rgba(0,0,0,0.5); color: #fff; padding: 1px 5px; border-radius: 3px;
}
.prod-overlay-badge {
  position: absolute; bottom: 5px; right: 5px; font-size: 10px; font-weight: 600;
  background: var(--success); color: #fff; padding: 1px 5px; border-radius: 3px;
}
.prod-info { padding: 10px 12px 8px; }
.prod-desc { font-size: 12px; line-height: 1.4; }
.prod-meta-line { margin-top: 5px; font-size: 10px; color: var(--text-3); }
.prod-dots { display: flex; align-items: center; gap: 4px; margin-top: 5px; color: var(--text-3); }
.prod-error {
  margin-top: 6px;
  font-size: 11px;
  line-height: 1.45;
  color: var(--error);
}
.prod-actions { display: flex; gap: 6px; padding: 8px 10px 10px; border-top: 1px solid var(--surface-outline); }
.prod-actions .btn { flex: 1; justify-content: center; }

/* Asset detail dialog */
.asset-detail-overlay {
  z-index: 118;
  padding: 28px;
}
.asset-detail-dialog {
  width: min(1040px, calc(100vw - 56px));
  max-height: calc(100vh - 56px);
}
.asset-detail-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--surface-outline);
}
.asset-detail-title-block {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.asset-detail-kicker {
  color: var(--text-3);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.asset-detail-title {
  margin: 0;
  color: var(--text-0);
  font-size: 18px;
  line-height: 1.2;
  font-family: var(--font-display);
}
.asset-detail-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.asset-detail-body {
  min-height: 0;
  overflow: auto;
  padding: 16px;
}
.asset-detail-shell {
  display: grid;
  grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.asset-detail-preview-panel,
.asset-detail-editor-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.asset-detail-preview-panel {
  position: sticky;
  top: 0;
}
.asset-detail-section-title {
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--text-1);
  font-size: 12px;
  font-weight: 820;
  letter-spacing: 0.02em;
}
.asset-detail-section-title .dim {
  font-size: 11px;
  font-weight: 560;
  letter-spacing: 0;
  text-align: right;
}
.asset-detail-state {
  min-height: 20px;
  display: inline-flex;
  align-items: center;
  padding: 0 7px;
  border-radius: 999px;
  background: rgba(0,0,0,0.05);
  color: var(--text-3);
  font-size: 10px;
  font-weight: 760;
  white-space: nowrap;
}
.asset-detail-state.is-ready {
  color: var(--success);
  background: var(--success-bg);
}
.asset-detail-media-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  display: block;
  padding: 0;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--bg-2);
  color: var(--text-3);
  overflow: hidden;
  cursor: zoom-in;
}
.asset-detail-media-frame:disabled {
  cursor: default;
  opacity: 1;
}
.asset-detail-media-frame:focus-visible {
  outline: none;
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px var(--button-focus);
}
.asset-detail-media-frame img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.asset-detail-media-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
}
.asset-detail-desc {
  margin: 0;
  color: var(--text-1);
  font-size: 13px;
  line-height: 1.7;
}
.asset-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.asset-detail-field {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--surface-muted);
}
.asset-detail-field span,
.asset-detail-edit-field span,
.asset-detail-text-block span,
.asset-detail-shot-head {
  display: block;
  color: var(--text-3);
  font-size: 10px;
  font-weight: 780;
  letter-spacing: 0.04em;
}
.asset-detail-field strong {
  display: block;
  margin-top: 5px;
  min-width: 0;
  overflow: hidden;
  color: var(--text-0);
  font-size: 12px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-detail-text-block {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.asset-detail-edit-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.asset-detail-edit-grid--character,
.asset-detail-edit-grid--scene {
  grid-template-columns: 1fr;
}
.asset-detail-edit-field {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.asset-detail-textarea {
  min-height: 138px;
  resize: vertical;
}
.asset-detail-edit-grid--character .asset-detail-textarea,
.asset-detail-edit-grid--scene .asset-detail-textarea {
  min-height: 164px;
}
.asset-detail-meta-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.asset-detail-meta-item {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--surface-muted);
}
.asset-detail-meta-item span {
  display: block;
  color: var(--text-3);
  font-size: 10px;
  font-weight: 780;
  letter-spacing: 0.04em;
}
.asset-detail-meta-item strong {
  display: block;
  margin-top: 4px;
  min-width: 0;
  color: var(--text-0);
  font-size: 12px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-detail-text-block > div,
.asset-detail-shot-list {
  padding: 10px;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--surface-muted);
}
.asset-detail-text-block p {
  margin: 5px 0 0;
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.55;
}
.asset-detail-shot-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.asset-detail-shot-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.asset-detail-shot-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-size: 11px;
}
.asset-detail-shot-row strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text-1);
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-detail-shot-row small,
.asset-detail-empty {
  color: var(--text-3);
  font-size: 11px;
}
.asset-detail-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--surface-outline);
}
.asset-detail-secondary-actions,
.asset-detail-primary-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.asset-detail-prompt-panel {
  min-width: 0;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--surface-outline);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.asset-detail-prompt-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.asset-detail-copy-btn {
  gap: 5px;
}
.asset-detail-prompt-textarea {
  min-height: 96px;
  max-height: 260px;
  overflow: auto;
  padding: 12px 14px;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--surface-muted);
  color: var(--text-1);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  resize: vertical;
  width: 100%;
}
.asset-detail-prompt-hint {
  margin: 0;
  color: var(--text-3);
  font-size: 11px;
  line-height: 1.5;
}
.asset-detail-readonly-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.asset-detail-readonly {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--surface-outline);
  border-radius: var(--radius);
  background: var(--surface-muted);
}
.asset-detail-readonly span {
  display: block;
  color: var(--text-3);
  font-size: 10px;
  font-weight: 780;
  letter-spacing: 0.04em;
}
.asset-detail-readonly p {
  margin: 6px 0 0;
  color: var(--text-1);
  font-size: 12px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}
.asset-detail-readonly p.dim {
  color: var(--text-3);
}

/* Image viewer */
.image-viewer-overlay {
  z-index: 120;
  padding: 28px;
}
.image-viewer-dialog {
  width: min(1100px, calc(100vw - 56px));
  max-height: calc(100vh - 56px);
  background: rgba(255,255,255,0.85);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}
.image-viewer-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--surface-outline);
}
.image-viewer-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-1);
  font-family: var(--font-display);
}
.image-viewer-body {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: auto;
  min-height: 0;
}
.image-viewer-img {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 140px);
  border-radius: 18px;
  box-shadow: 0 18px 48px rgba(0,0,0,0.18);
  background: var(--surface-muted);
}

/* Export */
.export-split { flex: 1; display: flex; min-height: 0; }
.export-main { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; }
.export-player {
  width: 100%;
  max-width: 720px;
  border-radius: var(--radius-lg);
  background: #000;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.export-video { width: 100%; max-width: 720px; border-radius: var(--radius-lg); background: #000; display: block; }
.export-bar { display: flex; align-items: center; gap: 12px; margin-top: 16px; width: 100%; max-width: 720px; }
.export-list { width: 240px; flex-shrink: 0; border-left: 1px solid var(--border); display: flex; flex-direction: column; overflow: hidden; background: var(--surface-muted); }
.export-list-head { padding: 11px 14px; font-size: 11px; font-weight: 700; color: var(--text-3); border-bottom: 1px solid var(--border); text-transform: uppercase; letter-spacing: 0.06em; }
.export-list-body { flex: 1; overflow-y: auto; padding: 6px; display: flex; flex-direction: column; gap: 6px; }
.exp-row { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--radius); background: #fff; border: 1px solid var(--border); }
.exp-row:hover { border-color: var(--border-strong); box-shadow: var(--shadow-card); }

/* Shared */
.dim { color: var(--text-3); }

@media (max-width: 1080px) {
  .studio-body {
    grid-template-columns: 1fr;
  }

  .split-layout,
  .export-split {
    flex-direction: column;
  }

  .storyboard-workbench {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .storyboard-shot-list,
  .storyboard-editor-main,
  .storyboard-reference-panel {
    min-height: 280px;
  }

  .sb-scene-select { max-width: none; flex: 1; }

  .shot-list,
  .export-list {
    width: 100%;
  }

  .detail-panel {
    min-height: 420px;
  }

  .field-grid-4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .character-asset-grid {
    grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
  }

  .video-task-head {
    align-items: flex-start;
    flex-direction: column;
  }

  .video-task-metrics {
    width: 100%;
    margin-left: 0;
    justify-content: flex-start;
  }

  .video-task-row {
    grid-template-columns: 84px minmax(0, 1fr);
  }

  .video-task-preview {
    width: 84px;
  }

  .video-task-status,
  .video-task-action {
    justify-self: start;
  }

  .image-viewer-overlay {
    padding: 16px;
  }

  .image-viewer-dialog {
    width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
  }

  .asset-detail-overlay {
    padding: 16px;
  }

  .asset-detail-dialog {
    width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
  }

  .asset-detail-shell {
    grid-template-columns: 1fr;
  }

  .asset-detail-preview-panel {
    position: static;
  }

  .asset-detail-grid,
  .asset-detail-edit-grid,
  .asset-detail-text-block {
    grid-template-columns: 1fr;
  }

}

@media (max-width: 860px) {
  .studio {
    padding: 8px;
    gap: 8px;
  }

  .studio-topbar-main {
    align-items: flex-start;
  }

  .studio-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .studio-topbar-side {
    justify-content: space-between;
  }

  .sidebar {
    max-height: 340px;
  }

  .studio-topbar-side,
  .studio-actions {
    flex-wrap: wrap;
  }

  .toolbar-right,
  .step-bubble,
  .export-bar {
    flex-wrap: wrap;
  }

  .asset-grid,
  .character-asset-grid,
  .prod-grid {
    grid-template-columns: 1fr;
  }

  .character-asset-card {
    min-height: 0;
  }

  .character-asset-overview {
    grid-template-columns: 1fr;
  }

  .character-portrait {
    width: auto;
  }

  .character-asset-main {
    padding: 10px;
  }

  .character-asset-head {
    align-items: stretch;
    flex-direction: column;
  }

  .video-task-workbench {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }

  .video-task-inspector {
    border-top: 1px solid var(--surface-outline);
    border-left: 0;
  }

  .frame-row {
    flex-direction: column;
    align-items: stretch;
  }

  .detail-hero {
    grid-template-columns: 1fr;
  }

  .field-grid-2,
  .field-grid-4 {
    grid-template-columns: 1fr;
  }

  .frame-thumbs {
    width: 100%;
  }

  .frame-thumb {
    width: 100%;
  }

}
</style>
