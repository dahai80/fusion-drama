export interface Asset {
  id: number
  drama_id?: number
  episode_id?: number
  storyboard_id?: number
  storyboard_num?: number
  name: string
  description?: string
  type: AssetType
  category?: string
  url: string
  thumbnail_url?: string
  local_path?: string
  file_size?: number
  mime_type?: string
  width?: number
  height?: number
  duration?: number
  format?: string
  image_gen_id?: number
  video_gen_id?: number
  tags?: AssetTag[]
  collections?: AssetCollection[]
  is_favorite: boolean
  view_count: number
  created_at: string
  updated_at: string
}

export type AssetType = 'image' | 'video' | 'audio'

export interface AssetTag {
  id: number
  name: string
  color?: string
  created_at: string
}

export interface AssetCollection {
  id: number
  drama_id?: number
  name: string
  description?: string
  assets?: Asset[]
  created_at: string
}

export interface CreateAssetRequest {
  drama_id?: number
  name: string
  description?: string
  type: AssetType
  category?: string
  url: string
  thumbnail_url?: string
  local_path?: string
  file_size?: number
  mime_type?: string
  width?: number
  height?: number
  duration?: number
  format?: string
  image_gen_id?: number
  video_gen_id?: number
  tag_ids?: number[]
}

export interface UpdateAssetRequest {
  name?: string
  description?: string
  category?: string
  thumbnail_url?: string
  tag_ids?: number[]
  is_favorite?: boolean
}

export interface ListAssetsParams {
  drama_id?: string
  episode_id?: number
  storyboard_id?: number
  type?: 'image' | 'video' | 'audio'
  category?: string
  tag_ids?: number[]
  is_favorite?: boolean
  search?: string
  page?: number
  page_size?: number
}

export const ASSET_CATEGORIES = {
  image: ['角色', '场景', '道具', '背景', '其他'],
  video: ['分镜', '特效', '片头', '片尾', '其他'],
  audio: ['配音', '音效', '背景音乐', '片头曲', '片尾曲', '其他']
}
