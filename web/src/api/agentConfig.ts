import request from '../utils/request'

export interface AgentConfig {
  id: number
  agent_type: string
  name: string
  description: string
  model: string
  temperature: number
  max_tokens: number
  max_iterations: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UpdateAgentConfigRequest {
  model?: string
  temperature?: number
  max_tokens?: number
  max_iterations?: number
  is_active?: boolean
}

export interface AgentDebugInfo {
  agent_type: string
  system_prompt: string
  default_prompt: string
  skills: SkillFileInfo[]
  tools: string[]
}

export interface SkillFileInfo {
  name: string
  dir: string
  content: string
}

export const agentConfigAPI = {
  list() {
    return request.get<AgentConfig[]>('/agent-configs')
  },
  get(id: number) {
    return request.get<AgentConfig>(`/agent-configs/${id}`)
  },
  update(id: number, data: UpdateAgentConfigRequest) {
    return request.put<AgentConfig>(`/agent-configs/${id}`, data)
  },
  delete(id: number) {
    return request.delete(`/agent-configs/${id}`)
  },
  getDebugInfo(agentType: string) {
    return request.get(`/agent/${agentType}/debug`)
  },
  updateSkill(agentType: string, skillName: string, dir: string, content: string) {
    return request.put(`/agent/${agentType}/skills/${skillName}`, { dir, content })
  }
}
