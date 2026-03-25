<template>
  <div class="settings-tab">
    <div class="settings-placeholder">
      <p class="text-muted-foreground">{{ t('sidebar.settings') }}</p>
      <p class="text-sm text-muted-foreground">{{ t('common.comingSoon') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<style scoped>
.settings-tab {
  padding: 24px;
}

.settings-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  gap: 8px;
}
</style>
