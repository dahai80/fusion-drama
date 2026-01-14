<template>
  <!-- Theme toggle button for switching between light/dark mode -->
  <!-- 主题切换按钮，用于切换浅色/深色模式 -->
  <button
    class="theme-toggle"
    :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
    @click="toggleTheme"
  >
    <transition name="icon-fade" mode="out-in">
      <el-icon v-if="isDark" key="moon" :size="18">
        <Moon />
      </el-icon>
      <el-icon v-else key="sun" :size="18">
        <Sunny />
      </el-icon>
    </transition>
  </button>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Moon, Sunny } from '@element-plus/icons-vue'

/**
 * ThemeToggle - Dark/Light mode toggle button
 * 主题切换按钮 - 深色/浅色模式切换
 */
const isDark = ref(false)

// Initialize theme from localStorage or system preference
// 从 localStorage 或系统偏好初始化主题
onMounted(() => {
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme) {
    isDark.value = savedTheme === 'dark'
  } else {
    isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  applyTheme()
})

// Toggle between dark and light mode / 切换深色和浅色模式
const toggleTheme = () => {
  isDark.value = !isDark.value
  applyTheme()
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

// Apply theme to document / 应用主题到文档
const applyTheme = () => {
  if (isDark.value) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}
</script>

<style scoped>
.theme-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 1px solid var(--border-primary);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.theme-toggle:hover {
  background: var(--bg-card-hover);
  color: var(--text-primary);
  border-color: var(--border-secondary);
}

.theme-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

/* Icon transition / 图标过渡动画 */
.icon-fade-enter-active,
.icon-fade-leave-active {
  transition: all 0.2s ease;
}

.icon-fade-enter-from {
  opacity: 0;
  transform: rotate(-90deg) scale(0.8);
}

.icon-fade-leave-to {
  opacity: 0;
  transform: rotate(90deg) scale(0.8);
}
</style>
