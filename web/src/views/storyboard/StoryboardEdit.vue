<template>
  <div class="storyboard-edit-container">
    <el-page-header @back="goBack" :title="$t('common.back')">
      <template #content>
        <h2>{{ $t('storyboard.edit') }}</h2>
      </template>
    </el-page-header>
    <p>{{ $t('storyboard.inDevelopment') }}</p>
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
.storyboard-edit-container {
  padding: 20px;
}
</style>
