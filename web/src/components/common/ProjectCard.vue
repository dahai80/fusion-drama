<template>
  <!-- Project card component - Compact & refined design -->
  <!-- 项目卡片组件 - 紧凑精致设计 -->
  <article 
    class="project-card"
    @click="$emit('click')"
    tabindex="0"
    @keydown.enter="$emit('click')"
  >
    <!-- Cover image section / 封面图片区域 -->
    <div class="card-cover">
      <img 
        v-if="coverImage" 
        :src="coverImage" 
        :alt="title"
        class="cover-image"
        loading="lazy"
      />
      <div v-else class="cover-placeholder">
        <el-icon :size="20" class="placeholder-icon">
          <Film />
        </el-icon>
      </div>
      <!-- Floating tag / 悬浮标签 -->
      <span v-if="tag" class="floating-tag">{{ tag }}</span>
    </div>

    <!-- Card content / 卡片内容 -->
    <div class="card-body">
      <div class="card-header">
        <h3 class="card-title">{{ title }}</h3>
        <span class="meta-time">{{ formattedDate }}</span>
      </div>
      <p class="card-description">{{ description || '无描述' }}</p>
      
      <!-- Actions / 操作区 -->
      <div class="card-actions" @click.stop>
        <slot name="actions"></slot>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Film } from '@element-plus/icons-vue'

/**
 * ProjectCard - Reusable project/drama card component
 * 项目卡片组件 - 可复用的项目展示卡片
 */
const props = defineProps<{
  title: string
  description?: string
  coverImage?: string
  tag?: string
  updatedAt: string
}>()

defineEmits<{
  click: []
}>()

// Format date to relative time / 格式化日期为相对时间
const formattedDate = computed(() => {
  const date = new Date(props.updatedAt)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
})
</script>

<style scoped>
/* Card Container / 卡片容器 */
.project-card {
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--transition-normal);
  box-shadow: var(--shadow-card);
}

.project-card:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-card-hover), 0 0 0 1px var(--accent);
  transform: translateY(-2px);
}

.project-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Cover Section / 封面区域 */
.card-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: linear-gradient(135deg, var(--accent) 0%, #06b6d4 100%);
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--transition-slow);
}

.project-card:hover .cover-image {
  transform: scale(1.05);
}

.cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.placeholder-icon {
  color: rgba(255, 255, 255, 0.7);
}

/* Floating tag / 悬浮标签 */
.floating-tag {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  padding: 0.2rem 0.5rem;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 0.625rem;
  font-weight: 600;
  border-radius: var(--radius-sm);
  backdrop-filter: blur(8px);
  letter-spacing: 0.02em;
}

/* Body Section / 内容区域 */
.card-body {
  display: flex;
  flex-direction: column;
  padding: var(--space-3);
  gap: var(--space-1);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.card-title {
  margin: 0;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  letter-spacing: -0.01em;
}

.meta-time {
  font-size: 0.625rem;
  color: var(--text-muted);
  white-space: nowrap;
  font-weight: 500;
}

.card-description {
  margin: 0;
  font-size: 0.6875rem;
  color: var(--text-muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Actions / 操作区 */
.card-actions {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  margin-top: var(--space-1);
  padding-top: var(--space-2);
  border-top: 1px solid var(--border-primary);
}

:deep(.action-button) {
  padding: 0.25rem !important;
  min-width: 1.5rem !important;
  height: 1.5rem !important;
}

:deep(.action-button .el-icon) {
  font-size: 0.75rem !important;
}

:deep(.action-button.primary:hover) {
  color: var(--accent);
  background: var(--accent-light);
}

:deep(.action-button.danger:hover) {
  color: var(--error);
  background: var(--error-light);
}
</style>
