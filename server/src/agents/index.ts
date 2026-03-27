/**
 * Mastra Agent 定义
 */
import { Agent } from '@mastra/core/agent'
import { Mastra } from '@mastra/core'
import { createOpenAI } from '@ai-sdk/openai'
import { getTextConfig } from '../services/ai.js'

// Tools
import { readEpisodeScript, rewriteToScreenplay, saveScript } from './tools/script-tools.js'
import { readScriptForExtraction, saveCharacters, saveScenes } from './tools/extract-tools.js'
import { readStoryboardContext, saveStoryboards, updateStoryboard } from './tools/storyboard-tools.js'

function getModel() {
  const config = getTextConfig()
  const provider = createOpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    compatibility: 'compatible', // 使用 Chat Completions 格式而非 Responses API
  })
  return provider.chat(config.model)
}

// 剧本改写 Agent
export const scriptRewriter = new Agent({
  id: 'script_rewriter',
  name: '剧本改写',
  instructions: `你是专业编剧，擅长将小说改编为短剧剧本。

工作流程：
1. 调用 read_episode_script 读取原始内容
2. 根据内容进行改写（使用格式化剧本格式）
3. 调用 save_script 保存改写结果

格式化剧本格式：
- 场景头：## S编号 | 内景/外景 · 地点 | 时间段
- 动作描写：自然段落，不包含镜头语言
- 对白：角色名：（状态/表情）台词内容
- 每个场景 30-60 秒内容`,
  model: getModel(),
  tools: { readEpisodeScript, rewriteToScreenplay, saveScript },
})

// 角色场景提取 Agent
export const extractor = new Agent({
  id: 'extractor',
  name: '角色场景提取',
  instructions: `你是制片助理，擅长从剧本中提取角色和场景信息。

工作流程：
1. 调用 read_script_for_extraction 读取格式化剧本
2. 分析剧本，提取所有角色（名字、角色定位、外貌描述、性格特征）
3. 调用 save_characters 保存角色列表
4. 分析剧本，提取所有场景（地点、时间、视觉描述）
5. 调用 save_scenes 保存场景列表

提取要求：
- 角色要包含完整的外貌特征描述（发型、服装、体态等）
- 场景要包含光线、色调、氛围等视觉信息
- 不要遗漏任何有台词或重要动作的角色`,
  model: getModel(),
  tools: { readScriptForExtraction, saveCharacters, saveScenes },
})

// 分镜拆解 Agent
export const storyboardBreaker = new Agent({
  id: 'storyboard_breaker',
  name: '分镜拆解',
  instructions: `你是资深影视分镜师，擅长将剧本拆解为分镜方案。

工作流程：
1. 调用 read_storyboard_context 读取剧本、角色列表、场景列表
2. 将剧本拆解为镜头序列（每个镜头 10-15 秒）
3. 为每个镜头生成视频提示词（video_prompt）
4. 调用 save_storyboards 保存所有分镜

视频提示词格式：
- 按 3 秒为一段，用时间标记分隔
- 使用 <location>地点</location> 标记场景
- 使用 <role>角色名</role> 标记角色
- 使用 <voice>角色名</voice> 标记画外音
- 用 <n> 分隔不同时间段

示例：
"0-3秒：<location>咖啡厅</location>，近景，<role>小明</role>低头看手机。<n>3-6秒：全景，<role>小红</role>推门走入。"

分镜要素：shot_number, title, shot_type, location, time, action, dialogue, video_prompt, duration, scene_id（从场景列表匹配）`,
  model: getModel(),
  tools: { readStoryboardContext, saveStoryboards, updateStoryboard },
})

// Agent 注册表
export const agents: Record<string, Agent> = {
  script_rewriter: scriptRewriter,
  extractor: extractor,
  storyboard_breaker: storyboardBreaker,
}

export function getAgent(type: string): Agent | undefined {
  return agents[type]
}

export const validAgentTypes = Object.keys(agents)
