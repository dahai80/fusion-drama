<template>
  <div class="settings-page">
    <h1 class="page-title">设置中心</h1>
    <div class="settings-layout">
      <aside class="settings-nav">
        <div class="nav-group">
          <div class="nav-group-label">基础</div>
          <button v-for="t in baseTabs" :key="t.id" :class="['nav-item', { active: tab === t.id }]" @click="tab = t.id">
            <component :is="t.icon" :size="14" />
            {{ t.label }}
          </button>
        </div>
        <div class="nav-advanced">
          <label class="advanced-toggle">
            <span>Agent 高级配置</span>
            <input type="checkbox" v-model="showAdvanced" class="sr-only" />
            <span class="switch" :class="{ on: showAdvanced }"></span>
          </label>
          <p class="advanced-note">仅展开 Agent 配置与 Skills。工作台功能和分镜字段保持默认可见。</p>
        </div>
        <div v-if="showAdvanced" class="nav-group">
          <div class="nav-group-label">高级</div>
          <button v-for="t in advancedTabs" :key="t.id" :class="['nav-item', { active: tab === t.id }]" @click="tab = t.id">
            <component :is="t.icon" :size="14" />
            {{ t.label }}
          </button>
        </div>
      </aside>

      <div class="settings-content">

        <!-- ===== AI 服务配置 ===== -->
        <div v-if="tab === 'ai'" class="settings-scroll">
          <div class="settings-head">
            <h2 class="settings-title">AI 服务配置</h2>
            <p class="settings-desc">先用推荐模板快速落配置，再按服务类型微调。工作台创建集时会锁定所选图片和视频能力。</p>
          </div>
          <section class="card quick-card">
            <div class="quick-card-head">
              <div class="setup-title">火宝快捷配置</div>
              <span class="tag tag-accent">推荐</span>
            </div>
            <p class="setup-desc">
              输入 Huobao API Key，一次写入文本、图片、视频三条推荐配置。
              <a class="huobao-site-link" href="https://api.chatfire.site" target="_blank" rel="noopener noreferrer">
                前往 api.chatfire.site 获取 Key
                <ExternalLink :size="12" :stroke-width="1.8" />
              </a>
            </p>
            <div class="huobao-quick-row">
              <input v-model="huobaoApiKey" class="input" type="password" placeholder="Huobao API Key" />
              <button class="btn btn-primary" :disabled="huobaoSaving" @click="applyHuobaoQuickConfig">
                <Loader2 v-if="huobaoSaving" :size="13" class="animate-spin" />
                <Sparkles v-else :size="13" />
                写入火宝配置
              </button>
            </div>
            <div class="huobao-quick-models">
              <div v-for="q in huobaoQuickConfigs" :key="q.service_type" class="hqm-row">
                <span class="hqm-label">{{ serviceMeta[q.service_type].label }}</span>
                <span class="hqm-models mono">
                  <span v-for="(m, i) in q.model" :key="m" :class="['hqm-model', { 'is-default': i === 0 }]">
                    {{ m }}<em v-if="i === 0">默认</em>
                  </span>
                </span>
              </div>
            </div>
          </section>
          <section class="card setup-panel">
            <div class="setup-panel-head compact">
              <div>
                <div class="setup-title">手动模板</div>
                <div class="setup-desc">选择服务类型后，直接用模板填充推荐的 `provider / base URL / model`。</div>
              </div>
            </div>
            <div class="template-row">
              <button
                v-for="st in serviceTypes"
                :key="st.type"
                class="template-type-chip"
                @click="startAddCfg(st.type)"
              >
                {{ st.label }}
              </button>
            </div>
          </section>
          <div class="sections">
            <section v-for="st in serviceTypes" :key="st.type" class="card svc-group">
              <div class="svc-group-head">
                <div class="svc-group-heading">
                  <span class="svc-group-title">{{ st.label }}</span>
                  <div class="svc-group-sub">{{ serviceMeta[st.type].desc }}</div>
                </div>
                <span v-if="countActive(st.type)" class="tag tag-accent">{{ countActive(st.type) }} 已启用</span>
                <button class="btn btn-ghost btn-sm ml-auto" @click="startAddCfg(st.type)"><Plus :size="13" /> 添加</button>
              </div>
              <div v-for="c in byType(st.type)" :key="c.id" class="config-row">
                <div class="provider-badge" :data-provider="c.provider">{{ c.provider.slice(0, 1).toUpperCase() }}</div>
                <div class="config-main">
                  <div class="config-line">
                    <span class="config-name">{{ c.name || `${c.provider}-${c.service_type}` }}</span>
                    <span :class="['tag', c.api_key ? 'tag-success' : 'tag-error']">{{ c.api_key ? '已配置' : '无密钥' }}</span>
                  </div>
                  <div class="config-sub mono truncate">{{ fmtModel(c.model) }} · {{ c.base_url || '未设置 Base URL' }}</div>
                </div>
                <button v-if="st.type === 'text'" class="btn btn-ghost btn-sm" @click="testExistingCfg(c)">测试</button>
                <label class="config-switch">
                  <input type="checkbox" class="sr-only" :checked="c.is_active" @change="toggleCfg(c)">
                  <span class="switch" :class="{ on: c.is_active }"></span>
                </label>
                <button class="btn btn-ghost btn-icon btn-sm" @click="startEditCfg(c)"><Pencil :size="13" /></button>
                <button class="btn btn-danger btn-icon btn-sm" @click="delCfg(c.id)"><Trash2 :size="13" /></button>
              </div>
              <p v-if="!byType(st.type).length" class="config-empty">暂无配置</p>
            </section>
          </div>
        </div>

        <!-- ===== 风格预设 ===== -->
        <div v-else-if="tab === 'styles'" class="settings-scroll">
          <div class="settings-head">
            <h2 class="settings-title">风格预设</h2>
            <p class="settings-desc">创建项目时选择的视觉风格，其英文提示词片段会自动注入角色图与场景图生成。停用的风格不出现在创建选项中。</p>
          </div>
          <section class="card svc-group">
            <div class="svc-group-head">
              <div class="svc-group-heading">
                <span class="svc-group-title">全部风格</span>
                <div class="svc-group-sub">{{ stylePresets.filter(p => p.is_active).length }} 个启用 · {{ stylePresets.length }} 个总计</div>
              </div>
              <button class="btn btn-ghost btn-sm ml-auto" @click="startAddStyle"><Plus :size="13" /> 添加</button>
            </div>
            <div v-for="p in stylePresets" :key="p.id" class="config-row">
              <div class="provider-badge style-badge"><Palette :size="15" /></div>
              <div class="config-main">
                <div class="config-line">
                  <span class="config-name">{{ p.name }}</span>
                  <span class="tag mono">{{ p.value }}</span>
                  <span v-if="!p.is_active" class="tag">已停用</span>
                </div>
                <div class="config-sub mono truncate">{{ p.prompt }}</div>
                <div v-if="p.description" class="config-sub truncate">{{ p.description }}</div>
              </div>
              <label class="config-switch">
                <input type="checkbox" class="sr-only" :checked="p.is_active" @change="toggleStyle(p)">
                <span class="switch" :class="{ on: p.is_active }"></span>
              </label>
              <button class="btn btn-ghost btn-icon btn-sm" @click="startEditStyle(p)"><Pencil :size="13" /></button>
              <button class="btn btn-danger btn-icon btn-sm" @click="styleToDelete = p"><Trash2 :size="13" /></button>
            </div>
            <p v-if="!stylePresets.length" class="config-empty">暂无风格预设</p>
          </section>
        </div>

        <!-- ===== Agent 配置 ===== -->
        <div v-else-if="tab === 'agents'" class="settings-scroll">
          <div class="settings-head">
            <h2 class="settings-title">Agent 配置</h2>
            <p class="settings-desc">高级区只保留 Agent 运行配置。这里可以调整模型、提示词和参数，保存后立即生效。</p>
          </div>
          <div class="agent-list">
            <div v-for="a in agentDefs" :key="a.type" class="card agent-card">
              <div class="agent-card-head" @click="toggleAgentEdit(a.type)">
                <div class="agent-type-badge">{{ a.icon }}</div>
                <div class="agent-card-heading">
                  <div class="agent-card-title">{{ a.label }}</div>
                  <div class="agent-card-type dim">{{ a.type }}</div>
                </div>
                <span v-if="getAgentCfg(a.type)" class="tag tag-success">已配置</span>
                <span v-else class="tag">默认</span>
                <ChevronDown :size="14" :style="{ transform: editingAgent === a.type ? 'rotate(180deg)' : '', transition: '0.2s' }" />
              </div>
              <div v-if="editingAgent === a.type" class="agent-card-body">
                <label class="field">
                  <span class="field-label">模型 <span class="dim">(留空使用 AI 服务默认)</span></span>
                  <BaseSelect v-model="agentForm.model" :options="textModelSelectOptions" placeholder="— 使用 AI 服务默认 —" searchable />
                </label>
                <div class="field-row">
                  <label class="field">
                    <span class="field-label">Temperature</span>
                    <input v-model.number="agentForm.temperature" class="input" type="number" min="0" max="2" step="0.1" />
                  </label>
                  <label class="field">
                    <span class="field-label">Max Tokens</span>
                    <input v-model.number="agentForm.max_tokens" class="input" type="number" min="100" max="32000" />
                  </label>
                </div>
                <label class="field">
                  <span class="field-label">System Prompt</span>
                  <textarea v-model="agentForm.system_prompt" class="textarea" rows="12" placeholder="Agent 系统提示词..." />
                </label>
                <div class="agent-card-foot">
                  <button class="btn btn-ghost btn-sm" @click="resetAgentPrompt(a.type)">恢复默认</button>
                  <span v-if="agentSaved === a.type" class="tag tag-success" style="margin-left:8px">
                    <Check :size="10" /> 已保存
                  </span>
                  <button class="btn btn-primary btn-sm ml-auto" :disabled="agentSaving" @click="saveAgentCfg(a.type)">
                    <Loader2 v-if="agentSaving" :size="12" class="animate-spin" />
                    保存
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ===== Skills 编辑 ===== -->
        <div v-else-if="tab === 'skills'" class="skills-layout">
          <!-- Agent 左侧列表 -->
          <aside class="skills-agent-list">
            <div class="skills-agent-title">Agent 列表</div>
            <button
              v-for="a in agentDefs"
              :key="a.type"
              :class="['skills-agent-item', { active: selectedAgent === a.type }]"
              @click="selectAgent(a.type)"
            >
              <span class="agent-type-badge">{{ a.icon }}</span>
              <span class="skills-agent-label">{{ a.label }}</span>
              <span v-if="agentSkillCount(a.type) > 0" class="skill-count-badge">{{ agentSkillCount(a.type) }}</span>
            </button>
          </aside>

          <!-- Skill 管理右侧主区域 -->
          <div class="settings-scroll skills-main">
            <div class="settings-head skills-head">
              <span class="agent-type-badge skills-head-badge">{{ selectedAgentIcon }}</span>
              <div class="skills-head-copy">
                <h2 class="settings-title">{{ selectedAgentLabel }}</h2>
                <div class="dim" style="font-size:12px;margin-top:2px">{{ selectedAgentType }} — Skills</div>
                <p class="settings-desc">Skills 仅作为 Agent 的高级提示词层使用，不影响工作台常规功能入口。</p>
              </div>
              <button class="btn btn-primary btn-sm ml-auto" @click="startAddSkill">
                <Plus :size="13" /> 新增 Skill
              </button>
            </div>

            <!-- 无 skill 提示 -->
            <div v-if="!currentSkills.length" class="card skills-empty">
              <div class="skills-empty-icon">
                <FileText :size="24" />
              </div>
              <div class="skills-empty-title">暂无 Skill</div>
              <div class="skills-empty-desc">点击右上角「新增 Skill」创建第一个提示词文件</div>
            </div>

            <!-- Skill 列表 -->
            <div class="skill-list" v-else>
              <div v-for="s in currentSkills" :key="s.id" class="card skill-card">
                <div class="skill-card-head" @click="toggleSkillEdit(s.id)">
                  <FileText :size="14" style="color:var(--accent);flex-shrink:0" />
                  <div style="flex:1;min-width:0">
                    <div style="font-weight:600;font-size:13px">{{ s.name }}</div>
                    <div class="dim" style="font-size:11px">{{ s.description }}</div>
                  </div>
                  <button class="btn btn-danger btn-icon btn-sm" style="margin-right:4px" @click.stop="skillToDelete = s.id">
                    <Trash2 :size="13" />
                  </button>
                  <ChevronDown :size="14" :style="{ transform: editingSkill === s.id ? 'rotate(180deg)' : '', transition: '0.2s' }" />
                </div>
                <div v-if="editingSkill === s.id" class="skill-card-body">
                  <textarea
                    v-model="skillContent"
                    class="textarea mono"
                    rows="20"
                    style="font-size:12px;line-height:1.6"
                    placeholder="编写 SKILL.md 内容..."
                  />
                  <div class="skill-card-foot">
                    <span class="dim" style="font-size:11px">skills/{{ selectedAgentType }}/{{ s.id }}/SKILL.md</span>
                    <span v-if="skillSaved === s.id" class="tag tag-success" style="margin-left:8px">
                      <Check :size="10" /> 已保存
                    </span>
                    <button class="btn btn-primary btn-sm ml-auto" :disabled="skillSaving" @click="saveSkill(s.id)">
                      <Loader2 v-if="skillSaving" :size="12" class="animate-spin" />
                      保存
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- AI Config Dialog -->
    <div v-if="cfgDialog" class="overlay" @click.self="cfgDialog = false">
      <form class="dialog config-dialog" @submit.prevent="saveCfg">
        <div class="dialog-head">
          <div>
            <div class="dialog-title">{{ cfgEditId ? '编辑服务配置' : `添加${serviceMeta[cfgForm.service_type].label}服务` }}</div>
            <div class="dialog-sub">推荐先选择模板，系统会自动填入更合理的 `Base URL` 与默认模型。</div>
          </div>
          <span class="tag tag-accent ml-auto">{{ serviceMeta[cfgForm.service_type].label }}</span>
        </div>
        <div class="dialog-body config-dialog-body">
          <div class="preset-picker">
            <button
              v-for="preset in presetsByType(cfgForm.service_type)"
              :key="`${cfgForm.service_type}-${preset.provider}`"
              type="button"
              class="preset-pill"
              @click="applyProviderPreset(cfgForm.service_type, preset.provider)"
            >
              {{ preset.label }}
            </button>
          </div>
          <label class="field">
            <span class="field-label">配置名称</span>
            <input v-model="cfgForm.name" class="input" placeholder="如 火宝默认图像服务" />
          </label>
          <label class="field"><span class="field-label">服务商</span>
            <BaseSelect v-model="cfgForm.provider" :options="providerSelectOptions" placeholder="选择服务商" searchable />
          </label>
          <label class="field">
            <span class="field-label">优先级</span>
            <input v-model.number="cfgForm.priority" class="input" type="number" min="0" max="999" />
            <span class="field-hint">数值越高越优先。工作台默认会优先使用同类型里优先级最高的启用配置。</span>
          </label>
          <label class="field"><span class="field-label">API Key</span><input v-model="cfgForm.api_key" class="input" type="password" placeholder="sk-..." /></label>
          <label class="field"><span class="field-label">Base URL</span><input v-model="cfgForm.base_url" class="input" placeholder="https://..." /></label>
          <label class="field"><span class="field-label">模型（逗号分隔）</span><input v-model="cfgForm.modelStr" class="input" placeholder="model-name" /></label>
          <div v-if="cfgTestResult" class="test-result" :class="{ ok: cfgTestResult.reachable, bad: !cfgTestResult.reachable }">
            <div class="test-result-head">
              <span class="tag" :class="cfgTestResult.reachable ? 'tag-success' : 'tag-error'">{{ cfgTestResult.status || 'ERROR' }}</span>
              <span>{{ cfgTestResult.message }}</span>
            </div>
            <div class="mono test-result-url">{{ cfgTestResult.method }} {{ cfgTestResult.url }}</div>
            <div v-if="cfgTestResult.response_preview" class="mono test-result-preview">{{ cfgTestResult.response_preview }}</div>
          </div>
        </div>
        <div class="dialog-foot">
          <button type="button" class="btn btn-ghost test-draft-btn" :disabled="cfgTesting" @click="testDraftCfg">
            <Loader2 v-if="cfgTesting" :size="12" class="animate-spin" />
            <span v-else>测试配置</span>
          </button>
          <button type="button" class="btn" @click="cfgDialog = false">取消</button>
          <button type="submit" class="btn btn-primary">保存</button>
        </div>
      </form>
    </div>

    <!-- Add Skill Dialog -->
    <div v-if="addSkillDialog" class="overlay" @click.self="addSkillDialog = false">
      <form class="dialog skill-dialog" @submit.prevent="confirmAddSkill">
        <div class="dialog-head">
          <div class="dialog-title">新增 Skill — {{ selectedAgentLabel }}</div>
        </div>
        <div class="dialog-body skill-dialog-body">
          <label class="field">
            <span class="field-label">Skill 目录名 <span class="dim">(英文，唯一)</span></span>
            <input v-model="newSkillForm.id" class="input" placeholder="如 custom-extraction" />
          </label>
          <label class="field">
            <span class="field-label">名称</span>
            <input v-model="newSkillForm.name" class="input" placeholder="如 自定义提取规则" />
          </label>
          <label class="field">
            <span class="field-label">描述</span>
            <input v-model="newSkillForm.description" class="input" placeholder="简短描述此 Skill 的用途" />
          </label>
        </div>
        <div class="dialog-foot">
          <button type="button" class="btn" @click="addSkillDialog = false">取消</button>
          <button type="submit" class="btn btn-primary" :disabled="!newSkillForm.id">创建</button>
        </div>
      </form>
    </div>

    <!-- Style Preset Dialog -->
    <div v-if="styleDialog" class="overlay" @click.self="styleDialog = false">
      <form class="dialog config-dialog" @submit.prevent="saveStyle">
        <div class="dialog-head">
          <div>
            <div class="dialog-title">{{ styleEditId ? '编辑风格预设' : '添加风格预设' }}</div>
            <div class="dialog-sub">提示词片段为英文，会在生成角色图与场景图时自动拼入提示词。</div>
          </div>
          <span class="tag tag-accent ml-auto"><Palette :size="12" /> 风格</span>
        </div>
        <div class="dialog-body config-dialog-body">
          <label class="field">
            <span class="field-label">风格名称 <span class="required">*</span></span>
            <input v-model="styleForm.name" class="input" placeholder="如 3D、动漫、写实电影" />
          </label>
          <label class="field">
            <span class="field-label">风格 key <span class="required">*</span></span>
            <input v-model="styleForm.value" class="input mono" placeholder="如 3d、anime（小写字母/数字/中划线）" :disabled="!!styleEditId" />
            <span class="field-hint">存入项目的风格标识，创建后不可修改。</span>
          </label>
          <label class="field">
            <span class="field-label">提示词片段（英文） <span class="required">*</span></span>
            <textarea v-model="styleForm.prompt" class="textarea" rows="3" placeholder="如 anime style, cel shading, vibrant colors, clean line art"></textarea>
          </label>
          <label class="field">
            <span class="field-label">描述</span>
            <input v-model="styleForm.description" class="input" placeholder="一句话说明该风格的适用场景" />
          </label>
          <label class="field">
            <span class="field-label">排序</span>
            <input v-model.number="styleForm.sort_order" class="input" type="number" min="0" max="999" />
          </label>
        </div>
        <div class="dialog-foot">
          <button type="button" class="btn" @click="styleDialog = false">取消</button>
          <button type="submit" class="btn btn-primary">保存</button>
        </div>
      </form>
    </div>
    <ConfirmDialog
      :open="!!styleToDelete"
      title="删除风格预设"
      :message="`确定删除风格「${styleToDelete?.name}」？已使用此风格的项目不受影响，但删除的内置风格重启后可能恢复，建议改用「停用」。`"
      :loading="deletingStyle"
      @confirm="confirmDelStyle"
      @cancel="styleToDelete = null"
    />
    <ConfirmDialog
      :open="!!skillToDelete"
      title="删除 Skill"
      :message="`确定删除 Skill「${skillToDelete}」？删除后对应 Agent 将回退到内置默认提示词。`"
      :loading="deletingSkill"
      @confirm="confirmDelSkill"
      @cancel="skillToDelete = null"
    />
  </div>
