import type { Character, Episode } from '../types/drama'
import type {
    GenerateCharactersRequest,
    GenerateEpisodesRequest,
    GenerateOutlineRequest,
    OutlineResult
} from '../types/generation'
import request from '../utils/request'

export const generationAPI = {
  generateOutline(data: GenerateOutlineRequest) {
    return request.post<OutlineResult>('/generation/outline', data)
  },

  generateCharacters(data: GenerateCharactersRequest) {
    return request.post<Character[]>('/generation/characters', data)
  },

  generateEpisodes(data: GenerateEpisodesRequest) {
    return request.post<Episode[]>('/generation/episodes', data)
  },

  generateStoryboard(episodeId: string) {
    return request.post<{ task_id: string; status: string; message: string }>(`/episodes/${episodeId}/storyboards`)
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
