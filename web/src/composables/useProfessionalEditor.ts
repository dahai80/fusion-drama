import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { dramaAPI } from '@/api/drama'
import { propAPI } from '@/api/prop'
import type { Drama, Episode, Storyboard } from '@/types/drama'

export function useProfessionalEditor() {
  const route = useRoute()
  const router = useRouter()
  const { t: $t } = useI18n()

  // 路由参数
  const dramaId = Number(route.params.dramaId)
  const episodeNumber = Number(route.params.episodeNumber)
  const episodeId = ref<string | number>(0)

  // 核心数据
  const drama = ref<Drama | null>(null)
  const episode = ref<Episode | null>(null)
  const storyboards = ref<Storyboard[]>([])
  const characters = ref<any[]>([])
  const availableScenes = ref<any[]>([])
  const props = ref<any[]>([])

  // 当前选中
  const currentStoryboardId = ref<string | null>(null)

  // 弹窗状态
  const showSceneSelector = ref(false)
  const showCharacterSelector = ref(false)
  const showPropSelector = ref(false)
  const showCharacterImagePreview = ref(false)
  const previewCharacter = ref<any>(null)
  const showSceneImagePreview = ref(false)

  // computed
  const currentStoryboard = computed(() => {
    if (!currentStoryboardId.value) return null
    return storyboards.value.find(
      (s) => String(s.id) === String(currentStoryboardId.value),
    ) || null
  })

  const previousStoryboard = computed(() => {
    if (!currentStoryboardId.value || storyboards.value.length < 2) return null
    const currentIndex = storyboards.value.findIndex(
      (s) => String(s.id) === String(currentStoryboardId.value),
    )
    if (currentIndex <= 0) return null
    return storyboards.value[currentIndex - 1]
  })

  const currentStoryboardCharacters = computed(() => {
    if (!currentStoryboard.value?.characters) return []

    if (
      Array.isArray(currentStoryboard.value.characters) &&
      currentStoryboard.value.characters.length > 0
    ) {
      const firstItem = currentStoryboard.value.characters[0]
      if (typeof firstItem === 'object' && (firstItem as any).id) {
        return currentStoryboard.value.characters
      }
      if (typeof firstItem === 'number') {
        return characters.value.filter((c) =>
          currentStoryboard.value!.characters!.includes(c.id as any),
        )
      }
    }

    return []
  })

  const availableCharacters = computed(() => characters.value || [])

  const availableProps = computed(() => props.value || [])

  const currentStoryboardProps = computed(() => {
    if (!currentStoryboard.value?.props) return []
    return currentStoryboard.value.props
  })

  // 方法
  const loadData = async () => {
    try {
      const dramaRes = await dramaAPI.get(dramaId.toString())
      drama.value = dramaRes

      const ep = dramaRes.episodes?.find(
        (e) => e.episode_number === episodeNumber,
      )
      if (!ep) {
        ElMessage.error('章节不存在')
        router.back()
        return
      }

      episode.value = ep
      episodeId.value = ep.id

      const storyboardsRes = await dramaAPI.getStoryboards(ep.id.toString())
      storyboards.value = (storyboardsRes as any)?.storyboards || []

      if (storyboards.value.length > 0 && !currentStoryboardId.value) {
        currentStoryboardId.value = storyboards.value[0].id
      }

      characters.value = dramaRes.characters || []
      availableScenes.value = dramaRes.scenes || []
      props.value = dramaRes.props || []
    } catch (error: any) {
      ElMessage.error('加载数据失败: ' + (error.message || '未知错误'))
    }
  }

  const selectStoryboard = (id: string) => {
    currentStoryboardId.value = id
  }

  const goBack = () => {
    router.replace({
      name: 'EpisodeWorkflowNew',
      params: { id: dramaId, episodeNumber },
    })
  }

  const handleAddStoryboard = async () => {
    if (!episodeId.value) return

    try {
      const nextShotNumber =
        storyboards.value.length > 0
          ? Math.max(...storyboards.value.map((s) => s.storyboard_number)) + 1
          : 1

      await dramaAPI.createStoryboard({
        episode_id: Number(episodeId.value),
        storyboard_number: nextShotNumber,
        title: `镜头 ${nextShotNumber}`,
        description: '新镜头描述',
        action: '动作描述',
        dialogue: '',
        duration: 5,
        scene_id:
          storyboards.value.length > 0
            ? Number(storyboards.value[storyboards.value.length - 1].scene_id)
            : undefined,
      })

      ElMessage.success('添加分镜成功')
      await loadData()

      if (storyboards.value.length > 0) {
        selectStoryboard(storyboards.value[storyboards.value.length - 1].id)
      }
    } catch (error: any) {
      console.error('添加分镜失败:', error)
      ElMessage.error(error.message || '添加分镜失败')
    }
  }

  const handleDeleteStoryboard = async (storyboard: any) => {
    try {
      await ElMessageBox.confirm(
        `确定要删除镜头 ${storyboard.storyboard_number} 吗？此操作不可恢复。`,
        '删除确认',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )

      await dramaAPI.deleteStoryboard(storyboard.id)
      ElMessage.success('删除分镜成功')

      if (currentStoryboardId.value === storyboard.id) {
        currentStoryboardId.value = null
      }

      await loadData()
    } catch (error: any) {
      if (error !== 'cancel') {
        console.error('删除分镜失败:', error)
        ElMessage.error(error.message || '删除分镜失败')
      }
    }
  }

  const saveStoryboardField = async (fieldName: string) => {
    if (!currentStoryboard.value) return
    try {
      const updateData: any = {}
      updateData[fieldName] = (currentStoryboard.value as any)[fieldName]

      await dramaAPI.updateStoryboard(
        currentStoryboard.value.id.toString(),
        updateData,
      )
    } catch (error: any) {
      ElMessage.error('保存失败: ' + (error.message || '未知错误'))
    }
  }

  const toggleCharacterInShot = async (charId: number) => {
    if (!currentStoryboard.value) return

    if (!currentStoryboard.value.characters) {
      currentStoryboard.value.characters = []
    }

    const char = characters.value.find((c) => c.id === charId)
    if (!char) return

    const existIndex = currentStoryboard.value.characters.findIndex((c) =>
      typeof c === 'object' ? (c as any).id === charId : Number(c) === charId,
    )

    if (existIndex > -1) {
      currentStoryboard.value.characters.splice(existIndex, 1)
    } else {
      currentStoryboard.value.characters.push(char)
    }

    try {
      const characterIds = currentStoryboard.value.characters.map((c) =>
        typeof c === 'object' ? (c as any).id : Number(c),
      )

      await dramaAPI.updateStoryboard(currentStoryboard.value.id.toString(), {
        character_ids: characterIds,
      })

      if (existIndex > -1) {
        ElMessage.success(`已移除角色: ${char.name}`)
      } else {
        ElMessage.success(`已添加角色: ${char.name}`)
      }
    } catch (error: any) {
      ElMessage.error('保存失败: ' + (error.message || '未知错误'))
      if (existIndex > -1) {
        currentStoryboard.value.characters.push(char)
      } else {
        currentStoryboard.value.characters.splice(
          currentStoryboard.value.characters.length - 1,
          1,
        )
      }
    }
  }

  const isCharacterInCurrentShot = (charId: number) => {
    if (!currentStoryboard.value?.characters) return false

    if (
      Array.isArray(currentStoryboard.value.characters) &&
      currentStoryboard.value.characters.length > 0
    ) {
      const firstItem = currentStoryboard.value.characters[0]
      if (typeof firstItem === 'object' && (firstItem as any).id) {
        return currentStoryboard.value.characters.some((c: any) => c.id === charId)
      }
      if (typeof firstItem === 'number') {
        return (currentStoryboard.value.characters as any[]).includes(charId)
      }
    }

    return false
  }

  const togglePropInShot = async (propId: number) => {
    if (!currentStoryboard.value) return

    let newProps = [...(currentStoryboard.value.props || [])]
    if (isPropInCurrentShot(propId)) {
      newProps = newProps.filter((p: any) => p.id !== propId)
    } else {
      const prop = props.value.find((p) => p.id === propId)
      if (prop) {
        newProps.push(prop)
      }
    }

    currentStoryboard.value.props = newProps

    try {
      const propIds = newProps.map((p: any) => p.id)
      await propAPI.associateWithStoryboard(
        Number(currentStoryboard.value.id),
        propIds,
      )
    } catch (error) {
      ElMessage.error($t('editor.updatePropFailed'))
    }
  }

  const isPropInCurrentShot = (propId: number) => {
    if (!currentStoryboard.value?.props) return false
    return currentStoryboard.value.props.some((p: any) => p.id === propId)
  }

  const selectScene = async (sceneId: number) => {
    if (!currentStoryboard.value) return

    try {
      await dramaAPI.updateStoryboard(currentStoryboard.value.id.toString(), {
        scene_id: String(sceneId),
      })

      await loadData()
      showSceneSelector.value = false
      ElMessage.success('场景关联成功')
    } catch (error: any) {
      ElMessage.error(error.message || '场景关联失败')
    }
  }

  const showCharacterImage = (char: any) => {
    previewCharacter.value = char
    showCharacterImagePreview.value = true
  }

  const showSceneImage = () => {
    if (currentStoryboard.value?.background?.image_url) {
      showSceneImagePreview.value = true
    }
  }

  return {
    // 路由
    dramaId,
    episodeNumber,
    episodeId,
    // 核心数据
    drama,
    episode,
    storyboards,
    characters,
    availableScenes,
    props,
    // 选中状态
    currentStoryboardId,
    currentStoryboard,
    previousStoryboard,
    // computed
    currentStoryboardCharacters,
    currentStoryboardProps,
    availableCharacters,
    availableProps,
    // 弹窗状态
    showSceneSelector,
    showCharacterSelector,
    showPropSelector,
    showCharacterImagePreview,
    previewCharacter,
    showSceneImagePreview,
    // 方法
    loadData,
    selectStoryboard,
    goBack,
    handleAddStoryboard,
    handleDeleteStoryboard,
    saveStoryboardField,
    toggleCharacterInShot,
    isCharacterInCurrentShot,
    togglePropInShot,
    isPropInCurrentShot,
    selectScene,
    showCharacterImage,
    showSceneImage,
  }
}
