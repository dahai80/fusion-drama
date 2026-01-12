import type {
    Asset,
    AssetCollection,
    AssetTag,
    CreateAssetRequest,
    ListAssetsParams,
    UpdateAssetRequest
} from '../types/asset'
import request from '../utils/request'

export const assetAPI = {
  createAsset(data: CreateAssetRequest) {
    return request.post<Asset>('/assets', data)
  },

  updateAsset(id: number, data: UpdateAssetRequest) {
    return request.put<Asset>(`/assets/${id}`, data)
  },

  getAsset(id: number) {
    return request.get<Asset>(`/assets/${id}`)
  },

  listAssets(params: ListAssetsParams) {
    return request.get<{
      items: Asset[]
      pagination: {
        page: number
        page_size: number
        total: number
        total_pages: number
      }
    }>('/assets', { params })
  },

  deleteAsset(id: number) {
    return request.delete(`/assets/${id}`)
  },

  importFromImage(imageGenId: number) {
    return request.post<Asset>(`/assets/import/image/${imageGenId}`)
  },

  importFromVideo(videoGenId: number) {
    return request.post<Asset>(`/assets/import/video/${videoGenId}`)
  }
}
