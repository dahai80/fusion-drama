<template>
  <div v-loading="loading" class="config-list">
    <el-empty v-if="!loading && configs.length === 0" description="暂无配置，点击添加配置开始使用" />

    <el-card 
      v-for="config in configs" 
      :key="config.id" 
      class="config-card"
      shadow="hover"
    >
      <div class="config-header">
        <div class="config-title">
          <h3>{{ config.name }}</h3>
          <el-tag v-if="config.is_active" type="success" size="small">已启用</el-tag>
          <el-tag v-else type="info" size="small">已禁用</el-tag>
        </div>
        <div class="config-actions">
          <el-button text @click="$emit('test', config)" :icon="Connection">
            测试
          </el-button>
          <el-button text @click="$emit('edit', config)" :icon="Edit">
            编辑
          </el-button>
          <el-button 
            text 
            :type="config.is_active ? 'warning' : 'success'"
            @click="$emit('toggle-active', config)"
          >
            {{ config.is_active ? '禁用' : '启用' }}
          </el-button>
          <el-popconfirm
            title="确定删除该配置吗？"
            @confirm="$emit('delete', config)"
          >
            <template #reference>
              <el-button text type="danger" :icon="Delete">
                删除
              </el-button>
            </template>
          </el-popconfirm>
        </div>
      </div>

      <div class="config-info">
        <div class="info-item">
          <label>Base URL：</label>
          <span class="url-text">{{ config.base_url }}</span>
        </div>

        <div class="info-item">
          <label>端点：</label>
          <span>{{ config.endpoint || '/v1/chat/completions' }}</span>
        </div>

        <div v-if="config.service_type === 'video' && config.query_endpoint" class="info-item">
          <label>查询端点：</label>
          <span>{{ config.query_endpoint }}</span>
        </div>

        <div class="info-item">
          <label>优先级：</label>
          <el-tag size="small" :type="(config.priority || 0) >= 50 ? 'danger' : (config.priority || 0) >= 20 ? 'warning' : 'info'">
            {{ config.priority || 0 }}
          </el-tag>
        </div>

        <div class="info-item">
          <label>模型：</label>
          <template v-if="Array.isArray(config.model)">
            <el-tag 
              v-for="(model, index) in config.model" 
              :key="index" 
              size="small" 
              effect="plain"
              style="margin-right: 4px"
            >
              {{ model }}
            </el-tag>
          </template>
          <el-tag v-else size="small" effect="plain">{{ config.model }}</el-tag>
        </div>

        <div class="info-item">
          <label>API Key：</label>
          <span class="api-key">{{ maskApiKey(config.api_key) }}</span>
        </div>

        <div class="info-item">
          <label>创建时间：</label>
          <span class="time-text">{{ formatDate(config.created_at) }}</span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { Connection, Edit, Delete } from '@element-plus/icons-vue'
import type { AIServiceConfig } from '@/types/ai'

defineProps<{
  configs: AIServiceConfig[]
  loading: boolean
}>()

defineEmits<{
  edit: [config: AIServiceConfig]
  delete: [config: AIServiceConfig]
  toggleActive: [config: AIServiceConfig]
  test: [config: AIServiceConfig]
}>()

const maskApiKey = (key: string) => {
  if (!key) return ''
  if (key.length <= 8) return '***'
  return key.substring(0, 4) + '***' + key.substring(key.length - 4)
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('zh-CN')
}
</script>

<style scoped>
.config-list {
  display: grid;
  gap: 16px;
  min-height: 300px;
}

.config-card {
  transition: all 0.3s;
}

.config-card:hover {
  transform: translateY(-2px);
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.config-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.config-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
}

.config-actions {
  display: flex;
  gap: 8px;
}

.config-info {
  display: grid;
  gap: 12px;
}

.info-item {
  display: flex;
  align-items: center;
  font-size: 14px;
}

.info-item label {
  min-width: 90px;
  color: #666;
  font-weight: 500;
}

.url-text {
  color: #409eff;
  word-break: break-all;
}

.api-key {
  font-family: monospace;
  color: #999;
}

.time-text {
  color: #999;
  font-size: 13px;
}
</style>
