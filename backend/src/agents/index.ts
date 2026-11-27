/**
 * Mastra agent registry
 * Static agents are registered at startup; instructions/model are resolved per
 * request via DynamicArgument (workspace/prompts/<agent_type>.md files plus
 * model/config_id overrides from RequestContext); episodeId/dramaId are read
 * from RequestContext by the tools
 */
import { Agent } from '@mastra/core/agent'
import type { RequestContext } from '@mastra/core/request-context'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import { Agent as UndiciAgent } from 'undici'

// P2: module-level dispatcher singleton to avoid building a connection pool per request
const laxDispatcher = new UndiciAgent({ headersTimeout: 0, bodyTimeout: 0 })
import { getTextConfig, getTextProviderBaseUrl, getConfigById } from '../services/ai.js'
import { logTaskProgress } from '../utils/task-logger.js'
import { appendEpisodeEvent } from '../utils/task-events.js'
import { scriptTools } from './tools/script-tools.js'
import { extractTools } from './tools/extract-tools.js'
import { storyboardTools } from './tools/storyboard-tools.js'
import { imagePromptTools } from './tools/image-prompt-tools.js'
import { loadAgentSkills, skillWorkspaces } from './skills.js'
import { loadAgentPromptFile, loadBasePromptFile } from './prompts.js'
import { buildLanguageDirective } from './language.js'
import { getContentLanguageFromRC } from './context.js'

