<template>
  <div>
    <div class="stats-grid">
      <StatCard
        :label="$t('drama.management.episodeStats')"
        :value="episodesCount"
        :icon="FileText"
        icon-color="var(--accent)"
        icon-bg="var(--accent-light)"
        value-color="var(--accent)"
        :description="$t('drama.management.episodesCreated')"
      />
      <StatCard
        :label="$t('drama.management.characterStats')"
        :value="charactersCount"
        :icon="User"
        icon-color="var(--success)"
        icon-bg="var(--success-light)"
        value-color="var(--success)"
        :description="$t('drama.management.charactersCreated')"
      />
      <StatCard
        :label="$t('drama.management.sceneStats')"
        :value="scenesCount"
        :icon="ImageIcon"
        icon-color="var(--warning)"
        icon-bg="var(--warning-light)"
        value-color="var(--warning)"
        :description="$t('drama.management.sceneLibraryCount')"
      />
      <StatCard
        :label="$t('drama.management.propStats')"
        :value="propsCount"
        :icon="Package"
        icon-color="var(--primary)"
        icon-bg="var(--primary-light)"
        value-color="var(--primary)"
        :description="$t('drama.management.propsCreated')"
      />
    </div>

    <!-- 引导卡片：无章节时显示 -->
    <EmptyState
      v-if="episodesCount === 0"
      :title="$t('drama.management.startFirstEpisode')"
      :description="$t('drama.management.noEpisodesYet')"
      :icon="FileText"
      style="margin-top: 20px"
    >
      <Button @click="createEpisode">
        <Plus :size="16" class="mr-1" />
        {{ $t("drama.management.createFirstEpisode") }}
      </Button>
    </EmptyState>

    <div class="project-info-card glass-surface">
      <div class="card-header">
        <h3 class="card-title">
          {{ $t("drama.management.projectInfo") }}
        </h3>
        <Badge :variant="getStatusVariant(drama?.status)">{{
          getStatusText(drama?.status)
        }}</Badge>
      </div>
      <div class="project-info-grid">
        <div class="info-row">
          <span class="info-label">{{ $t('drama.management.projectName') }}</span>
          <span class="info-value">{{ drama?.title }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">{{ $t('common.createdAt') }}</span>
          <span class="info-value">{{ formatDate(drama?.created_at) }}</span>
        </div>
        <div class="info-row full-width">
          <span class="info-label">{{ $t('drama.management.projectDesc') }}</span>
          <span class="info-desc">{{ drama?.description || $t("drama.management.noDescription") }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { FileText, User, Image as ImageIcon, Plus, Package } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatCard, EmptyState } from '@/components/common'
import { useDramaStore } from '@/stores/drama'

const { t } = useI18n()
const router = useRouter()
const dramaStore = useDramaStore()

const drama = computed(() => dramaStore.currentDrama)
const episodesCount = computed(() => dramaStore.episodes.length)
const charactersCount = computed(() => dramaStore.characters.length)
const scenesCount = computed(() => dramaStore.scenes.length)
const propsCount = computed(() => dramaStore.props.length)

const createEpisode = () => {
  const nextEpisodeNumber = episodesCount.value + 1
  router.push({
    name: 'EpisodeWorkbench',
    params: {
      id: dramaStore.dramaId,
      episodeNumber: nextEpisodeNumber,
    },
  })
}

const getStatusVariant = (status?: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
  const map: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    draft: 'secondary',
    in_progress: 'default',
    completed: 'outline',
  }
  return map[status || 'draft'] || 'secondary'
}

const getStatusText = (status?: string) => {
  const map: Record<string, string> = {
    draft: t('message.statusDraft'),
    in_progress: t('message.statusInProgress'),
    completed: t('message.statusCompleted'),
  }
  return map[status || 'draft'] || t('message.statusDraft')
}

const formatDate = (date?: string) => {
  if (!date) return '-'
  return new Date(date).toLocaleString('zh-CN')
}
</script>

<style scoped>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(1, 1fr);
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}

@media (min-width: 640px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
  }
}

@media (min-width: 1024px) {
  .stats-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

.project-info-card {
  margin-top: var(--space-5);
  padding: var(--space-5);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-4);
}

.card-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.project-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.info-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-row.full-width {
  grid-column: 1 / -1;
}

.info-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.info-value {
  font-weight: 500;
  color: var(--text-primary);
}

.info-desc {
  color: var(--text-secondary);
  line-height: 1.6;
}

.mr-1 {
  margin-right: 0.25rem;
}
</style>
