import { ref, watch, type Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { generateFramePrompt, type FrameType } from '@/api/frame'
import { imageAPI } from '@/api/image'
import { taskAPI } from '@/api/task'
import type { ImageGeneration } from '@/types/image'
import type { Storyboard } from '@/types/drama'
import { getImageUrl } from '@/utils/image'

export function useFrameImageGeneration(
  currentStoryboard: Ref<Storyboard | null>,
  dramaId: number,
) {
  // 状态
  const selectedFrameType = ref<FrameType>('first')
  const panelCount = ref(3)
  const generatingPromptStates = ref<Record<string, boolean>>({})
  const framePrompts = ref<Record<string, string>>({
    key: '',
    first: '',
    last: '',
    panel: '',
  })
  const currentFramePrompt = ref('')
  const generatingImage = ref(false)
  const generatedImages = ref<ImageGeneration[]>([])
  const isSwitchingFrameType = ref(false)
  const loadingImages = ref(false)
  let pollingTimer: any = null
  let pollingFrameType: FrameType | null = null

  // 宫格 / 裁剪
  const showGridEditor = ref(false)
  const allGeneratedImages = ref<ImageGeneration[]>([])
  const showCropDialog = ref(false)
  const cropImageUrl = ref<string>('')
  const cropImageData = ref<ImageGeneration | null>(null)

  // 视频参考图（供视频生成共享）
  const videoReferenceImages = ref<ImageGeneration[]>([])

  // 帧提示词存储 key
  const getPromptStorageKey = (
    storyboardId: string | number | undefined,
    frameType: FrameType,
  ) => {
    if (!storyboardId) return null
    return `frame_prompt_${storyboardId}_${frameType}`
  }

  // watch: 帧类型切换
  watch(selectedFrameType, (newType) => {
    stopPolling()

    if (!currentStoryboard.value) {
      currentFramePrompt.value = ''
      generatedImages.value = []
      return
    }

    isSwitchingFrameType.value = true

    const storageKey = `frame_prompt_${currentStoryboard.value.id}_${newType}`
    const stored = sessionStorage.getItem(storageKey)

    if (stored) {
      currentFramePrompt.value = stored
      framePrompts.value[newType] = stored
    } else {
      currentFramePrompt.value = framePrompts.value[newType] || ''
    }

    loadStoryboardImages(currentStoryboard.value.id, newType)

    setTimeout(() => {
      isSwitchingFrameType.value = false
    }, 0)
  })

  // watch: 分镜切换
  watch(currentStoryboard, async (newStoryboard) => {
    if (!newStoryboard) {
      currentFramePrompt.value = ''
      generatedImages.value = []
      videoReferenceImages.value = []
      return
    }

    isSwitchingFrameType.value = true

    framePrompts.value = { key: '', first: '', last: '', panel: '' }

    const storageKey = getPromptStorageKey(
      newStoryboard.id,
      selectedFrameType.value,
    )
    if (storageKey) {
      const stored = sessionStorage.getItem(storageKey)
      currentFramePrompt.value = stored || ''
      if (stored) {
        framePrompts.value[selectedFrameType.value] = stored
      }
    } else {
      currentFramePrompt.value = ''
    }

    setTimeout(() => {
      isSwitchingFrameType.value = false
    }, 0)

    await loadStoryboardImages(newStoryboard.id, selectedFrameType.value)
    await loadAllGeneratedImages()
    await loadVideoReferenceImages(newStoryboard.id)
  })

  // watch: 提示词变化 -> sessionStorage
  watch(currentFramePrompt, (newPrompt) => {
    if (isSwitchingFrameType.value) return
    if (!currentStoryboard.value) return

    const storageKey = getPromptStorageKey(
      currentStoryboard.value.id,
      selectedFrameType.value,
    )
    if (storageKey) {
      if (newPrompt) {
        sessionStorage.setItem(storageKey, newPrompt)
      } else {
        sessionStorage.removeItem(storageKey)
      }
    }
  })

  // 提取帧提示词
  const extractFramePrompt = async () => {
    if (!currentStoryboard.value) return

    const storyboardId = currentStoryboard.value.id
    const targetFrameType = selectedFrameType.value
    const stateKey = `${storyboardId}_${targetFrameType}`
    generatingPromptStates.value[stateKey] = true

    try {
      const params: any = { frame_type: targetFrameType }
      if (targetFrameType === 'panel') {
        params.panel_count = panelCount.value
      }

      const { task_id } = await generateFramePrompt(Number(storyboardId), params)

      const pollTask = async () => {
        while (true) {
          const task = await taskAPI.getStatus(task_id)
          if (task.status === 'completed') {
            let result = task.result
            if (typeof result === 'string') {
              try {
                result = JSON.parse(result)
              } catch (e) {
                console.error('Failed to parse task result', e)
                throw new Error('解析任务结果失败')
              }
            }
            return (result as any).response
          } else if (task.status === 'failed') {
            throw new Error(task.message || task.error || '生成失败')
          }
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      }

      const result: any = await pollTask()

      let extractedPrompt = ''
      if (result.single_frame) {
        extractedPrompt = result.single_frame.prompt
      } else if (result.multi_frame && result.multi_frame.frames) {
        extractedPrompt = result.multi_frame.frames
          .map((frame: any) => frame.prompt)
          .join('\n\n')
      }

      const storageKey = getPromptStorageKey(storyboardId, targetFrameType)
      if (storageKey) {
        sessionStorage.setItem(storageKey, extractedPrompt)
      }

      if (
        currentStoryboard.value &&
        currentStoryboard.value.id === storyboardId &&
        selectedFrameType.value === targetFrameType
      ) {
        currentFramePrompt.value = extractedPrompt
        framePrompts.value[targetFrameType] = extractedPrompt
      }

      ElMessage.success(`${getFrameTypeLabel(targetFrameType)}提示词提取成功`)
    } catch (error: any) {
      ElMessage.error('提取失败: ' + (error.message || '未知错误'))
    } finally {
      const stateKey2 = `${storyboardId}_${targetFrameType}`
      if (generatingPromptStates.value[stateKey2]) {
        generatingPromptStates.value[stateKey2] = false
      }
    }
  }

  const isGeneratingPrompt = (
    storyboardId: string | number | undefined,
    frameType: string,
  ) => {
    if (!storyboardId) return false
    return !!generatingPromptStates.value[`${storyboardId}_${frameType}`]
  }

  const getFrameTypeLabel = (frameType: string): string => {
    const labels: Record<string, string> = {
      key: '关键帧',
      first: '首帧',
      last: '尾帧',
      panel: '分镜版',
    }
    return labels[frameType] || frameType
  }

  // 加载图片列表
  const loadStoryboardImages = async (
    storyboardId: string | number,
    frameType?: string,
  ) => {
    loadingImages.value = true
    try {
      const params: any = {
        storyboard_id: Number(storyboardId),
        page: 1,
        page_size: 50,
      }
      if (frameType) {
        params.frame_type = frameType
      }
      const result = await imageAPI.listImages(params)
      generatedImages.value = result.items || []

      const hasPendingOrProcessing = generatedImages.value.some(
        (img) => img.status === 'pending' || img.status === 'processing',
      )
      if (hasPendingOrProcessing) {
        startPolling()
      }
    } catch (error: any) {
      console.error('加载图片列表失败:', error)
    } finally {
      loadingImages.value = false
    }
  }

  // 轮询
  const startPolling = () => {
    if (pollingTimer) return
    pollingFrameType = selectedFrameType.value

    pollingTimer = setInterval(async () => {
      if (!currentStoryboard.value) {
        stopPolling()
        return
      }
      if (selectedFrameType.value !== pollingFrameType) {
        stopPolling()
        return
      }

      try {
        const params: any = {
          storyboard_id: Number(currentStoryboard.value.id),
          page: 1,
          page_size: 50,
        }
        if (pollingFrameType) {
          params.frame_type = pollingFrameType
        }
        const result = await imageAPI.listImages(params)

        if (selectedFrameType.value === pollingFrameType) {
          generatedImages.value = result.items || []
        }

        const hasPendingOrProcessing = (result.items || []).some(
          (img: any) => img.status === 'pending' || img.status === 'processing',
        )
        if (!hasPendingOrProcessing) {
          stopPolling()
          if (currentStoryboard.value) {
            loadVideoReferenceImages(currentStoryboard.value.id)
          }
        }
      } catch (error) {
        console.error('轮询图片状态失败:', error)
      }
    }, 3000)
  }

  const stopPolling = () => {
    if (pollingTimer) {
      clearInterval(pollingTimer)
      pollingTimer = null
    }
    pollingFrameType = null
  }

  // 生成图片
  const generateFrameImage = async (currentStoryboardCharacters: any[]) => {
    if (!currentStoryboard.value || !currentFramePrompt.value) return

    generatingImage.value = true
    try {
      const referenceImages: string[] = []

      if (currentStoryboard.value.background?.local_path) {
        referenceImages.push(currentStoryboard.value.background.local_path)
      }

      if (currentStoryboardCharacters && currentStoryboardCharacters.length > 0) {
        currentStoryboardCharacters.forEach((char: any) => {
          if (char.local_path) {
            referenceImages.push(char.local_path)
          }
        })
      }

      const result = await imageAPI.generateImage({
        drama_id: dramaId.toString(),
        prompt: currentFramePrompt.value,
        storyboard_id: Number(currentStoryboard.value.id),
        image_type: 'storyboard',
        frame_type: selectedFrameType.value,
        reference_images:
          referenceImages.length > 0 ? referenceImages : undefined,
      })

      generatedImages.value.unshift(result)

      const refMsg =
        referenceImages.length > 0
          ? ` (已添加${referenceImages.length}张参考图)`
          : ''
      ElMessage.success(`图片生成任务已提交${refMsg}`)

      startPolling()
    } catch (error: any) {
      ElMessage.error('生成失败: ' + (error.message || '未知错误'))
    } finally {
      generatingImage.value = false
    }
  }

  // 上传图片
  const uploadImage = async () => {
    if (!currentStoryboard.value) {
      ElMessage.warning('请先选择镜头')
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async (e: Event) => {
      const target = e.target as HTMLInputElement
      const file = target.files?.[0]
      if (!file) return

      if (file.size > 10 * 1024 * 1024) {
        ElMessage.error('图片大小不能超过 10MB')
        return
      }

      try {
        const formData = new FormData()
        formData.append('file', file)

        const response = await fetch('/api/v1/upload/image', {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          throw new Error('上传失败')
        }

        const result = await response.json()
        const imageUrl = result.data?.url

        if (imageUrl && currentStoryboard.value) {
          await imageAPI.uploadImage({
            storyboard_id: Number(currentStoryboard.value.id),
            drama_id: Number(dramaId),
            frame_type: selectedFrameType.value || 'first',
            image_url: imageUrl,
            prompt: currentFramePrompt.value || '用户上传图片',
          })

          await loadStoryboardImages(
            currentStoryboard.value.id,
            selectedFrameType.value,
          )

          ElMessage.success('图片上传成功')
        }
      } catch (error: any) {
        console.error('上传图片失败:', error)
        ElMessage.error(error.message || '上传失败')
      }
    }
    input.click()
  }

  // 删除图片
  const handleDeleteImage = async (img: ImageGeneration) => {
    if (!currentStoryboard.value) return

    try {
      await ElMessageBox.confirm('确定要删除这张图片吗？', '确认删除', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      })

      await imageAPI.deleteImage(img.id)
      ElMessage.success('删除成功')

      await loadStoryboardImages(
        currentStoryboard.value.id,
        selectedFrameType.value,
      )
    } catch (error: any) {
      if (error !== 'cancel') {
        console.error('删除图片失败:', error)
        ElMessage.error(error.message || '删除失败')
      }
    }
  }

  // 加载所有图片
  const loadAllGeneratedImages = async () => {
    if (!currentStoryboard.value) return

    try {
      const result = await imageAPI.listImages({
        storyboard_id: Number(currentStoryboard.value.id),
        page: 1,
        page_size: 100,
      })
      allGeneratedImages.value = result.items || []
    } catch (error: any) {
      console.error('加载所有图片失败:', error)
    }
  }

  // 加载视频参考图
  const loadVideoReferenceImages = async (storyboardId: string | number) => {
    try {
      const result = await imageAPI.listImages({
        storyboard_id: Number(storyboardId),
        page: 1,
        page_size: 100,
      })
      videoReferenceImages.value = result.items || []
    } catch (error: any) {
      console.error('加载视频参考图片失败:', error)
    }
  }

  // 宫格成功回调
  const handleGridImageSuccess = async () => {
    if (currentStoryboard.value) {
      await loadStoryboardImages(currentStoryboard.value.id, 'action')
      await loadAllGeneratedImages()
    }
  }

  // 裁剪对话框
  const openCropDialog = (img: ImageGeneration) => {
    cropImageData.value = img
    cropImageUrl.value = getImageUrl(img) || ''
    showCropDialog.value = true
  }

  const handleCropSave = async (images: { blob: Blob; frameType: string }[]) => {
    if (!currentStoryboard.value || !cropImageData.value) return

    try {
      const convertBlobToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(blob)
        })
      }

      for (const img of images) {
        const imageUrl = await convertBlobToBase64(img.blob)

        await imageAPI.uploadImage({
          storyboard_id: Number(currentStoryboard.value.id),
          drama_id: Number(dramaId),
          frame_type: img.frameType,
          image_url: imageUrl,
          prompt: cropImageData.value.prompt || '',
        })
      }

      ElMessage.success('裁剪图片保存成功')

      if (currentStoryboard.value) {
        await loadStoryboardImages(currentStoryboard.value.id)
        await loadAllGeneratedImages()
      }
    } catch (error) {
      console.error('Failed to save cropped images:', error)
      ElMessage.error('保存裁剪图片失败')
    }
  }

  // 辅助
  const getStatusText = (status: string) => {
    const statusTextMap: Record<string, string> = {
      pending: '等待中',
      processing: '生成中',
      completed: '已完成',
      failed: '失败',
    }
    return statusTextMap[status] || status
  }

  const getStatusType = (status: string) => {
    const statusMap: Record<string, any> = {
      pending: 'info',
      processing: 'warning',
      completed: 'success',
      failed: 'danger',
    }
    return statusMap[status] || 'info'
  }

  const getStoryboardThumbnail = (storyboard: any) => {
    if (storyboard.composed_image) return storyboard.composed_image
    if (storyboard.image_url) return storyboard.image_url
    return null
  }

  return {
    selectedFrameType,
    currentFramePrompt,
    generatingImage,
    generatedImages,
    allGeneratedImages,
    videoReferenceImages,
    loadingImages,
    panelCount,
    extractFramePrompt,
    generateFrameImage,
    uploadImage,
    handleDeleteImage,
    loadStoryboardImages,
    loadAllGeneratedImages,
    loadVideoReferenceImages,
    isGeneratingPrompt,
    getFrameTypeLabel,
    getStatusText,
    getStatusType,
    getStoryboardThumbnail,
    // 宫格/裁剪
    showGridEditor,
    showCropDialog,
    cropImageUrl,
    cropImageData,
    openCropDialog,
    handleCropSave,
    handleGridImageSuccess,
    // 轮询
    stopPolling,
  }
}