</template>

<script setup>
import { Plus, Pencil, Trash2, FileText, ChevronDown, Check, Loader2, Bot, Cpu, Sparkles, Palette, ExternalLink } from 'lucide-vue-next'
import BaseSelect from '~/components/BaseSelect.vue'
import { toast } from 'vue-sonner'
import { aiConfigAPI, agentConfigAPI, skillsAPI, stylePresetAPI } from '~/composables/useApi'
import brandLogo from '~/assets/huobao-logo.png'

const showBrandImage = ref(true)
const tab = ref('ai')
const showAdvanced = ref(false)
const baseTabs = [
  { id: 'ai', label: 'AI 服务', icon: Cpu },
  { id: 'styles', label: '风格预设', icon: Palette },
]
const advancedTabs = [
  { id: 'agents', label: 'Agent 配置', icon: Bot },
  { id: 'skills', label: 'Skills', icon: FileText },
]
watch(showAdvanced, (v) => {
  if (!v && advancedTabs.some(t => t.id === tab.value)) tab.value = 'ai'
})

// ===== AI Service Configs =====
const cfgs = ref([])
const cfgDialog = ref(false)
const cfgEditId = ref(null)
const cfgTesting = ref(false)
const cfgTestResult = ref(null)
const huobaoApiKey = ref('')
const huobaoSaving = ref(false)
const cfgForm = reactive({ name: '', provider: '', api_key: '', base_url: '', modelStr: '', service_type: 'text', priority: 0 })
const serviceTypes = [{ type: 'text', label: '文本' }, { type: 'image', label: '图片' }, { type: 'video', label: '视频' }]
const providers = ['gemini', 'openai', 'volcengine']
const providerSelectOptions = computed(() => providers.map(p => ({ label: p, value: p })))
const serviceMeta = {
  text: { label: '文本', desc: '剧本改写、角色场景提取、分镜拆解等 Agent 文本能力' },
  image: { label: '图片', desc: '角色图、场景图与镜头图等静态图像生成' },
  video: { label: '视频', desc: '镜头视频直出生成，默认 Seedance 2.0' },
}
const providerPresets = {
  text: {
    gemini: { label: 'Gemini 官方', baseUrl: 'https://generativelanguage.googleapis.com', models: ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3-flash-preview'] },
    openai: { label: 'OpenAI 官方', baseUrl: 'https://api.openai.com', models: ['gpt-5.6-terra'] },
  },
  image: {
    gemini: { label: 'Gemini 官方', baseUrl: 'https://generativelanguage.googleapis.com', models: ['gemini-3-pro-image', 'gemini-3.1-flash-image'] },
    openai: { label: 'OpenAI 官方', baseUrl: 'https://api.openai.com', models: ['gpt-image-2'] },
  },
  video: {
    volcengine: { label: 'Seedance 2.0 官方', baseUrl: 'https://ark.cn-beijing.volces.com', models: ['doubao-seedance-2-0-fast-260128', 'doubao-seedance-2-0-260128', 'doubao-seedance-2-0-mini-260615'] },
  },
}
const huobaoQuickConfigs = [
  { service_type: 'text', provider: 'openai', name: '火宝文本服务', base_url: 'https://api.chatfire.site', model: ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3-flash-preview', 'gpt-5.6-terra', 'deepseek-v4-flash'], priority: 100 },
  { service_type: 'image', provider: 'openai', name: '火宝图片服务', base_url: 'https://api.chatfire.site', model: ['gpt-image-2', 'gemini-3-pro-image', 'gemini-3.1-flash-image'], priority: 99 },
  { service_type: 'video', provider: 'volcengine', name: '火宝视频服务', base_url: 'https://api.chatfire.site/volcengine', model: ['doubao-seedance-2-0-fast-260128', 'doubao-seedance-2-0-260128', 'doubao-seedance-2-0-mini-260615'], priority: 98 },
]

function byType(t) { return cfgs.value.filter(c => c.service_type === t) }
function countActive(t) { return byType(t).filter(c => c.is_active).length }
function fmtModel(m) { return Array.isArray(m) ? m.join(', ') : m || '—' }
function presetsByType(type) {
  const group = providerPresets[type] || {}
  return Object.entries(group).map(([provider, preset]) => ({ provider, ...preset }))
}
function applyProviderPreset(type, provider) {
  const preset = providerPresets[type]?.[provider]
  if (!preset) return
  cfgForm.provider = provider
  cfgForm.base_url = preset.baseUrl
  cfgForm.modelStr = preset.models.join(', ')
  cfgForm.name = `${preset.label}-${serviceMeta[type].label}`
}

async function loadCfgs() { try { cfgs.value = await aiConfigAPI.list() } catch (e) { toast.error(e.message) } }
async function toggleCfg(c) { await aiConfigAPI.update(c.id, { is_active: !c.is_active }); loadCfgs() }
async function delCfg(id) { await aiConfigAPI.del(id); toast.success('已删除'); loadCfgs() }
async function applyHuobaoQuickConfig() {
  const apiKey = huobaoApiKey.value.trim()
  if (!apiKey) { toast.warning('请填写 Huobao API Key'); return }
  huobaoSaving.value = true
  try {
    for (const preset of huobaoQuickConfigs) {
      const payload = { ...preset, api_key: apiKey }
      const existing = cfgs.value.find(c => c.name === preset.name || (c.service_type === preset.service_type && c.base_url === preset.base_url))
      if (existing) await aiConfigAPI.update(existing.id, payload)
      else await aiConfigAPI.create(payload)
    }
    toast.success('火宝快捷配置已写入')
    huobaoApiKey.value = ''
    await loadCfgs()
  } catch (e) {
    toast.error(e.message)
  } finally {
    huobaoSaving.value = false
  }
}
function startAddCfg(t) {
  cfgEditId.value = null
  cfgTestResult.value = null
  Object.assign(cfgForm, { name: '', provider: '', api_key: '', base_url: '', modelStr: '', service_type: t, priority: 0 })
  const firstPreset = presetsByType(t)[0]
  if (firstPreset) applyProviderPreset(t, firstPreset.provider)
  cfgDialog.value = true
}
function startEditCfg(c) {
  cfgEditId.value = c.id
  cfgTestResult.value = null
  Object.assign(cfgForm, {
    name: c.name || '',
    provider: c.provider,
    api_key: c.api_key || '',
    base_url: c.base_url || '',
    modelStr: fmtModel(c.model),
    service_type: c.service_type,
    priority: c.priority ?? 0,
  })
  cfgDialog.value = true
}
async function testCfgPayload(payload) {
  cfgTesting.value = true
  try {
    cfgTestResult.value = await aiConfigAPI.test(payload)
    if (cfgTestResult.value.reachable) toast.success('端点已响应')
    else toast.warning('端点未通过测试')
  } catch (e) {
    toast.error(e.message)
  } finally {
    cfgTesting.value = false
  }
}
async function testDraftCfg() {
  await testCfgPayload({
    service_type: cfgForm.service_type,
    provider: cfgForm.provider,
    api_key: cfgForm.api_key,
    base_url: cfgForm.base_url,
    model: cfgForm.modelStr.split(',').map(s => s.trim()).filter(Boolean),
  })
}
async function testExistingCfg(c) {
  startEditCfg(c)
  await testCfgPayload({
    service_type: c.service_type,
    provider: c.provider,
    api_key: c.api_key || '',
    base_url: c.base_url || '',
    model: Array.isArray(c.model) ? c.model : [],
  })
}
async function saveCfg() {
  if (!cfgForm.provider) { toast.warning('选择服务商'); return }
  const models = cfgForm.modelStr.split(',').map(s => s.trim()).filter(Boolean)
  try {
    if (cfgEditId.value) await aiConfigAPI.update(cfgEditId.value, { name: cfgForm.name, provider: cfgForm.provider, api_key: cfgForm.api_key, base_url: cfgForm.base_url, model: models, priority: cfgForm.priority })
    else await aiConfigAPI.create({ service_type: cfgForm.service_type, provider: cfgForm.provider, name: cfgForm.name || `${cfgForm.provider}-${cfgForm.service_type}`, api_key: cfgForm.api_key, base_url: cfgForm.base_url, model: models, priority: cfgForm.priority })
    cfgDialog.value = false; toast.success('已保存'); loadCfgs()
  } catch (e) { toast.error(e.message) }
}

// ===== Agent Configs =====
const agentCfgs = ref([])
const editingAgent = ref(null)
const agentSaving = ref(false)
const agentSaved = ref(null)
const agentForm = reactive({ model: '', temperature: 0.7, max_tokens: 4096, system_prompt: '' })

const agentDefs = [
  { type: 'script_rewriter', label: '剧本改写', icon: '📝' },
  { type: 'extractor', label: '角色场景提取', icon: '🔍' },
  { type: 'storyboard_breaker', label: '分镜拆解', icon: '🎬' },
  { type: 'prompt_generator', label: '提示词', icon: '🖼' },
]

const defaultPrompts = {
  script_rewriter: `你是专业编剧，擅长将小说改编为短剧剧本。

工作流程：
1. 调用 read_episode_script 读取原始内容
2. 根据读取到的内容，自己进行改写（输出格式化剧本格式）
3. 调用 save_script 保存改写后的完整剧本

格式化剧本格式：
- 场景头：## S编号 | 内景/外景 · 地点 | 时间段
- 动作描写：自然段落，不包含镜头语言
- 对白：角色名：（状态/表情）台词内容
- 每个场景 30-60 秒内容`,
  extractor: `你是制片助理，擅长从剧本中提取角色、场景和道具信息，并在提取时与项目已有数据进行智能去重。

工作流程：
1. 调用 read_script_for_extraction 读取格式化剧本
2. 调用 read_existing_characters 读取项目中已存在的角色列表，以及当前集已关联角色
3. 调用 read_existing_scenes 读取项目中已存在的场景列表，以及当前集已关联场景
4. 调用 read_existing_props 读取项目中已存在的道具列表，以及当前集已关联道具
5. 优先围绕当前集剧本，分析本集实际出现的角色、场景和道具
6. 对每个角色：若同名已存在则合并更新，若不存在则新增
7. 调用 save_dedup_characters 保存角色（去重合并，自动处理新增和更新，并关联到当前集）
8. 分析剧本内容，提取本集涉及的所有场景信息
9. 对每个场景：若同地点+时间段已存在则复用，若不存在则新增
10. 调用 save_dedup_scenes 保存场景（去重合并，自动处理新增和复用，并关联到当前集）
11. 提取本集的关键道具——必须同时满足以下两条，缺一不可：
    a) 直接推动剧情：该物品的出现、交接、损坏或发现会引发情节转折（如凶器、信物、关键文件、定情礼物、证据）；
    b) 值得单独生成图片：后续分镜会给它特写或反复出现，需要固定外观。
    判定三问（自问自答，任一答"否"即放弃该道具）：① 删掉它剧情是否依然成立？成立 → 不提取；② 它只是角色随手使用的日常物品（手机、筷子、杯子、烟）吗？是 → 不提取；③ 它是场景陈设的一部分（桌椅、灯具、门窗、装饰）吗？是 → 不提取。
    宁可少提，不要多提：一集通常 0-3 个关键道具，超过 3 个时按剧情重要性排序只保留前 3 个；没有符合条件的道具就一个都不要提取
12. 对每个道具：若同名已存在则合并更新，若不存在则新增
13. 调用 save_dedup_props 保存道具（去重合并，自动处理新增和更新，并关联到当前集）；若没有需要提取的道具，调用时传空数组即可，不要强行凑数

去重规则：
- 角色：按名字精确匹配，同名保留现有（合并信息）
- 场景：按【地点+时间段】精确匹配；同地点不同时段视为新场景
- 道具：按名字精确匹配，同名保留现有（合并信息）

提取要求：
- 只提取当前集真实出现或被明确提及、且对当前集叙事有效的角色、场景和道具
- 角色只需要两个核心描述字段：appearance（样貌：年龄感、五官、体态、气质等，角色的性格特点要转化为外在气质与神态融入样貌描写，不要单独输出性格字段）和 styling（妆造：发型、服装、妆面、配饰等）
- 场景只需要两个核心描述字段：prompt（场景描述：空间、陈设、年代质感、关键视觉元素等）和 lighting（场景光影：光源、色调、明暗、氛围等）
- 道具字段：name（道具名）、type（类型：日常/武器/交通/装饰/文件等）、description（物品外貌：只描写物品本身的物理外观——材质、颜色、形状、大小、新旧程度、磨损痕迹等，不要写剧情用途，不要涉及与角色或其他事物的关联）。道具不需要输出图片提示词，最终提示词由提示词生成 Agent 后续专门生成
- 不要遗漏任何有台词或重要动作的角色`,
  storyboard_breaker: `你是资深影视分镜师，擅长将剧本拆解为分镜方案。

工作流程：
1. 调用 read_storyboard_context 读取剧本、角色列表、场景列表、道具列表
2. 将剧本拆解为镜头序列（每个镜头 10-15 秒，总体保持剧情完整连续）
3. 为每个镜头补全生产字段（拆分时不需要生成 video_prompt，该字段由提示词 Agent 在视频生成阶段生成）
4. 调用 save_storyboards 保存所有分镜

每个镜头只需要填写以下字段：
- character_ids：当前镜头涉及的角色 ID 列表，可以为空，也可以包含多个角色；必须从 characters 中选择
- prop_ids：当前镜头出现的关键道具 ID 列表（道具在画面中被看到、使用或特写时绑定），可以为空；必须从 props 中选择
- scene_id：若可匹配到 scenes 中已有场景，必须填写正确 scene_id；无匹配时置空
- duration：镜头时长，优先 10-15 秒
- action：角色动作与表演
- description：画面描述，说明观众实际看到的画面内容
- dialogue：该镜头实际发生的对白或旁白；旁白可写为“旁白：内容”
- atmosphere：氛围、光线、色调、环境感受

额外要求：
- 优先复用 read_storyboard_context 返回的 scene_id，不要凭空创造新场景
- 镜头角色绑定必须来自 read_storyboard_context 返回的角色列表；无角色的空镜头可传空数组
- 镜头道具绑定必须来自 read_storyboard_context 返回的道具列表；道具被使用、特写、交接或在画面中明显可见时绑定，与剧情无关的背景物品不要绑定；没有道具出现可传空数组
- 镜头描述必须能支撑后续视频生成和导出流程
- 若一个镜头没有对白，可将 dialogue 置空，但 description / action / atmosphere 仍必须完整
- 如果已有 existing_storyboards，仅在用户明确要求增量修改时参考；默认按当前剧本重新完整生成并保存整集分镜。`,
  prompt_generator: `你是专业的 AI 提示词工程师，负责两类提示词的创作与保存：
1. 角色/场景/道具的「最终提示词」，供生图直接使用
2. 分镜的「视频提示词」（video_prompt），供视频生成直接使用

## 图片最终提示词

用户请求会告知要为哪些角色、场景或道具生成最终提示词（附带 character_id / scene_id / prop_id）。

工作流程：
1. 调用 read_characters / read_scenes / read_props 读取资产信息
2. 按对应资产的技能规范（角色三视图 / 场景固定视角 / 道具白底单品）创作最终提示词
3. 调用 save_character_final_prompt / save_scene_final_prompt / save_prop_final_prompt 逐个保存

## 视频提示词

用户请求会告知要为哪个分镜生成视频提示词（附带分镜 ID）。

工作流程：
1. 调用 read_storyboard_context 读取该分镜的 action、description、dialogue、atmosphere、duration 及绑定的场景/角色
2. 据此生成 video_prompt：按 3 秒为一段、每段单独一行换行分隔；提到场景用 @场景名、提到角色用 @角色名（名字必须与列表完全一致）；内容覆盖动作、画面描述、对白/旁白、氛围
3. 生成时会自动把 @名字 替换为对应参考图片标记（如 @志远 → @图片1志远），因此名字必须精确匹配场景/角色列表，不要缩写或加额外符号
4. 调用 update_storyboard 仅更新该分镜的 video_prompt 字段，不要改动其他字段，不要重新拆分整集

通用规范：
- 所有提示词只输出中文，单段连贯描述，不要分点，不要混入英文词汇
- 项目设定的视觉风格描述会由工具在保存图片提示词时自动注入到最终提示词的最前方，不要自行添加风格词
- 必须实际调用保存工具，不要只在回复中给出提示词`,
}

function getAgentCfg(type) {
  return agentCfgs.value.find(a => a.agent_type === type)
}

const textModelGroups = computed(() => {
  return cfgs.value
    .filter(c => c.service_type === 'text' && c.is_active && c.api_key)
    .map(c => ({
      label: `${c.provider} — ${c.name}`,
      models: Array.isArray(c.model) ? c.model : (c.model ? [c.model] : []),
    }))
    .filter(g => g.models.length > 0)
})

const textModelSelectOptions = computed(() =>
  textModelGroups.value.map(g => ({
    label: g.label,
    options: g.models.map(m => ({ label: m, value: m })),
  }))
)

async function loadAgents() {
  try { agentCfgs.value = await agentConfigAPI.list() }
  catch (e) { toast.error(e.message) }
}

function toggleAgentEdit(type) {
  if (editingAgent.value === type) { editingAgent.value = null; return }
  const cfg = getAgentCfg(type)
  agentForm.model = cfg?.model || ''
  agentForm.temperature = cfg?.temperature ?? 0.7
  agentForm.max_tokens = cfg?.max_tokens ?? 4096
  agentForm.system_prompt = cfg?.system_prompt || defaultPrompts[type] || ''
  agentSaved.value = null
  editingAgent.value = type
}

function resetAgentPrompt(type) {
  agentForm.system_prompt = defaultPrompts[type] || ''
  toast.info('已恢复默认提示词，点击保存生效')
}

async function saveAgentCfg(type) {
  agentSaving.value = true
  agentSaved.value = null
  try {
    const existing = getAgentCfg(type)
    const data = {
      agent_type: type,
      name: agentDefs.find(a => a.type === type)?.label || type,
      model: agentForm.model,
      temperature: agentForm.temperature,
      max_tokens: agentForm.max_tokens,
      system_prompt: agentForm.system_prompt,
    }
    if (existing) {
      await agentConfigAPI.update(existing.id, data)
    } else {
      await agentConfigAPI.create(data)
    }
    await loadAgents()
    agentSaved.value = type
    toast.success(`${agentDefs.find(a => a.type === type)?.label} 配置已保存`)
    setTimeout(() => { if (agentSaved.value === type) agentSaved.value = null }, 3000)
  } catch (e) {
    toast.error(e.message)
  } finally {
    agentSaving.value = false
  }
}

// ===== Skills =====
const selectedAgent = ref('script_rewriter')
const allSkills = ref([])   // { id, name, description }[]
const editingSkill = ref(null)
const skillContent = ref('')
const skillSaving = ref(false)
const skillSaved = ref(null)
const addSkillDialog = ref(false)
const newSkillForm = reactive({ id: '', name: '', description: '' })

const selectedAgentType = computed(() => selectedAgent.value)
const selectedAgentLabel = computed(() => agentDefs.find(a => a.type === selectedAgent.value)?.label || '')
const selectedAgentIcon = computed(() => agentDefs.find(a => a.type === selectedAgent.value)?.icon || '')

function agentSkillCount(type) {
  return allSkills.value.filter(s => s.id === type || s.id.startsWith(type + '/')).length
}

const currentSkills = computed(() =>
  allSkills.value.filter(s => s.id === selectedAgent.value || s.id.startsWith(selectedAgent.value + '/'))
)

async function loadAllSkills() {
  try { allSkills.value = await skillsAPI.list() }
  catch (e) { toast.error(e.message) }
}

async function selectAgent(type) {
  selectedAgent.value = type
  editingSkill.value = null
}

function startAddSkill() {
  newSkillForm.id = ''
  newSkillForm.name = ''
  newSkillForm.description = ''
  addSkillDialog.value = true
}

async function confirmAddSkill() {
  if (!newSkillForm.id) return
  const skillId = `${selectedAgent.value}/${newSkillForm.id}`
  try {
    await skillsAPI.create({ id: skillId, name: newSkillForm.name, description: newSkillForm.description })
    addSkillDialog.value = false
    await loadAllSkills()
    toast.success('Skill 创建成功')
  } catch (e) {
    toast.error(e.message)
  }
}

const skillToDelete = ref(null)
const deletingSkill = ref(false)

async function confirmDelSkill() {
  const id = skillToDelete.value
  if (!id) return
  try {
    deletingSkill.value = true
    await skillsAPI.del(id)
    if (editingSkill.value === id) editingSkill.value = null
    await loadAllSkills()
    skillToDelete.value = null
    toast.success('已删除')
  } catch (e) {
    toast.error(e.message)
  } finally {
    deletingSkill.value = false
  }
}

async function toggleSkillEdit(id) {
  if (editingSkill.value === id) { editingSkill.value = null; return }
  try {
    const res = await skillsAPI.get(id)
    skillContent.value = res.content
    skillSaved.value = null
    editingSkill.value = id
  } catch (e) { toast.error(e.message) }
}

async function saveSkill(id) {
  skillSaving.value = true
  skillSaved.value = null
  try {
    await skillsAPI.update(id, skillContent.value)
    await loadAllSkills()
    skillSaved.value = id
    toast.success(`已保存`)
    setTimeout(() => { if (skillSaved.value === id) skillSaved.value = null }, 3000)
  } catch (e) {
    toast.error(e.message)
  } finally {
    skillSaving.value = false
  }
}

// ===== Style Presets =====
const stylePresets = ref([])
const styleDialog = ref(false)
const styleEditId = ref(null)
const styleForm = reactive({ name: '', value: '', prompt: '', description: '', sort_order: 0 })

async function loadStylePresets() {
  try { stylePresets.value = await stylePresetAPI.list(true) } catch (e) { toast.error(e.message) }
}

async function toggleStyle(p) {
  try {
    await stylePresetAPI.update(p.id, { is_active: !p.is_active })
    loadStylePresets()
  } catch (e) { toast.error(e.message) }
}

const styleToDelete = ref(null)
const deletingStyle = ref(false)

async function confirmDelStyle() {
  const p = styleToDelete.value
  if (!p) return
  try {
    deletingStyle.value = true
    await stylePresetAPI.del(p.id)
    styleToDelete.value = null
    toast.success('已删除')
    loadStylePresets()
  } catch (e) {
    toast.error(e.message)
  } finally {
    deletingStyle.value = false
  }
}

function startAddStyle() {
  styleEditId.value = null
  Object.assign(styleForm, {
    name: '', value: '', prompt: '', description: '',
    sort_order: (stylePresets.value.at(-1)?.sort_order ?? 0) + 1,
  })
  styleDialog.value = true
}

function startEditStyle(p) {
  styleEditId.value = p.id
  Object.assign(styleForm, {
    name: p.name,
    value: p.value,
    prompt: p.prompt,
    description: p.description || '',
    sort_order: p.sort_order ?? 0,
  })
  styleDialog.value = true
}

async function saveStyle() {
  if (!styleForm.name?.trim() || !styleForm.prompt?.trim() || (!styleEditId.value && !styleForm.value?.trim())) {
    toast.warning('名称、key、提示词片段必填')
    return
  }
  try {
    if (styleEditId.value) {
      await stylePresetAPI.update(styleEditId.value, {
        name: styleForm.name,
        prompt: styleForm.prompt,
        description: styleForm.description,
        sort_order: styleForm.sort_order,
      })
    } else {
      await stylePresetAPI.create({ ...styleForm })
    }
    styleDialog.value = false
    toast.success('已保存')
    loadStylePresets()
  } catch (e) { toast.error(e.message) }
}

onMounted(() => { loadCfgs(); loadAgents(); loadAllSkills(); loadStylePresets() })
</script>

<style scoped>
.settings-page { display: flex; flex-direction: column; height: 100%; background: var(--bg-base); }
.page-title {
  font-size: 32px; font-weight: 800; letter-spacing: -0.02em;
  color: var(--text-0); padding: 24px 32px 16px;
}

.settings-layout { display: flex; flex: 1; min-height: 0; }

.settings-nav {
  width: 220px; flex-shrink: 0; padding: 4px 12px 16px; border-right: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 14px;
}
.nav-group { display: flex; flex-direction: column; gap: 2px; }
.nav-group-label {
  font-size: 11px; font-weight: 650; color: var(--text-3);
  letter-spacing: 0.06em; padding: 8px 12px 4px;
}
.nav-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; font-size: 13px; font-weight: 550;
  border: none; border-radius: var(--radius); background: transparent; color: var(--text-1);
  cursor: pointer; transition: all 0.16s var(--ease-out); text-align: left; width: 100%;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text-0); }
