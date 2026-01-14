<template>
  <el-dropdown @command="handleCommand">
    <span class="language-switcher">
      <el-icon><Switch /></el-icon>
      <span class="lang-text">{{ currentLangText }}</span>
    </span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="zh-CN" :disabled="currentLang === 'zh-CN'">
          🇨🇳 简体中文
        </el-dropdown-item>
        <el-dropdown-item command="en-US" :disabled="currentLang === 'en-US'">
          🇺🇸 English
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { setLanguage } from '@/locales'
import { ElMessage } from 'element-plus'

const { locale } = useI18n()

const currentLang = ref(locale.value)

const currentLangText = computed(() => {
  return currentLang.value === 'zh-CN' ? '中文' : 'English'
})

const handleCommand = (lang: string) => {
  setLanguage(lang)
  currentLang.value = lang
  ElMessage.success(
    lang === 'zh-CN' 
      ? '语言已切换为中文' 
      : 'Language switched to English'
  )
}
</script>

<style scoped>
.language-switcher {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 6px;
  transition: all 0.2s;
}

.language-switcher:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.lang-text {
  font-size: 14px;
  color: #606266;
}
</style>