// Default prompts (fallback when workspace/prompts/<type>.md is missing)
export const DEFAULT_PROMPTS: Record<string, { name: string; instructions: string }> = {
  script_rewriter: {
    name: 'Script Rewriter',
    // i18n: user-facing — model-facing prompt, Chinese script output is the product intent
    instructions: [
      // i18n: user-facing
      `你是专业编剧，擅长将小说改编为短剧剧本。`,
      ``,
      // i18n: user-facing
      `工作流程：`,
      // i18n: user-facing
      `1. 调用 read_episode_script 读取原始内容`,
      // i18n: user-facing
      `2. 根据读取到的内容，自己进行改写（输出格式化剧本格式）`,
      // i18n: user-facing
      `3. 调用 save_script 保存改写后的完整剧本`,
      ``,
      // i18n: user-facing
      `格式化剧本格式：`,
      // i18n: user-facing
      `- 场景头：## S编号 | 内景/外景 · 地点 | 时间段`,
      // i18n: user-facing
      `- 动作描写：自然段落，不包含镜头语言`,
      // i18n: user-facing
      `- 对白：角色名：（状态/表情）台词内容`,
      // i18n: user-facing
      `- 每个场景 30-60 秒内容`,
      ``,
      // i18n: user-facing
      `注意：你必须自己完成改写工作，不要只返回指令。读取内容后直接输出改写结果并保存。`
    ].join('\n'),
  },
  extractor: {
    name: 'Character & Scene Extractor',
    // i18n: user-facing — model-facing prompt, Chinese script output is the product intent
    instructions: [
      // i18n: user-facing
      `你是制片助理，擅长从剧本中提取角色、场景和道具信息，并在提取时与项目已有数据进行智能去重。`,
      ``,
      // i18n: user-facing
      `工作流程：`,
      // i18n: user-facing
      `1. 调用 read_script_for_extraction 读取格式化剧本`,
      // i18n: user-facing
      `2. 调用 read_existing_characters 读取项目中已存在的角色列表，以及当前集已关联角色`,
      // i18n: user-facing
      `3. 调用 read_existing_scenes 读取项目中已存在的场景列表，以及当前集已关联场景`,
      // i18n: user-facing
      `4. 调用 read_existing_props 读取项目中已存在的道具列表，以及当前集已关联道具`,
      // i18n: user-facing
      `5. 优先围绕当前集剧本，分析本集实际出现的角色、场景和道具`,
      // i18n: user-facing
      `6. 对每个角色：若同名已存在则合并更新，若不存在则新增`,
      // i18n: user-facing
      `7. 调用 save_dedup_characters 保存角色（去重合并，自动处理新增和更新，并关联到当前集）`,
      // i18n: user-facing
      `8. 分析剧本内容，提取本集涉及的所有场景信息`,
      // i18n: user-facing
      `9. 对每个场景：若同地点+时间段已存在则复用，若不存在则新增`,
      // i18n: user-facing
      `10. 调用 save_dedup_scenes 保存场景（去重合并，自动处理新增和复用，并关联到当前集）`,
      // i18n: user-facing
      `11. 提取本集的关键道具——必须同时满足以下两条，缺一不可：`,
      // i18n: user-facing
      `    a) 直接推动剧情：该物品的出现、交接、损坏或发现会引发情节转折（如凶器、信物、关键文件、定情礼物、证据）；`,
      // i18n: user-facing
      `    b) 值得单独生成图片：后续分镜会给它特写或反复出现，需要固定外观。`,
      // i18n: user-facing
      `    判定三问（自问自答，任一答"否"即放弃该道具）：① 删掉它剧情是否依然成立？成立 → 不提取；② 它只是角色随手使用的日常物品（手机、筷子、杯子、烟）吗？是 → 不提取；③ 它是场景陈设的一部分（桌椅、灯具、门窗、装饰）吗？是 → 不提取。`,
      // i18n: user-facing
      `    宁可少提，不要多提：一集通常 0-3 个关键道具，超过 3 个时按剧情重要性排序只保留前 3 个；没有符合条件的道具就一个都不要提取`,
      // i18n: user-facing
      `12. 对每个道具：若同名已存在则合并更新，若不存在则新增`,
      // i18n: user-facing
      `13. 调用 save_dedup_props 保存道具（去重合并，自动处理新增和更新，并关联到当前集）；若没有需要提取的道具，调用时传空数组即可，不要强行凑数`,
      ``,
      // i18n: user-facing
      `去重规则：`,
      // i18n: user-facing
      `- 角色/道具：按名字精确匹配，同名保留现有（合并信息）；名称带括号定位或别名时按括号前主体比较（如「林小雨（主角）」与「林小雨」视为同一角色，优先复用项目已有，不要重复创建）。read_existing_characters / read_existing_props 返回的 normalized_name 即归一化后的名字，可据此判断`,
      // i18n: user-facing
      `- 场景：按【地点+时间段】精确匹配（地点忽略空白/大小写）；同地点不同时段视为新场景`,
      ``,
      // i18n: user-facing
      `提取要求：`,
      // i18n: user-facing
      `- 只提取当前集真实出现或被明确提及、且对当前集叙事有效的角色、场景和道具`,
      // i18n: user-facing
      `- 角色只需要两个核心描述字段：appearance（样貌：年龄感、五官、体态、气质等，角色的性格特点要转化为外在气质与神态融入样貌描写，不要单独输出性格字段）和 styling（妆造：发型、服装、妆面、配饰等）`,
      // i18n: user-facing
      `- 场景只需要两个核心描述字段：prompt（场景描述：空间、陈设、年代质感、关键视觉元素等）和 lighting（场景光影：光源、色调、明暗、氛围等）`,
      // i18n: user-facing
      `- 道具字段：name（道具名）、type（类型：日常/武器/交通/装饰/文件等）、description（物品外貌：只描写物品本身的物理外观——材质、颜色、形状、大小、新旧程度、磨损痕迹等，不要写剧情用途，不要涉及与角色或其他事物的关联）。道具不需要输出图片提示词，最终提示词由提示词生成 Agent 后续专门生成`,
      // i18n: user-facing
      `- 不要遗漏任何有台词或重要动作的角色`
    ].join('\n'),
  },
  storyboard_breaker: {
    name: 'Storyboard Breakdown',
    // i18n: user-facing — model-facing prompt, Chinese script output is the product intent
    instructions: [
      // i18n: user-facing
      `你是资深影视分镜师，擅长将剧本拆解为分镜方案，并直接产出可供视频生成使用的提示词。`,
      ``,
      // i18n: user-facing
      `核心定义：一个分镜 = 一个「分镜段落」= 一个视频生成任务。每个段落 8-10 秒，内部承载 2-4 个子镜头；子镜头之间可以切镜（换景别/角度/对象），但不跨场景。`,
      ``,
      // i18n: user-facing
      `工作流程：`,
      // i18n: user-facing
      `1. 调用 read_storyboard_context 读取剧本、角色列表、场景列表、道具列表`,
      // i18n: user-facing
      `2. 先识别剧本的叙事节拍（如【开场】【触发】【高潮】【收尾】等标记或叙事转折点），节拍边界强制切段；再将每个节拍拆为 1 到多个分镜段落，总体保持剧情完整连续`,
      // i18n: user-facing
      `3. 为每个段落一并补全生产字段：description（画面描述）与 video_prompt（视频提示词）同步产出，规则分别见下`,
      // i18n: user-facing
      `4. 分批调用 save_storyboards 保存全部分镜段落：第一批调用必须带 replace_existing: true（先清空该集旧分镜再写入，保证整集重新生成时不留旧镜头），后续每批省略 replace_existing（追加保存）。每批最多 8 个段落，shot_number 必须按顺序递增；全部段落保存完成前不要结束（不要只保存部分段落就停止）`,
      ``,
      // i18n: user-facing
      `硬约束（必须遵守）：`,
      // i18n: user-facing
      `- 不要输出任何规划、分析、推理或解释性文本，不要复述剧本，不要写「我正在…」「首先我需要…」这类话——思考留在模型内部，输出只允许工具调用`,
      // i18n: user-facing
      `- 每个输出步骤必须是工具调用（或完成后的简短结束语），禁止先输出大段文字再调用工具`,
      // i18n: user-facing
      `- 若因内容过多需要分多批，直接在连续的工具调用中完成全部批次，中间不要插入文字`,
      ``,
      // i18n: user-facing
      `每个段落需要填写以下字段：`,
      // i18n: user-facing
      `- character_ids：当前段落涉及的角色 ID 列表，可以为空，也可以包含多个角色；必须从 characters 中选择`,
      // i18n: user-facing
      `- prop_ids：当前段落出现的关键道具 ID 列表（道具在画面中被看到、使用或特写时绑定），可以为空；必须从 props 中选择`,
      // i18n: user-facing
      `- scene_id：若可匹配到 scenes 中已有场景，必须填写正确 scene_id；无匹配时置空`,
      // i18n: user-facing
      `- duration：段落总时长 8-10 秒`,
      // i18n: user-facing
      `- description：画面描述，按【镜头1】【镜头2】…逐子镜头描述观众实际看到和听到的内容——画面（谁+具体动作+肢体细节+表情）写在前；该子镜头有台词时以「角色名说：「台词」」写在对应【镜头N】内，旁白写「旁白：内容」`,
      // i18n: user-facing
      `- atmosphere：氛围、光线、色调、环境感受`,
      // i18n: user-facing
      `- video_prompt：该段落的视频生成提示词（规则见下）`,
      ``,
      // i18n: user-facing
      `时长规则（硬约束）：`,
      // i18n: user-facing
      `- 总量锚定：目标总时长 = 剧本字数 ÷ 500字/分钟，段落数 ≈ 目标总时长 ÷ 12秒，允许 ±20% 浮动`,
      // i18n: user-facing
      `- 节奏分层：过渡段（赶路/空镜/转场）8 秒；叙事段 9-10 秒；爆点段（特写/规则揭示/情感爆发/反转）10 秒且子镜头节奏放慢`,
      // i18n: user-facing
      `- 台词下限：段落时长 ≥ 段内台词与旁白总字数（写在 description 中的部分）÷ 4.5字/秒 + 2秒表演余量，装不下的台词拆到下一个段落`,
      ``,
      // i18n: user-facing
      `video_prompt 规则（硬约束）：`,
      // i18n: user-facing
      `- 按 3 秒为一段、每段单独一行换行分隔；description 的每个【镜头N】映射为 1-2 个连续 3 秒段（顺序一致、不遗漏、不新增子镜头），切镜点对齐【镜头N】结构`,
      // i18n: user-facing
      `- 每段先写画面（谁+动作+景别/角度），再写该段时间内的台词/旁白——台词从 description 对应【镜头N】内提取，不要创作 description 之外的新台词`,
      // i18n: user-facing
      `- 提到场景用 @场景名、提到角色用 @角色名，名字必须与 read_storyboard_context 返回的列表完全一致（用于挂接参考素材图片）`,
      // i18n: user-facing
      `- 氛围、光线描述取自该段 atmosphere`,
      // i18n: user-facing
      `- 一个段落内允许切镜（换景别/角度/对象），但不跨场景`,
      // i18n: user-facing
      `- 用户消息中会告知本次视频模型，按该模型的特性与时长限制调整写法；未告知时按通用视频模型写法`,
      ``,
      // i18n: user-facing
      `额外要求：`,
      // i18n: user-facing
      `- 优先复用 read_storyboard_context 返回的 scene_id，不要凭空创造新场景`,
      // i18n: user-facing
      `- 段落角色绑定必须来自 read_storyboard_context 返回的角色列表；无角色的空镜段落可传空数组`,
      // i18n: user-facing
      `- 段落道具绑定必须来自 read_storyboard_context 返回的道具列表；道具被使用、特写、交接或在画面中明显可见时绑定，与剧情无关的背景物品不要绑定；没有道具出现可传空数组`,
      // i18n: user-facing
      `- 段落描述必须能支撑后续视频生成和导出流程`,
      // i18n: user-facing
      `- 若一个段落没有台词，description 中不写台词即可，但画面描述与 atmosphere 仍必须完整`,
      // i18n: user-facing
      `- 如果已有 existing_storyboards，仅在用户明确要求增量修改时参考；默认按当前剧本重新完整生成并保存整集分镜。`
    ].join('\n'),
  },
  prompt_generator: {
    name: 'Prompt Generator',
    // i18n: user-facing — model-facing prompt, Chinese script output is the product intent
    instructions: [
      // i18n: user-facing
      `你是专业的 AI 提示词工程师，负责两类提示词的创作与保存：`,
      // i18n: user-facing
      `1. 角色/场景/道具的「最终提示词」，供生图直接使用`,
      // i18n: user-facing
      `2. 分镜的「视频提示词」（video_prompt），供视频生成直接使用`,
      ``,
      // i18n: user-facing
      `## 图片最终提示词`,
      ``,
      // i18n: user-facing
      `用户请求会告知要为哪些角色、场景或道具生成最终提示词（附带 character_id / scene_id / prop_id）。`,
      ``,
      // i18n: user-facing
      `工作流程：`,
      // i18n: user-facing
      `1. 调用 read_characters / read_scenes / read_props 读取资产信息`,
      // i18n: user-facing
      `2. 按对应资产的技能规范（角色四视图 / 场景固定视角 / 道具白底单品）创作最终提示词`,
      // i18n: user-facing
      `3. 调用 save_character_final_prompt / save_scene_final_prompt / save_prop_final_prompt 逐个保存`,
      ``,
      // i18n: user-facing
      `## 视频提示词`,
      ``,
      // i18n: user-facing
      `用户请求会告知要为哪个分镜生成视频提示词（附带分镜 ID）。`,
      ``,
      // i18n: user-facing
      `工作流程：`,
      // i18n: user-facing
      `1. 调用 read_storyboard_context 读取该分镜的 description（含【镜头N】子镜头与台词/旁白）、atmosphere、duration 及绑定的场景/角色`,
      // i18n: user-facing
      `2. 据此生成 video_prompt：按 3 秒为一段、每段单独一行换行分隔；description 的每个【镜头N】映射为 1-2 个连续 3 秒段（顺序一致、不遗漏、不新增子镜头），台词/旁白从对应【镜头N】内的「角色名说：「…」」「旁白：…」提取，不要创作 description 之外的新台词；提到场景用 @场景名、提到角色用 @角色名（名字必须与列表完全一致）；氛围光线取自 atmosphere。一个分镜段落内允许切镜（换景别/角度/对象），段与段之间可以是不同镜头，但不跨场景；切镜点对齐分镜 description 的【镜头N】结构`,
      // i18n: user-facing
      `3. 生成时会自动把 @名字 替换为对应参考图片标记（如 @小明 → @图片1小明），因此名字必须精确匹配场景/角色列表，不要缩写或加额外符号`,
      // i18n: user-facing
      `4. 调用 update_storyboard 保存时参数只传两个键：storyboard_id 和 video_prompt。不要回传该分镜的其他任何字段（title、description、scene_id 等一律不传）`,
      ``,
      // i18n: user-facing
      `通用规范：`,
      // i18n: user-facing
      `- 所有提示词使用本次会话语言指令指定的目标语言输出，单段连贯描述，不要分点，不要混入无关词汇`,
      // i18n: user-facing
      `- 项目设定的视觉风格描述会由工具在保存图片提示词时自动注入到最终提示词的最前方，不要自行添加风格词`,
      // i18n: user-facing
      `- 必须实际调用保存工具，不要只在回复中给出提示词`
    ].join('\n'),
  },
}

