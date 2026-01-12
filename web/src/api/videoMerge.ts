import request from '../utils/request'

export interface SceneClip {
  scene_id: string
  video_url: string
  start_time: number
  end_time: number
  duration: number
  order: number
}

export interface MergeVideoRequest {
  episode_id: string
  drama_id: string
  title: string
  scenes: SceneClip[]
  provider?: string
  model?: string
}

export interface VideoMerge {
  id: number
  episode_id: string
  drama_id: string
  title: string
  provider: string
  model?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  scenes: SceneClip[]
  merged_url?: string
  duration?: number
  task_id?: string
  error_msg?: string
  created_at: string
  completed_at?: string
}

export const videoMergeAPI = {
  async mergeVideos(data: MergeVideoRequest): Promise<VideoMerge> {
    const response = await request.post<{ merge: VideoMerge }>('/video-merges', data)
    return response.merge
  },

  async getMerge(mergeId: number): Promise<VideoMerge> {
    const response = await request.get<{ merge: VideoMerge }>(`/video-merges/${mergeId}`)
    return response.merge
  },

  async listMerges(params: {
    episode_id?: string
    status?: string
    page?: number
    page_size?: number
  }): Promise<{ merges: VideoMerge[]; total: number }> {
    const response = await request.get<{ merges: VideoMerge[]; total: number }>('/video-merges', { params })
    return {
      merges: response.merges || [],
      total: response.total || 0
    }
  },

  async deleteMerge(mergeId: number): Promise<void> {
    await request.delete(`/video-merges/${mergeId}`)
  }
}
