/**
 * Mastra Agent 工厂
 * 每次请求动态创建 agent，注入 episodeId/dramaId 到工具闭包
 */
import { Agent } from '@mastra/core/agent'
import { createOpenAI } from '@ai-sdk/openai'
import { getTextConfig } from '../services/ai.js'
import { createScriptTools } from './tools/script-tools.js'
import { createExtractTools } from './tools/extract-tools.js'
import { createStoryboardTools } from './tools/storyboard-tools.js'
import { createVoiceTools } from './tools/voice-tools.js'

function getModel() {
  const config = getTextConfig()
  const provider = createOpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  } as any)
  return provider.chat(config.model)
}

export const validAgentTypes = ['script_rewriter', 'extractor', 'storyboard_breaker', 'voice_assigner']

/**
 * 创建 agent 实例（per-request，工具已注入 episodeId/dramaId）
 */
export function createAgent(type: string, episodeId: number, dramaId: number): Agent | null {
  const model = getModel()

  switch (type) {
    case 'script_rewriter': {
      const tools = createScriptTools(episodeId)
      return new Agent({
        id: 'script_rewriter',
        name: '剧本改写',
        instructions: `你是专业编剧，擅长将小说改编为短剧剧本。

工作流程：
1. 调用 read_episode_script 读取原始内容
2. 根据读取到的内容，自己进行改写（输出格式化剧本格式）
3. 调用 save_script 保存改写后的完整剧本

格式化剧本格式：
- 场景头：## S编号 | 内景/外景 · 地点 | 时间段
- 动作描写：自然段落，不包含镜头语言
- 对白：角色名：（状态/表情）台词内容
- 每个场景 30-60 秒内容

注意：你必须自己完成改写工作，不要只返回指令。读取内容后直接输出改写结果并保存。`,
        model,
        tools,
      })
    }

    case 'extractor': {
      const tools = createExtractTools(episodeId, dramaId)
      return new Agent({
        id: 'extractor',
        name: '角色场景提取',
        instructions: `你是制片助理，擅长从剧本中提取角色和场景信息。

工作流程：
1. 调用 read_script_for_extraction 读取格式化剧本
2. 分析剧本内容，提取所有角色信息
3. 调用 save_characters 保存角色列表
4. 分析剧本内容，提取所有场景信息
5. 调用 save_scenes 保存场景列表

提取要求：
- 角色要包含完整的外貌特征描述（发型、服装、体态等）
- 场景要包含光线、色调、氛围等视觉信息
- 不要遗漏任何有台词或重要动作的角色`,
        model,
        tools,
      })
    }

    case 'storyboard_breaker': {
      const tools = createStoryboardTools(episodeId, dramaId)
      return new Agent({
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
"0-3秒：<location>咖啡厅</location>，近景，<role>小明</role>低头看手机。<n>3-6秒：全景，<role>小红</role>推门走入。"`,
        model,
        tools,
      })
    }

    case 'voice_assigner': {
      const tools = createVoiceTools(episodeId, dramaId)
      return new Agent({
        id: 'voice_assigner',
        name: '角色音色分配',
        instructions: `你是配音导演，擅长为角色选择合适的音色。

工作流程：
1. 调用 list_voices 获取可用音色列表
2. 调用 get_characters 获取所有角色信息
3. 根据每个角色的性别、性格、年龄、角色定位，选择最匹配的音色
4. 对每个角色调用 assign_voice 分配音色，并说明选择理由

注意：每个角色都必须分配音色，不要遗漏。`,
        model,
        tools,
      })
    }

    default:
      return null
  }
}
