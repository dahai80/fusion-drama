<template>
  <div>
    <TabHeader :title="$t('drama.management.episodeList')">
      <template #actions>
        <Button variant="outline" @click="showUploadNovel = true">
          <Upload :size="16" class="mr-1" />
          {{ $t('drama.management.uploadNovel') }}
        </Button>
        <Button @click="createEpisode">
          <Plus :size="16" class="mr-1" />
          {{ $t('drama.management.createEpisode') }}
        </Button>
      </template>
      <template #filter>
        <div class="filter-input-wrapper">
          <Search :size="16" class="filter-icon" />
          <Input
            v-model="searchQuery"
            :placeholder="$t('drama.management.searchPlaceholder')"
            class="filter-input"
          />
        </div>
        <Select v-model="filterValue">
          <SelectTrigger class="w-[150px]">
            <SelectValue :placeholder="$t('drama.management.filterStatus')" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="draft">{{ $t('message.statusDraft') }}</SelectItem>
            <SelectItem value="created">{{ $t('message.episodeCreated') }}</SelectItem>
            <SelectItem value="split">{{ $t('message.episodeSplit') }}</SelectItem>
          </SelectContent>
        </Select>
      </template>
    </TabHeader>

    <div v-if="filteredItems.length > 0" class="list-container">
      <div
        v-for="episode in filteredItems"
        :key="episode.id"
        class="list-row glass-list-row"
        @click="enterEpisode(episode)"
      >
        <div class="row-thumb row-thumb-icon">
          <FileText :size="20" />
        </div>
        <div class="row-body">
          <div class="row-top">
            <span class="row-title">{{ $t('drama.management.episodePrefix') }}{{ episode.episode_number }} {{ episode.title }}</span>
            <span :class="['glass-chip', getEpisodeChipClass(episode)]">{{ getEpisodeStatusText(episode) }}</span>
          </div>
          <div class="row-bottom">
            <span class="row-desc">{{ episode.script_content ? episode.script_content.substring(0, 100) : episode.description || '-' }}</span>
            <div class="row-meta">
              <span class="meta-item">{{ episode.shots?.length || 0 }}{{ $t('workflow.shots') }}</span>
              <span class="meta-sep">&middot;</span>
              <span class="meta-item">{{ formatDate(episode.created_at) }}</span>
            </div>
          </div>
        </div>
        <div class="row-actions" @click.stop>
          <ActionButton :icon="Pencil" :tooltip="$t('drama.management.goToEdit')" variant="primary" @click="enterEpisode(episode)" />
          <ActionButton :icon="Trash2" :tooltip="$t('common.delete')" variant="danger" @click="deleteEpisode(episode)" />
        </div>
      </div>
    </div>

    <EmptyState
      v-else-if="episodes.length === 0"
      :title="$t('drama.management.noEpisodes')"
      :description="$t('drama.management.emptyTip')"
      :icon="FileText"
    >
      <Button @click="createEpisode">
        <Plus :size="16" class="mr-1" />
        {{ $t('drama.management.createEpisode') }}
      </Button>
    </EmptyState>

    <EmptyState
      v-else
      :title="$t('common.noData')"
      :description="$t('common.noData')"
      :icon="Search"
    />

    <!-- 上传小说对话框 -->
    <UploadNovelDialog
      v-model="showUploadNovel"
      :drama-id="dramaStore.dramaId"
      :existing-episode-count="episodes.length"
      @success="reloadDrama"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Plus, Upload, Search, FileText, Pencil, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TabHeader, ActionButton, EmptyState } from '@/components/common'
import { useFilteredList } from '@/composables/useFilteredList'
import { useDramaStore } from '@/stores/drama'
import { dramaAPI } from '@/api/drama'
import UploadNovelDialog from '../components/UploadNovelDialog.vue'
import type { Episode } from '@/types/drama'

const { t } = useI18n()
const router = useRouter()
const dramaStore = useDramaStore()

const showUploadNovel = ref(false)

const episodes = computed(() => dramaStore.episodes)

const sortedEpisodes = computed(() => {
  const list = episodes.value
  return Array.isArray(list) ? [...list].sort((a, b) => a.episode_number - b.episode_number) : []
})

const createEpisode = () => {
  const nextEpisodeNumber = episodes.value.length + 1
  router.push({
    name: 'EpisodeWorkbench',
    params: {
      id: dramaStore.dramaId,
      episodeNumber: nextEpisodeNumber,
    },
  })
}

const enterEpisode = (episode: Episode) => {
  router.push({
    name: 'EpisodeWorkbench',
    params: {
      id: dramaStore.dramaId,
      episodeNumber: episode.episode_number,
    },
  })
}

const deleteEpisode = async (episode: Episode) => {
  if (!window.confirm(t('message.episodeDeleteConfirm', { number: episode.episode_number }))) return

  try {
    const existingEpisodes = Array.isArray(dramaStore.episodes) ? dramaStore.episodes : []
    const updatedEpisodes = existingEpisodes
      .filter((ep) => ep.episode_number !== episode.episode_number)
      .map((ep) => ({
        episode_number: ep.episode_number,
        title: ep.title,
        script_content: ep.script_content,
        description: ep.description,
        duration: ep.duration,
        status: ep.status,
      }))

    await dramaAPI.saveEpisodes(dramaStore.dramaId, updatedEpisodes)
    toast.success(t('message.episodeDeleteSuccess', { number: episode.episode_number }))
    await reloadDrama()
  } catch (error: any) {
    toast.error(error.message || t('message.deleteFailed'))
  }
}

const reloadDrama = async () => {
  await dramaStore.loadDrama(dramaStore.dramaId)
}

const getEpisodeStatus = (episode: Episode) => {
  if (episode.shots && episode.shots.length > 0) return 'split'
  if (episode.script_content) return 'created'
  return 'draft'
}

const getEpisodeChipClass = (episode: Episode) => {
  const status = getEpisodeStatus(episode)
  if (status === 'split') return 'glass-chip-success'
  if (status === 'created') return 'glass-chip-warning'
  return 'glass-chip-neutral'
}

const getEpisodeStatusText = (episode: Episode) => {
  const status = getEpisodeStatus(episode)
  if (status === 'split') return t('message.episodeSplit')
  if (status === 'created') return t('message.episodeCreated')
  return t('message.statusDraft')
}

const { searchQuery, filterValue, filteredItems: filteredSorted } = useFilteredList({
  items: sortedEpisodes,
  searchFields: ['title'] as (keyof Episode)[],
})

const filteredItems = computed(() => {
  if (!filterValue.value) return filteredSorted.value
  return filteredSorted.value.filter(ep => getEpisodeStatus(ep) === filterValue.value)
})

const formatDate = (date?: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}
</script>

<style scoped>
.filter-input-wrapper {
  position: relative;
  width: 220px;
}

.filter-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-tertiary);
  pointer-events: none;
  z-index: 1;
}

.filter-input {
  padding-left: 32px;
}

.mr-1 {
  margin-right: 0.25rem;
}
</style>