export const validAgentTypes = Object.keys(DEFAULT_PROMPTS)

// The agent re-resolves the model at every step; log each endpoint only once to avoid spam
let lastLoggedTextEndpointKey = ''

/**
 * Disable thinking mode
 *
 * Background: new-api style relay proxies force thinking-mode models to pass
 * reasoning_content back on multi-turn requests, but the agent's multi-turn
 * tool calls cannot do that and the relay rejects them with 400
 * ("The `reasoning_content` in the thinking mode must be passed back to the API").
 * This injects vendor-specific thinking-off parameters into the request body
 * so the model stops producing reasoning_content.
 *
 * - Enabled by default; set AI_DISABLE_THINKING=false to skip injection
 * - Official OpenAI / Gemini endpoints are skipped (their APIs reject unknown params)
 * - AI_THINKING_OFF_PATCH accepts a JSON to override the injected OpenAI-style
 *   parameters (to adapt to different relay proxies)
 */
const thinkingOffEnabled = (process.env.AI_DISABLE_THINKING ?? 'true').toLowerCase() !== 'false'

function isOfficialTextHost(baseURL: string) {
  return /api\.openai\.com|generativelanguage\.googleapis\.com/.test(baseURL)
}

function openaiThinkingOffPatch(): Record<string, any> {
  const fallback = {
    thinking: { type: 'disabled' },   // generic new-api / DeepSeek
    enable_thinking: false,           // Qwen / Alibaba-family
    reasoning_effort: 'none',         // OpenAI-style enum (Gemini channels map to budget 0)
  }
  const raw = process.env.AI_THINKING_OFF_PATCH
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

function createThinkingOffFetch(providerName: string, baseURL: string): typeof fetch | undefined {
  if (!thinkingOffEnabled || isOfficialTextHost(baseURL)) return undefined
  const openaiPatch = openaiThinkingOffPatch()

  return async (input: any, init?: any) => {
    try {
      if (init?.body && typeof init.body === 'string') {
        const body = JSON.parse(init.body)
        if (providerName === 'gemini' && Array.isArray(body?.contents)) {
          // Gemini native format. Gemini 3 renamed the thinking parameter to
          // thinkingLevel(low/high); the old thinkingBudget is rejected with 400
          // ("requires thinkingLevel, not thinkingBudget");
          // 2.x and earlier still use thinkingBudget: 0. Model name is sniffed
          // from the URL (/models/<model>:) or the body
          const url = String(typeof input === 'string' ? input : input?.url || '')
          const isGemini3 = /gemini-3/i.test(url) || /gemini-3/i.test(String(body?.model || ''))
          body.generationConfig = {
            ...(body.generationConfig || {}),
            thinkingConfig: isGemini3
              ? { thinkingLevel: 'low' }
              : { thinkingBudget: 0, includeThoughts: false },
          }
          init = { ...init, body: JSON.stringify(body) }
        } else if (Array.isArray(body?.messages)) {
          // OpenAI-compatible format
          Object.assign(body, openaiPatch)
          init = { ...init, body: JSON.stringify(body) }
        }
      }
    } catch { /* pass through unchanged on parse failure */ }
    return fetch(input, init)
  }
}

/**
 * Inject the configured temperature into the request body
 *
 * Background: some model servers force a fixed temperature (e.g. kimi-k2
 * family only allows 0.6 and errors with "invalid temperature: only 0.6 is
 * allowed for this model"), so it must be set explicitly in the text service
 * config and sent with every request.
 * Pass the thinking-off fetch as `inner` to chain both patches.
 */
function createTemperatureFetch(providerName: string, temperature: number, inner?: typeof fetch): typeof fetch {
  const base = inner || fetch
  return async (input: any, init?: any) => {
    try {
      if (init?.body && typeof init.body === 'string') {
        const body = JSON.parse(init.body)
        if (providerName === 'gemini' && Array.isArray(body?.contents)) {
          // Gemini native format
          body.generationConfig = { ...(body.generationConfig || {}), temperature }
          init = { ...init, body: JSON.stringify(body) }
        } else if (Array.isArray(body?.messages)) {
          // OpenAI-compatible format
          body.temperature = temperature
          init = { ...init, body: JSON.stringify(body) }
        }
      }
    } catch { /* pass through unchanged on parse failure */ }
    return base(input, init)
  }
}

/**
 * Inject the output token limit into the request body
 *
 * Background: agent output can contain large planning text plus tool calls
 * (especially when saving in batches), while provider default max_tokens is
 * small (e.g. DeepSeek defaults to 4096/8192) — the model gets truncated
 * mid-writing and the tool call is never generated, which shows up as
 * "the agent finished normally but saved nothing". This explicitly raises the
 * output limit to give the model room to emit complete tool calls.
 * AI_MAX_TOKENS overrides the default (some relay proxies are stricter).
 *
 * Official OpenAI endpoints are not patched: reasoning models (o-series/gpt-5)
 * reject max_tokens (they require max_completion_tokens), and the official
 * default output limit is large enough — truncation mainly hits relay
 * proxies / DeepSeek-style endpoints.
 */
const defaultMaxTokens = Number(process.env.AI_MAX_TOKENS || 16384)

function isOfficialOpenAIHost(baseURL: string) {
  return /api\.openai\.com/.test(baseURL)
}

function createMaxTokensFetch(providerName: string, inner?: typeof fetch): typeof fetch {
  const base = inner || fetch
  return async (input: any, init?: any) => {
    try {
      if (init?.body && typeof init.body === 'string') {
        const body = JSON.parse(init.body)
        if (providerName === 'gemini' && Array.isArray(body?.contents)) {
          // Gemini native format
          body.generationConfig = { ...(body.generationConfig || {}), maxOutputTokens: defaultMaxTokens }
          init = { ...init, body: JSON.stringify(body) }
        } else if (Array.isArray(body?.messages)) {
          // OpenAI-compatible format
          body.max_tokens = defaultMaxTokens
          init = { ...init, body: JSON.stringify(body) }
        }
      }
    } catch { /* pass through unchanged on parse failure */ }
    return base(input, init)
  }
}

export async function getModel(fileModel: string | undefined, modelOverride?: string, textConfigId?: number) {
  // The request may pin a specific text config (with its provider/baseUrl/apiKey); otherwise fall back to the active config
  const textConfig = (textConfigId ? await getConfigById(textConfigId) : null) || await getTextConfig()
  const modelName = modelOverride || fileModel || textConfig.model
  const providerName = textConfig.provider.toLowerCase()
  const resolvedBaseURL = getTextProviderBaseUrl(textConfig)
  const temperature = textConfig.temperature ?? null
  const endpointKey = `${providerName}|${resolvedBaseURL}|${modelName}|t=${temperature ?? 'default'}`
  if (endpointKey !== lastLoggedTextEndpointKey) {
    lastLoggedTextEndpointKey = endpointKey
    logTaskProgress('AIConfig', 'text-model-endpoint', {
      provider: textConfig.provider,
      baseUrl: resolvedBaseURL,
      model: modelName,
      ...(temperature !== null ? { temperature } : {}),
    })
  }

  // Stack request patches: thinking-off (non-official endpoints) + configured temperature + output cap (non-official OpenAI)
  const thinkingOffFetch = createThinkingOffFetch(providerName, resolvedBaseURL)
  const tempFetch = temperature !== null
    ? createTemperatureFetch(providerName, temperature, thinkingOffFetch)
    : thinkingOffFetch
  let fetchImpl = isOfficialOpenAIHost(resolvedBaseURL)
    ? (tempFetch ?? fetch)
    : createMaxTokensFetch(providerName, tempFetch)

  // Local/relay endpoints: lift undici's default 300s headers timeout.
  // Local LLMs (e.g. fusion-mlx 27B) can take over 300s to first token with
  // long context, which trips Node's global fetch Headers Timeout
  // ("Cannot connect to API: Headers Timeout Error")
  if (!isOfficialTextHost(resolvedBaseURL)) {
    const dispatcher = laxDispatcher
    const inner = fetchImpl
    fetchImpl = ((input: any, init?: any) => inner(input, { ...init, dispatcher } as any)) as typeof fetch
  }

  if (providerName === 'gemini') {
    const googleProvider = createGoogleGenerativeAI({
      apiKey: textConfig.apiKey,
      baseURL: resolvedBaseURL,
      fetch: fetchImpl,
    })
    return googleProvider(modelName)
  }

  const provider = createOpenAI({
    baseURL: resolvedBaseURL,
    apiKey: textConfig.apiKey,
    fetch: fetchImpl,
  } as any)
  return provider.chat(modelName)
}

const AGENT_TOOLS: Record<string, Record<string, any>> = {
  script_rewriter: scriptTools,
  extractor: extractTools,
  storyboard_breaker: storyboardTools,
  prompt_generator: {
    ...imagePromptTools,
    readStoryboardContext: storyboardTools.readStoryboardContext,
    updateStoryboard: storyboardTools.updateStoryboard,
  },
}

/**
 * FR-P1-1: agent-level event instrumentation — wraps execute so tool_call/
 * tool_result events land in sys_task_events (episode dimension, for SSE
 * replay). Single hook covers all tools of all 4 agents; episodeId comes from
 * the tool execution context's RequestContext and is skipped when absent
 * (events are an enhancement, not the critical path — instrumentation
 * failures are swallowed and never affect tool results).
 */
function instrumentTools(agentType: string, tools: Record<string, any>): Record<string, any> {
  const wrapped: Record<string, any> = {}
  for (const [name, tool] of Object.entries(tools)) {
    if (!tool || typeof tool.execute !== 'function') { wrapped[name] = tool; continue }
    const original = tool.execute.bind(tool)
    wrapped[name] = {
      ...tool,
      execute: async (input: any, context: any) => {
        const episodeId = context?.requestContext?.get?.('episodeId' as never)
        if (typeof episodeId !== 'number') return original(input, context)
        const agent = context?.agentName || agentType
        void appendEpisodeEvent(episodeId, 'tool_call', { agent, tool: name })
        const startedAt = Date.now()
        try {
          const result = await original(input, context)
          void appendEpisodeEvent(episodeId, 'tool_result', {
            agent, tool: name, ok: true, ms: Date.now() - startedAt,
          })
          return result
        } catch (err) {
          void appendEpisodeEvent(episodeId, 'tool_result', {
            agent, tool: name, ok: false, ms: Date.now() - startedAt,
            error: String((err as Error)?.message || err).slice(0, 300),
          })
          throw err
        }
      },
    }
  }
  return wrapped
}
for (const [type, tools] of Object.entries(AGENT_TOOLS)) {
  AGENT_TOOLS[type] = instrumentTools(type, tools)
}

/** Resolve instructions per request: prompt file (or default) + full skill text + target language directive block.
 *  Prompt/skill text switches to the language variant per content language (<type>.<lang>.md / SKILL.<lang>.md), falling back to the Chinese base version */
function buildInstructions(type: string) {
  return async ({ requestContext }: { requestContext?: RequestContext }) => {
    const defaults = DEFAULT_PROMPTS[type]
    const lang = getContentLanguageFromRC(requestContext)
    const promptFile = await loadAgentPromptFile(type, lang)
    const baseInstructions = promptFile?.instructions || defaults.instructions
    const skillInstructions = await loadAgentSkills(type, lang)
    const languageDirective = buildLanguageDirective(lang)
    return [baseInstructions, skillInstructions, languageDirective]
      .filter(Boolean)
      .join('\n\n')
  }
}

/** Resolve model per request: base prompt file frontmatter + modelOverride/textConfigId overrides from RequestContext
 *  (model is only read from the base prompts/<type>.md; language variants never participate in model resolution) */
function buildModel(type: string) {
  return async ({ requestContext }: { requestContext?: RequestContext }) => {
    const promptFile = await loadBasePromptFile(type)
    const modelOverride = requestContext?.get('modelOverride' as never) as string | undefined
    const textConfigId = requestContext?.get('textConfigId' as never) as number | undefined
    return getModel(promptFile?.model || undefined, modelOverride, textConfigId)
  }
}

/** Static agent table registered at startup (mounted onto the Mastra instance) */
export const agentRegistry: Record<string, Agent> = Object.fromEntries(
  validAgentTypes.map(type => [
    type,
    new Agent({
      id: type,
      name: DEFAULT_PROMPTS[type].name,
      instructions: buildInstructions(type),
      model: buildModel(type),
      tools: AGENT_TOOLS[type],
      workspace: skillWorkspaces[type],
      skillsFormat: 'markdown',
    }),
  ]),
)
