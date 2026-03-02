import { ref, computed, watch, type Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { dramaAPI } from '@/api/drama'
import { imageAPI } from '@/api/image'
import { videoAPI } from '@/api/video'
import { assetAPI } from '@/api/asset'
import { aiAPI } from '@/api/ai'
import type { FrameType } from '@/api/frame'
import type { ImageGeneration } from '@/types/image'
import type { VideoGeneration } from '@/types/video'
import type { Asset } from '@/types/asset'
import type { Storyboard } from '@/types/drama'
import { getVideoUrl } from '@/utils/image'

// 视频模型能力配置
export interface VideoModelCapability {
  id: string
  name: string
  supportMultipleImages: boolean
  supportFirstLastFrame: boolean
  supportSingleImage: boolean
  supportTextOnly: boolean
  maxImages: number
}

// 模型能力默认配置（作为后备）
const defaultModelCapabilities: Record<
  string,
  Omit<VideoModelCapability, 'id' | 'name'>
> = {
  kling: {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 1,
  },
  runway: {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: true,
    supportTextOnly: true,
    maxImages: 2,
  },
  pika: {
    supportSingleImage: true,
    supportMultipleImages: true,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 6,
  },
  'doubao-seedance-1-5-pro-251215': {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: true,
    supportTextOnly: true,
    maxImages: 2,
  },
  'doubao-seedance-1-0-lite-i2v-250428': {
    supportSingleImage: true,
    supportMultipleImages: true,
    supportFirstLastFrame: true,
    supportTextOnly: false,
    maxImages: 6,
  },
  'doubao-seedance-1-0-lite-t2v-250428': {
    supportSingleImage: false,
    supportMultipleImages: false,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 0,
  },
  'doubao-seedance-1-0-pro-250528': {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: true,
    supportTextOnly: true,
    maxImages: 2,
  },
  'doubao-seedance-1-0-pro-fast-251015': {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 1,
  },
  'sora-2': {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 1,
  },
  'sora-2-pro': {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: true,
    supportTextOnly: true,
    maxImages: 2,
  },
  'MiniMax-Hailuo-2.3': {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 1,
  },
  'MiniMax-Hailuo-2.3-Fast': {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 1,
  },
  'MiniMax-Hailuo-02': {
    supportSingleImage: true,
    supportMultipleImages: false,
    supportFirstLastFrame: false,
    supportTextOnly: true,
    maxImages: 1,
  },
}

const extractProviderFromModel = (modelName: string): string => {
  if (modelName.startsWith('doubao-') || modelName.startsWith('seedance'))
    return 'doubao'
  if (modelName.startsWith('runway')) return 'runway'
  if (modelName.startsWith('pika')) return 'pika'
  if (
    modelName.startsWith('MiniMax-') ||
    modelName.toLowerCase().startsWith('minimax') ||
    modelName.startsWith('hailuo')
  )
    return 'minimax'
  if (modelName.startsWith('sora')) return 'openai'
  if (modelName.startsWith('kling')) return 'kling'
  return 'doubao'
}

export function useVideoGenerationPro(
  currentStoryboard: Ref<Storyboard | null>,
  dramaId: number,
  episodeId: Ref<string | number>,
  storyboards: Ref<Storyboard[]>,
  videoReferenceImages: Ref<ImageGeneration[]>,
  timelineEditorRef: Ref<any>,
) {
  // 状态
  const videoDuration = ref(5)
  const selectedVideoFrameType = ref<FrameType>('first')
  const selectedImagesForVideo = ref<number[]>([])
  const selectedLastImageForVideo = ref<number | null>(null)
  const generatingVideo = ref(false)
  const generatedVideos = ref<VideoGeneration[]>([])
  const videoAssets = ref<Asset[]>([])
  const loadingVideos = ref(false)
  const selectedVideoModel = ref<string>('')
  const selectedReferenceMode = ref<string>('')
  const videoModelCapabilities = ref<VideoModelCapability[]>([])
  const showVideoPreview = ref(false)
  const previewVideo = ref<VideoGeneration | null>(null)
  const addingToAssets = ref<Set<number>>(new Set())
  let videoPollingTimer: any = null

  // 上一镜头尾帧
  const previousStoryboardLastFrames = ref<any[]>([])

  // computed
  const currentModelCapability = computed(() => {
    return videoModelCapabilities.value.find(
      (m) => m.id === selectedVideoModel.value,
    )
  })

  const availableReferenceModes = computed(() => {
    const capability = currentModelCapability.value
    if (!capability) return []

    const modes: Array<{ value: string; label: string; description?: string }> = []

    if (capability.supportTextOnly) {
      modes.push({ value: 'none', label: '纯文本', description: '不使用参考图' })
    }
    if (capability.supportSingleImage) {
      modes.push({ value: 'single', label: '单图', description: '使用单张参考图' })
    }
    if (capability.supportFirstLastFrame) {
      modes.push({
        value: 'first_last',
        label: '首尾帧',
        description: '使用首帧和尾帧',
      })
    }
    if (capability.supportMultipleImages) {
      modes.push({
        value: 'multiple',
        label: '多图',
        description: `最多${capability.maxImages}张`,
      })
    }

    return modes
  })

  const firstFrameSlotImage = computed(() => {
    if (selectedImagesForVideo.value.length === 0) return null
    const firstImageId = selectedImagesForVideo.value[0]
    return (
      videoReferenceImages.value.find((img) => img.id === firstImageId) ||
      previousStoryboardLastFrames.value.find((img) => img.id === firstImageId)
    )
  })

  const lastFrameSlotImage = computed(() => {
    if (!selectedLastImageForVideo.value) return null
    return (
      videoReferenceImages.value.find(
        (img) => img.id === selectedLastImageForVideo.value,
      ) ||
      previousStoryboardLastFrames.value.find(
        (img) => img.id === selectedLastImageForVideo.value,
      )
    )
  })

  // watch
  watch(selectedVideoModel, () => {
    selectedImagesForVideo.value = []
    selectedLastImageForVideo.value = null
    selectedReferenceMode.value = ''
  })

  watch(currentStoryboard, (newStoryboard) => {
    if (newStoryboard?.duration) {
      videoDuration.value = Math.round(newStoryboard.duration)
    } else {
      videoDuration.value = 5
    }
    generatedVideos.value = []
    previousStoryboardLastFrames.value = []

    if (newStoryboard) {
      loadStoryboardVideos(newStoryboard.id)
      loadPreviousStoryboardLastFrame()
    }
  })

  watch(selectedReferenceMode, () => {
    selectedImagesForVideo.value = []
    selectedLastImageForVideo.value = null
  })

  // 方法
  const loadVideoModels = async () => {
    try {
      const configs = await aiAPI.list('video')
      const activeConfigs = configs.filter((c) => c.is_active)

      const allModels = activeConfigs
        .flatMap((config) => {
          const models = Array.isArray(config.model)
            ? config.model
            : [config.model]
          return models.map((modelName) => ({
            modelName,
            configName: config.name,
            priority: config.priority || 0,
          }))
        })
        .sort((a, b) => b.priority - a.priority)

      const modelMap = new Map<string, { configName: string; priority: number }>()
      allModels.forEach((model) => {
        if (!modelMap.has(model.modelName)) {
          modelMap.set(model.modelName, {
            configName: model.configName,
            priority: model.priority,
          })
        }
      })

      videoModelCapabilities.value = Array.from(modelMap.keys()).map(
        (modelName) => {
          const capability = defaultModelCapabilities[modelName] || {
            supportSingleImage: true,
            supportMultipleImages: false,
            supportFirstLastFrame: false,
            supportTextOnly: true,
            maxImages: 1,
          }

          return {
            id: modelName,
            name: modelName,
            ...capability,
          }
        },
      )
    } catch (error: any) {
      console.error('加载视频模型配置失败:', error)
      ElMessage.error('加载视频模型失败')
    }
  }

  const loadVideoAssets = async () => {
    try {
      const result = await assetAPI.listAssets({
        drama_id: dramaId.toString(),
        episode_id: Number(episodeId.value) || undefined,
        type: 'video',
        page: 1,
        page_size: 100,
      })
      videoAssets.value = result.items || []
    } catch (error: any) {
      console.error('加载视频素材库失败:', error)
    }
  }

  const loadPreviousStoryboardLastFrame = async () => {
    if (!currentStoryboard.value || storyboards.value.length < 2) {
      previousStoryboardLastFrames.value = []
      return
    }
    const currentIndex = storyboards.value.findIndex(
      (s) => String(s.id) === String(currentStoryboard.value!.id),
    )
    if (currentIndex <= 0) {
      previousStoryboardLastFrames.value = []
      return
    }
    const prevStoryboard = storyboards.value[currentIndex - 1]
    try {
      const result = await imageAPI.listImages({
        storyboard_id: Number(prevStoryboard.id),
        frame_type: 'last',
        page: 1,
        page_size: 10,
      })
      const images = result.items || []
      previousStoryboardLastFrames.value = images.filter(
        (img: any) => img.status === 'completed' && img.image_url,
      )
    } catch (error) {
      console.error('加载上一镜头尾帧失败:', error)
      previousStoryboardLastFrames.value = []
    }
  }

  const handleImageSelect = (imageId: number) => {
    if (!selectedReferenceMode.value) {
      ElMessage.warning('请先选择参考图模式')
      return
    }
    if (!currentModelCapability.value) {
      ElMessage.warning('请先选择视频生成模型')
      return
    }

    const capability = currentModelCapability.value
    const currentIndex = selectedImagesForVideo.value.indexOf(imageId)

    if (currentIndex > -1) {
      selectedImagesForVideo.value.splice(currentIndex, 1)
      return
    }

    const clickedImage = videoReferenceImages.value.find(
      (img) => img.id === imageId,
    )
    if (!clickedImage) return

    switch (selectedReferenceMode.value) {
      case 'single':
        selectedImagesForVideo.value = [imageId]
        break
      case 'first_last': {
        const frameType = clickedImage.frame_type
        if (
          frameType === 'first' ||
          frameType === 'panel' ||
          frameType === 'key'
        ) {
          selectedImagesForVideo.value = [imageId]
        } else if (frameType === 'last') {
          selectedLastImageForVideo.value = imageId
        } else {
          ElMessage.warning('首尾帧模式下，请选择首帧或尾帧类型的图片')
        }
        break
      }
      case 'multiple':
        if (selectedImagesForVideo.value.length >= capability.maxImages) {
          ElMessage.warning(`最多只能选择${capability.maxImages}张图片`)
          return
        }
        selectedImagesForVideo.value.push(imageId)
        break
      default:
        ElMessage.warning('未知的参考图模式')
    }
  }

  const removeSelectedImage = (imageId: number) => {
    if (selectedLastImageForVideo.value === imageId) {
      selectedLastImageForVideo.value = null
      return
    }
    const index = selectedImagesForVideo.value.indexOf(imageId)
    if (index > -1) {
      selectedImagesForVideo.value.splice(index, 1)
    }
  }

  const selectPreviousLastFrame = (img: any) => {
    const currentIndex = selectedImagesForVideo.value.indexOf(img.id)
    if (currentIndex > -1) {
      selectedImagesForVideo.value.splice(currentIndex, 1)
      ElMessage.success('已取消首帧参考')
      return
    }

    if (
      !selectedReferenceMode.value ||
      selectedReferenceMode.value === 'single'
    ) {
      selectedImagesForVideo.value = [img.id]
    } else if (selectedReferenceMode.value === 'first_last') {
      selectedImagesForVideo.value = [img.id]
    } else if (selectedReferenceMode.value === 'multiple') {
      const capability = currentModelCapability.value
      if (
        capability &&
        selectedImagesForVideo.value.length >= capability.maxImages
      ) {
        ElMessage.warning(`最多只能选择${capability.maxImages}张图片`)
        return
      }
      selectedImagesForVideo.value.push(img.id)
    }
    ElMessage.success('已添加为首帧参考')
  }

  const generateVideo = async () => {
    if (!selectedVideoModel.value) {
      ElMessage.warning('请先选择视频生成模型')
      return
    }
    if (!currentStoryboard.value) {
      ElMessage.warning('请先选择分镜')
      return
    }
    if (
      selectedReferenceMode.value !== 'none' &&
      selectedImagesForVideo.value.length === 0
    ) {
      ElMessage.warning('请选择参考图片')
      return
    }

    let selectedImage: any = null
    if (
      selectedReferenceMode.value !== 'none' &&
      selectedImagesForVideo.value.length > 0
    ) {
      selectedImage =
        videoReferenceImages.value.find(
          (img) => img.id === selectedImagesForVideo.value[0],
        ) ||
        previousStoryboardLastFrames.value.find(
          (img) => img.id === selectedImagesForVideo.value[0],
        )
      if (!selectedImage || !selectedImage.image_url) {
        ElMessage.error('请选择有效的参考图片')
        return
      }
    }

    generatingVideo.value = true
    try {
      const provider = extractProviderFromModel(selectedVideoModel.value)

      const requestParams: any = {
        drama_id: dramaId.toString(),
        storyboard_id: Number(currentStoryboard.value.id),
        prompt:
          currentStoryboard.value.video_prompt ||
          currentStoryboard.value.action ||
          currentStoryboard.value.description ||
          '',
        duration: videoDuration.value,
        provider: provider,
        model: selectedVideoModel.value,
        reference_mode: selectedReferenceMode.value,
      }

      switch (selectedReferenceMode.value) {
        case 'single':
          if (selectedImage.local_path) {
            requestParams.image_local_path = selectedImage.local_path
          } else if (selectedImage.image_url) {
            requestParams.image_url = selectedImage.image_url
          }
          requestParams.image_gen_id = selectedImage.id
          break

        case 'first_last': {
          const firstImage =
            videoReferenceImages.value.find(
              (img) => img.id === selectedImagesForVideo.value[0],
            ) ||
            previousStoryboardLastFrames.value.find(
              (img) => img.id === selectedImagesForVideo.value[0],
            )
          const lastImage =
            videoReferenceImages.value.find(
              (img) => img.id === selectedLastImageForVideo.value,
            ) ||
            previousStoryboardLastFrames.value.find(
              (img) => img.id === selectedLastImageForVideo.value,
            )

          if (firstImage?.local_path) {
            requestParams.first_frame_local_path = firstImage.local_path
          } else if (firstImage?.image_url) {
            requestParams.first_frame_url = firstImage.image_url
          }
          if (lastImage?.local_path) {
            requestParams.last_frame_local_path = lastImage.local_path
          } else if (lastImage?.image_url) {
            requestParams.last_frame_url = lastImage.image_url
          }
          break
        }

        case 'multiple': {
          const selectedImages = selectedImagesForVideo.value
            .map((id) => videoReferenceImages.value.find((img) => img.id === id))
            .filter((img) => img?.local_path || img?.image_url)
            .map((img) => img!.local_path || img!.image_url)
          requestParams.reference_image_urls = selectedImages
          break
        }

        case 'none':
          break
      }

      const result = await videoAPI.generateVideo(requestParams)
      generatedVideos.value.unshift(result)
      ElMessage.success('视频生成任务已提交')
      startVideoPolling()
    } catch (error: any) {
      ElMessage.error('生成失败: ' + (error.message || '未知错误'))
    } finally {
      generatingVideo.value = false
    }
  }

  const loadStoryboardVideos = async (storyboardId: string | number) => {
    loadingVideos.value = true
    try {
      const result = await videoAPI.listVideos({
        storyboard_id: storyboardId.toString(),
        page: 1,
        page_size: 50,
      })
      generatedVideos.value = result.items || []

      const hasPendingOrProcessing = generatedVideos.value.some(
        (v) => v.status === 'pending' || v.status === 'processing',
      )
      if (hasPendingOrProcessing) {
        startVideoPolling()
      }
    } catch (error: any) {
      console.error('加载视频列表失败:', error)
    } finally {
      loadingVideos.value = false
    }
  }

  const startVideoPolling = () => {
    if (videoPollingTimer) return

    videoPollingTimer = setInterval(async () => {
      if (!currentStoryboard.value) {
        stopVideoPolling()
        return
      }

      try {
        const oldVideos = [...generatedVideos.value]

        const result = await videoAPI.listVideos({
          storyboard_id: currentStoryboard.value.id.toString(),
          page: 1,
          page_size: 50,
        })
        generatedVideos.value = result.items || []

        const hasNewlyCompleted = generatedVideos.value.some((newVideo) => {
          const oldVideo = oldVideos.find((v) => v.id === newVideo.id)
          return (
            oldVideo &&
            (oldVideo.status === 'pending' || oldVideo.status === 'processing') &&
            newVideo.status === 'completed'
          )
        })

        if (hasNewlyCompleted && episodeId.value) {
          try {
            const storyboardsRes = await dramaAPI.getStoryboards(
              episodeId.value.toString(),
            )
            storyboards.value = (storyboardsRes as any)?.storyboards || []
          } catch (error) {
            console.error('重新加载分镜列表失败:', error)
          }
        }

        const hasPendingOrProcessing = generatedVideos.value.some(
          (v) => v.status === 'pending' || v.status === 'processing',
        )
        if (!hasPendingOrProcessing) {
          stopVideoPolling()
        }
      } catch (error) {
        console.error('轮询视频状态失败:', error)
      }
    }, 5000)
  }

  const stopVideoPolling = () => {
    if (videoPollingTimer) {
      clearInterval(videoPollingTimer)
      videoPollingTimer = null
    }
  }

  const playVideo = (video: VideoGeneration) => {
    previewVideo.value = video
    showVideoPreview.value = true
  }

  const addVideoToAssets = async (video: VideoGeneration) => {
    if (video.status !== 'completed' || !video.video_url) {
      ElMessage.warning('只能添加已完成的视频到素材库')
      return
    }

    addingToAssets.value.add(video.id)

    try {
      let isReplacing = false
      if (video.storyboard_id) {
        const existingAsset = videoAssets.value.find(
          (asset: any) => asset.storyboard_id === video.storyboard_id,
        )

        if (existingAsset) {
          isReplacing = true
          try {
            await assetAPI.deleteAsset(existingAsset.id)
          } catch (error) {
            console.error('删除旧素材失败:', error)
          }
        }
      }

      await assetAPI.importFromVideo(video.id)
      ElMessage.success('已添加到素材库')

      await loadVideoAssets()

      if (isReplacing && video.storyboard_id && video.video_url) {
        if (timelineEditorRef.value) {
          timelineEditorRef.value.updateClipsByStoryboardId(
            video.storyboard_id,
            video.video_url,
          )
        }
      }
    } catch (error: any) {
      ElMessage.error(error.message || '添加失败')
    } finally {
      addingToAssets.value.delete(video.id)
    }
  }

  const handleDeleteVideo = async (video: VideoGeneration) => {
    if (!currentStoryboard.value) return

    try {
      await ElMessageBox.confirm(
        '确定要删除这个视频吗？删除后无法恢复。',
        '确认删除',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )

      await videoAPI.deleteVideo(video.id)
      ElMessage.success('删除成功')

      await loadStoryboardVideos(Number(currentStoryboard.value.id))
    } catch (error: any) {
      if (error !== 'cancel') {
        console.error('删除视频失败:', error)
        ElMessage.error(error.message || '删除失败')
      }
    }
  }

  return {
    videoDuration,
    selectedVideoFrameType,
    selectedImagesForVideo,
    selectedVideoModel,
    selectedReferenceMode,
    generatingVideo,
    generatedVideos,
    loadingVideos,
    addingToAssets,
    videoModelCapabilities,
    videoAssets,
    currentModelCapability,
    availableReferenceModes,
    firstFrameSlotImage,
    lastFrameSlotImage,
    previousStoryboardLastFrames,
    showVideoPreview,
    previewVideo,
    loadVideoModels,
    loadVideoAssets,
    generateVideo,
    loadStoryboardVideos,
    handleImageSelect,
    removeSelectedImage,
    selectPreviousLastFrame,
    playVideo,
    addVideoToAssets,
    handleDeleteVideo,
    stopVideoPolling,
  }
}