.nav-item.active { background: var(--accent-bg); color: var(--accent-text); font-weight: 650; }
.nav-item:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }

.nav-advanced {
  padding: 12px 4px;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}
.advanced-toggle {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 0 8px; font-size: 12.5px; font-weight: 550; color: var(--text-1); cursor: pointer;
}
.advanced-toggle .switch { width: 38px; height: 23px; }
.advanced-toggle .switch::after { width: 19px; height: 19px; }
.advanced-toggle .switch.on::after { transform: translateX(15px); }
.advanced-toggle input:focus-visible + .switch { box-shadow: 0 0 0 3.5px var(--button-focus); }
.advanced-note {
  margin: 8px 8px 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-3);
}

.settings-content { flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.settings-scroll { height: 100%; overflow-y: auto; padding: 24px 40px 48px; max-width: 840px; margin: 0 auto; animation: fadeUp 0.3s var(--ease-out); }
.settings-head { margin-bottom: 20px; }
.settings-title { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
.settings-desc { font-size: 13px; color: var(--text-2); margin-top: 6px; }

/* 火宝快捷配置 */
.quick-card {
  padding: 20px;
  margin-bottom: 16px;
  border: 1.5px solid var(--accent);
}
.quick-card:hover { border-color: var(--accent); }
.quick-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.setup-title { font-size: 15px; font-weight: 700; color: var(--text-0); }
.setup-desc { font-size: 12.5px; color: var(--text-2); margin-bottom: 14px; }
.huobao-site-link {
  display: inline-flex; align-items: center; gap: 3px;
  margin-left: 6px;
  color: var(--accent); text-decoration: none;
  font-weight: 600; white-space: nowrap;
}
.huobao-site-link:hover { text-decoration: underline; }
.huobao-quick-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}
.huobao-quick-models {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.hqm-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 11px;
  line-height: 1.6;
}
.hqm-label {
  flex-shrink: 0;
  width: 28px;
  font-weight: 600;
  color: var(--text-2);
}
.hqm-models {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--text-3);
}
.hqm-model.is-default { color: var(--text-1); font-weight: 600; }
.hqm-model em {
  font-style: normal;
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 600;
  color: var(--accent-text);
  background: var(--accent-bg);
}

