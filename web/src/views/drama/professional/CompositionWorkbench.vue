<template>
  <div class="composition-workbench">
    <div class="workbench-header">
      <button class="back-btn" @click="$router.back()">
        <el-icon><ArrowLeft /></el-icon>
        <span>返回编辑器</span>
      </button>
      <span class="workbench-title">合成工作台</span>
    </div>
    <div class="workbench-body">
      <el-empty description="合成功能迁移中..." />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft } from '@element-plus/icons-vue'
</script>

<style scoped>
.composition-workbench {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
}
.workbench-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  height: 48px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}
.back-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
  font-size: 13px;
  transition: all 150ms;
}
.back-btn:hover { background: var(--bg-card-hover); color: var(--text-primary); }
.workbench-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
.workbench-body { flex: 1; display: flex; align-items: center; justify-content: center; }
</style>
