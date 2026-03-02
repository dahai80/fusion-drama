import { ref, type Ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { videoMergeAPI, type VideoMerge } from '@/api/videoMerge'

export function useVideoMerge(episodeId: Ref<string | number>) {
  const videoMerges = ref<VideoMerge[]>([])
  const loadingMerges = ref(false)
  let mergePollingTimer: any = null

  const loadVideoMerges = async () => {
    if (!episodeId.value) return

    try {
      loadingMerges.value = true
      const result = await videoMergeAPI.listMerges({
        episode_id: episodeId.value.toString(),
        page: 1,
        page_size: 20,
      })
      videoMerges.value = result.merges

      const hasProcessingTasks = result.merges.some(
        (merge: any) =>
          merge.status === 'pending' || merge.status === 'processing',
      )

      if (hasProcessingTasks) {
        startMergePolling()
      } else {
        stopMergePolling()
      }
    } catch (error: any) {
      console.error('加载视频合成列表失败:', error)
      ElMessage.error('加载视频合成列表失败')
    } finally {
      loadingMerges.value = false
    }
  }

  const startMergePolling = () => {
    if (mergePollingTimer) return

    mergePollingTimer = setInterval(async () => {
      if (!episodeId.value) {
        stopMergePolling()
        return
      }

      try {
        const result = await videoMergeAPI.listMerges({
          episode_id: episodeId.value.toString(),
          page: 1,
          page_size: 20,
        })
        videoMerges.value = result.merges

        const hasProcessingTasks = result.merges.some(
          (merge: any) =>
            merge.status === 'pending' || merge.status === 'processing',
        )

        if (!hasProcessingTasks) {
          stopMergePolling()
        }
      } catch (error) {}
    }, 3000)
  }

  const stopMergePolling = () => {
    if (mergePollingTimer) {
      clearInterval(mergePollingTimer)
      mergePollingTimer = null
    }
  }

  const handleMergeCompleted = async () => {
    await loadVideoMerges()
  }

  const downloadVideo = async (url: string, title: string) => {
    try {
      const loadingMsg = ElMessage.info({
        message: '正在准备下载...',
        duration: 0,
      })

      const videoUrl = url.startsWith('http') ? url : `/static/${url}`

      const response = await fetch(videoUrl)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `${title}.mp4`
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()

      setTimeout(() => {
        document.body.removeChild(link)
        window.URL.revokeObjectURL(blobUrl)
      }, 100)

      loadingMsg.close()
      ElMessage.success('视频下载已开始')
    } catch (error) {
      console.error('下载视频失败:', error)
      ElMessage.error('视频下载失败，请稍后重试')
    }
  }

  const previewMergedVideo = (url: string) => {
    const videoUrl = url.startsWith('http') ? url : `/static/${url}`
    window.open(videoUrl, '_blank')
  }

  const deleteMerge = async (mergeId: number) => {
    try {
      await ElMessageBox.confirm(
        '确定要删除此合成记录吗？此操作不可恢复。',
        '删除确认',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )

      await videoMergeAPI.deleteMerge(mergeId)
      ElMessage.success('删除成功')
      await loadVideoMerges()
    } catch (error: any) {
      if (error !== 'cancel') {
        console.error('删除失败:', error)
        ElMessage.error(error.response?.data?.message || '删除失败')
      }
    }
  }

  return {
    videoMerges,
    loadingMerges,
    loadVideoMerges,
    handleMergeCompleted,
    downloadVideo,
    previewMergedVideo,
    deleteMerge,
    stopMergePolling,
  }
}
