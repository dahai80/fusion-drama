export interface AgentChatRequest {
  message: string
  drama_id?: number
  episode_id?: number
}

export interface AgentSSEEvent {
  type: 'tool_call' | 'tool_result' | 'content' | 'done' | 'error'
  data: string
  tool_name?: string
}

export type AgentType =
  | 'script_rewriter'
  | 'style_analyzer'
  | 'extractor'
  | 'voice_assigner'
  | 'storyboard_breaker'
  | 'prompt_generator'

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  agentType?: AgentType
  toolCalls?: { name: string; result: string }[]
  timestamp: number
}
