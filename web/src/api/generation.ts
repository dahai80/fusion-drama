import type {
    GenerateCharactersRequest
} from '../types/generation'
import request from '../utils/request'

export const generationAPI = {
  generateCharacters(data: GenerateCharactersRequest) {
    return request.post<{ task_id: string; status: string; message: string }>('/generation/characters', data)
  },

  generateStoryboard(episodeId: string, model?: string) {
    return request.post<{ task_id: string; status: string; message: string }>(`/episodes/${episodeId}/storyboards`, { model })
  },

  getTaskStatus(taskId: string) {
    return request.get<{
      id: string
      type: string
      status: string
      progress: number
      message?: string
      error?: string
      result?: string
      created_at: string
      updated_at: string
      completed_at?: string
    }>(`/tasks/${taskId}`)
  }
  
}