/* 手动模板 */
.setup-panel { padding: 18px 20px; margin-bottom: 16px; }
.setup-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.setup-panel-head.compact { margin-bottom: 12px; }
.template-row { display: flex; flex-wrap: wrap; gap: 8px; }
.template-type-chip {
  min-height: var(--button-height-sm);
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--button-bg);
  color: var(--text-1);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: all 0.16s var(--ease-out);
}
.template-type-chip:hover { background: var(--button-bg-hover); color: var(--text-0); }
.template-type-chip:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }

/* 按服务类型分组的配置卡 */
.sections { display: flex; flex-direction: column; gap: 16px; }
.svc-group { overflow: hidden; }
.svc-group-head {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
}
.svc-group-heading { min-width: 0; }
.svc-group-title { font-size: 14px; font-weight: 700; color: var(--text-0); }
.svc-group-sub { font-size: 11.5px; color: var(--text-3); margin-top: 2px; }
.config-row { display: flex; align-items: center; gap: 12px; padding: 12px 20px; }
.config-row + .config-row { border-top: 1px solid var(--border); }
.provider-badge {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px; color: #fff;
  background: var(--accent);
  box-shadow: 0 1px 4px rgba(0,0,0,0.12);
}
.provider-badge[data-provider="openai"] { background: #10a37f; }
.provider-badge[data-provider="gemini"] { background: #4285f4; }
.provider-badge[data-provider="volcengine"] { background: #ff5c39; }
.config-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.config-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.config-name { font-size: 13.5px; font-weight: 650; color: var(--text-0); }
.config-sub { font-size: 11.5px; color: var(--text-3); }
.config-empty { font-size: 12px; color: var(--text-3); padding: 14px 20px; }
.config-switch { display: inline-flex; flex-shrink: 0; cursor: pointer; }
.config-switch input:focus-visible + .switch { box-shadow: 0 0 0 3.5px var(--button-focus); }
.btn-icon.btn-sm { width: 30px; min-width: 30px; height: 30px; min-height: 30px; }

/* Agent */
.agent-list { display: flex; flex-direction: column; gap: 10px; }
.agent-card { overflow: hidden; }
.agent-card-head { display: flex; align-items: center; gap: 12px; padding: 14px 18px; cursor: pointer; transition: background 0.15s; }
.agent-card-head:hover { background: var(--bg-hover); }
.agent-type-badge {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--accent-bg); color: var(--accent-text);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; flex-shrink: 0;
}
.agent-card-heading { flex: 1; min-width: 0; }
.agent-card-title { font-size: 13.5px; font-weight: 650; color: var(--text-0); }
.agent-card-type { font-size: 11.5px; margin-top: 1px; }
.agent-card-body { padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 12px; border-top: 1px solid var(--border); }
.agent-card-foot { display: flex; align-items: center; gap: 8px; padding-top: 4px; }

/* Skills 布局 */
.skills-layout { display: flex; height: 100%; overflow: hidden; }
.skills-agent-list {
  width: 210px; flex-shrink: 0; border-right: 1px solid var(--border);
  display: flex; flex-direction: column;
  overflow-y: auto; padding: 4px 10px 16px;
}
.skills-agent-title {
  font-size: 11px; font-weight: 650; letter-spacing: 0.06em;
  color: var(--text-3); padding: 8px 10px 4px;
}
.skills-agent-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; font-size: 13px; font-weight: 550; cursor: pointer;
  border: none; border-radius: var(--radius); background: transparent; color: var(--text-1);
  transition: all 0.16s var(--ease-out); width: 100%; text-align: left;
}
.skills-agent-item:hover { background: var(--bg-hover); color: var(--text-0); }
.skills-agent-item.active { background: var(--accent-bg); color: var(--accent-text); font-weight: 650; }
.skills-agent-item:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }
.skills-agent-item .agent-type-badge { width: 26px; height: 26px; border-radius: 8px; font-size: 13px; }
.skills-agent-label { flex: 1; min-width: 0; }
.skill-count-badge {
  font-size: 10px; font-weight: 700; font-family: var(--font-mono);
  background: rgba(0,0,0,0.06); color: var(--text-2);
  padding: 1px 6px; border-radius: 99px;
}
.skills-agent-item.active .skill-count-badge { background: var(--accent-bg); color: var(--accent-text); }
.skills-main { flex: 1; min-width: 0; }
.skills-main.settings-scroll { max-width: 900px; }
.skills-head { display: flex; align-items: flex-start; gap: 12px; }
.skills-head-badge { width: 32px; height: 32px; font-size: 16px; }
.skills-head-copy { min-width: 0; }
.skills-empty { padding: 48px 24px; text-align: center; }
.skills-empty-icon {
  width: 56px; height: 56px; border-radius: 16px; margin: 0 auto 12px;
  background: var(--accent-bg); color: var(--accent-text);
  display: flex; align-items: center; justify-content: center;
}
.skills-empty-title { font-size: 14px; font-weight: 650; color: var(--text-0); }
.skills-empty-desc { font-size: 12px; color: var(--text-3); margin-top: 4px; }

