import { ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { videoMergeAPI, type VideoMerge } from '@/api/videoMerge'

export function useVideoMerge(episodeId: Ref<string | number>) {
  const { t: $t } = useI18n()
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
      toast.error($t('professionalEditor.loadMergesFailed'))
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
      const loadingId = toast.info($t('professionalEditor.downloadPreparing'), { duration: Infinity })

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

      toast.dismiss(loadingId)
      toast.success($t('professionalEditor.downloadStarted'))
    } catch (error) {
      console.error('下载视频失败:', error)
      toast.error($t('professionalEditor.downloadFailed'))
    }
  }

  const previewMergedVideo = (url: string) => {
    const videoUrl = url.startsWith('http') ? url : `/static/${url}`
    window.open(videoUrl, '_blank')
  }

  const deleteMerge = async (mergeId: number) => {
    if (!window.confirm($t('professionalEditor.deleteMergeConfirm'))) return

    try {
      await videoMergeAPI.deleteMerge(mergeId)
      toast.success($t('message.deleteSuccess'))
      await loadVideoMerges()
    } catch (error: any) {
      console.error('删除失败:', error)
      toast.error(error.response?.data?.message || $t('message.deleteFailed'))
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
