<template>
  <div class="script-edit-container">
    <el-page-header @back="goBack" title="返回">
      <template #content>
        <h2>剧本编辑</h2>
      </template>
    </el-page-header>
    <p>功能开发中...</p>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

const goBack = () => {
  router.back()
}
</script>

<style scoped>
.script-edit-container {
  padding: 20px;
}
</style>