/* Skill */
.skill-list { display: flex; flex-direction: column; gap: 10px; }
.skill-card { overflow: hidden; }
.skill-card-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; transition: background 0.15s; }
.skill-card-head:hover { background: var(--bg-hover); }
.skill-card-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--border); }
.skill-card-foot { display: flex; align-items: center; gap: 8px; }

/* Shared */
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 12px; font-weight: 550; color: var(--text-1); }
.field-hint { font-size: 11px; color: var(--text-3); margin-top: 2px; }
.required { color: var(--error); }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* Dialogs */
.config-dialog { width: min(720px, calc(100vw - 40px)); }
.config-dialog-body { display: flex; flex-direction: column; gap: 14px; }
.skill-dialog { width: 440px; }
.skill-dialog-body { display: flex; flex-direction: column; gap: 12px; }
.dialog-sub { margin-top: 4px; font-size: 12px; color: var(--text-2); }
.test-draft-btn { margin-right: auto; }
.preset-picker { display: flex; flex-wrap: wrap; gap: 8px; }
.preset-pill {
  min-height: var(--button-height-sm);
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--button-bg);
  color: var(--text-1);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: all 0.16s var(--ease-out);
}
.preset-pill:hover { background: var(--button-bg-hover); color: var(--text-0); }
.preset-pill:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }
.test-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  border: 1px solid var(--border);
  background: var(--bg-0);
}
.test-result.ok { border-color: rgba(52,199,89,0.4); background: var(--success-bg); }
.test-result.bad { border-color: rgba(255,59,48,0.4); background: var(--error-bg); }
.test-result-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-1);
}
.test-result-url,
.test-result-preview {
  font-size: 11px;
  color: var(--text-2);
  word-break: break-all;
}
</style>
