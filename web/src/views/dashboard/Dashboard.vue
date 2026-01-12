<template>
  <div class="dashboard-container">
    <el-container>
      <el-header class="header">
        <div class="header-content">
          <h2>🎬 Drama Generator</h2>
        </div>
      </el-header>
      
      <el-main>
        <div class="welcome-section">
          <h1>欢迎使用 AI 短剧生成平台</h1>
          <p>从剧本到视频，一站式短剧创作工具</p>
        </div>
        
        <el-row :gutter="20" class="stats-row">
          <el-col :span="6">
            <el-card shadow="hover">
              <div class="stat-item">
                <el-icon :size="40" color="#409eff"><Document /></el-icon>
                <h3>0</h3>
                <p>短剧项目</p>
              </div>
            </el-card>
          </el-col>
          
          <el-col :span="6">
            <el-card shadow="hover">
              <div class="stat-item">
                <el-icon :size="40" color="#67c23a"><Picture /></el-icon>
                <h3>0</h3>
                <p>生成图片</p>
              </div>
            </el-card>
          </el-col>
          
          <el-col :span="6">
            <el-card shadow="hover">
              <div class="stat-item">
                <el-icon :size="40" color="#e6a23c"><VideoPlay /></el-icon>
                <h3>0</h3>
                <p>生成视频</p>
              </div>
            </el-card>
          </el-col>
          
          <el-col :span="6">
            <el-card shadow="hover">
              <div class="stat-item">
                <el-icon :size="40" color="#f56c6c"><Clock /></el-icon>
                <h3>0</h3>
                <p>处理中任务</p>
              </div>
            </el-card>
          </el-col>
        </el-row>
        
        <div class="quick-actions">
          <h2>快速开始</h2>
          <el-row :gutter="20">
            <el-col :span="8">
              <el-card shadow="hover" class="action-card" @click="goToDramas">
                <el-icon :size="50" color="#409eff"><Plus /></el-icon>
                <h3>创建新项目</h3>
                <p>开始一个全新的短剧项目</p>
              </el-card>
            </el-col>
            
            <el-col :span="8">
              <el-card shadow="hover" class="action-card" @click="goToDramas">
                <el-icon :size="50" color="#67c23a"><FolderOpened /></el-icon>
                <h3>我的项目</h3>
                <p>查看和管理已有项目</p>
              </el-card>
            </el-col>
            
          </el-row>
        </div>
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { Document, Picture, VideoPlay, Clock, Plus, FolderOpened, Setting } from '@element-plus/icons-vue'

const router = useRouter()

const goToDramas = () => {
  router.push('/dramas')
}

const goToSettings = () => {
  router.push('/settings/ai-config')
}
</script>

<style scoped>
.dashboard-container {
  min-height: 100vh;
  background: #f5f7fa;
}

.header {
  background: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
}

.header-content h2 {
  margin: 0;
  color: #409eff;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 15px;
}

.welcome-section {
  text-align: center;
  padding: 40px 0;
}

.welcome-section h1 {
  font-size: 36px;
  margin-bottom: 10px;
  color: #333;
}

.welcome-section p {
  font-size: 18px;
  color: #666;
}

.stats-row {
  margin-bottom: 40px;
}

.stat-item {
  text-align: center;
  padding: 20px 0;
}

.stat-item h3 {
  font-size: 32px;
  margin: 10px 0;
  color: #333;
}

.stat-item p {
  color: #666;
  margin: 0;
}

.quick-actions h2 {
  margin-bottom: 20px;
  color: #333;
}

.action-card {
  cursor: pointer;
  text-align: center;
  padding: 30px 20px;
  transition: all 0.3s;
}

.action-card:hover {
  transform: translateY(-5px);
}

.action-card h3 {
  margin: 15px 0 10px;
  color: #333;
}

.action-card p {
  color: #666;
  margin: 0;
}
</style>
