import axios from 'axios'

const API_BASE_URL = '/api/v1'

export interface ExtractAudioRequest {
  video_url: string
}

export interface ExtractAudioResponse {
  audio_url: string
  duration: number
}

export interface BatchExtractAudioRequest {
  video_urls: string[]
}

export interface BatchExtractAudioResponse {
  results: ExtractAudioResponse[]
  total: number
}

export const audioAPI = {
  /**
   * 从视频URL提取音频
   */
  extractAudio: async (videoUrl: string): Promise<ExtractAudioResponse> => {
    const response = await axios.post<ExtractAudioResponse>(
      `${API_BASE_URL}/audio/extract`,
      { video_url: videoUrl }
    )
    return response.data
  },

  /**
   * 批量从视频URL提取音频
   */
  batchExtractAudio: async (videoUrls: string[]): Promise<BatchExtractAudioResponse> => {
    const response = await axios.post<BatchExtractAudioResponse>(
      `${API_BASE_URL}/audio/extract/batch`,
      { video_urls: videoUrls }
    )
    return response.data
  }
}
