import request from '../utils/request'

// 帧类型
export type FrameType = 'first' | 'key' | 'last' | 'panel' | 'action'

// 单帧提示词
export interface SingleFramePrompt {
  prompt: string
  description: string
}

// 多帧提示词
export interface MultiFramePrompt {
  layout: string // horizontal_3, grid_2x2 等
  frames: SingleFramePrompt[]
}

// 帧提示词响应
export interface FramePromptResponse {
  frame_type: FrameType
  single_frame?: SingleFramePrompt
  multi_frame?: MultiFramePrompt
}

// 生成帧提示词请求
export interface GenerateFramePromptRequest {
  frame_type: FrameType
  panel_count?: number // 分镜板格数，默认3
}

/**
 * 生成指定类型的帧提示词
 */
export function generateFramePrompt(
  storyboardId: number,
  data: GenerateFramePromptRequest
): Promise<FramePromptResponse> {
  return request.post<FramePromptResponse>(`/storyboards/${storyboardId}/frame-prompt`, data)
}

/**
 * 生成首帧提示词
 */
export function generateFirstFrame(storyboardId: number): Promise<FramePromptResponse> {
  return generateFramePrompt(storyboardId, { frame_type: 'first' })
}

/**
 * 生成关键帧提示词
 */
export function generateKeyFrame(storyboardId: number): Promise<FramePromptResponse> {
  return generateFramePrompt(storyboardId, { frame_type: 'key' })
}

/**
 * 生成尾帧提示词
 */
export function generateLastFrame(storyboardId: number): Promise<FramePromptResponse> {
  return generateFramePrompt(storyboardId, { frame_type: 'last' })
}

/**
 * 生成分镜板（3格组合）
 */
export function generatePanelFrames(
  storyboardId: number,
  panelCount: number = 3
): Promise<FramePromptResponse> {
  return generateFramePrompt(storyboardId, {
    frame_type: 'panel',
    panel_count: panelCount
  })
}

/**
 * 生成动作序列（5格）
 */
export function generateActionSequence(storyboardId: number): Promise<FramePromptResponse> {
  return generateFramePrompt(storyboardId, { frame_type: 'action' })
}

// 帧提示词记录（从数据库查询）
export interface FramePromptRecord {
  id: number
  storyboard_id: number
  frame_type: FrameType
  prompt: string
  description?: string
  layout?: string
  created_at: string
  updated_at: string
}

/**
 * 查询镜头的所有已生成帧提示词
 */
export function getStoryboardFramePrompts(storyboardId: number): Promise<{ frame_prompts: FramePromptRecord[] }> {
  return request.get<{ frame_prompts: FramePromptRecord[] }>(`/storyboards/${storyboardId}/frame-prompts`)
}
