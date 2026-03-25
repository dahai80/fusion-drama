<template>
  <div class="episode-workbench">
    <h1>Episode Workbench (placeholder)</h1>
    <p>Drama: {{ $route.params.id }}, Episode: {{ $route.params.episodeNumber }}</p>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.episode-workbench {
  height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-primary);
  background: var(--bg-primary);
}
</style>
