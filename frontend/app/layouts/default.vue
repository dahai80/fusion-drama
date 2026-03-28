<template>
  <div class="shell">
    <nav class="nav-bar">
      <div class="nav-brand" @click="navigateTo('/')">
        <span class="brand-mark">▶</span>
        <span class="brand-name">HuoBao Drama</span>
      </div>
      <div class="nav-links">
        <NuxtLink to="/" class="nav-link" :class="{ active: route.path === '/' }">
          <LayoutGrid :size="16" />
          <span>项目</span>
        </NuxtLink>
        <NuxtLink to="/settings" class="nav-link" :class="{ active: route.path === '/settings' }">
          <Settings :size="16" />
          <span>设置</span>
        </NuxtLink>
      </div>
    </nav>
    <main class="content">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { LayoutGrid, Settings } from 'lucide-vue-next'
const route = useRoute()
</script>

<style scoped>
.shell { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

.nav-bar {
  display: flex; align-items: center; gap: 24px;
  padding: 0 20px; height: 48px; flex-shrink: 0;
  background: var(--bg-1); border-bottom: 1px solid var(--border);
}

.nav-brand { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.brand-mark { font-size: 16px; color: var(--accent); }
.brand-name { font-size: 14px; font-weight: 700; color: var(--text-0); }

.nav-links { display: flex; gap: 2px; }

.nav-link {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: var(--radius);
  font-size: 13px; color: var(--text-2); text-decoration: none;
  transition: all 0.15s;
}
.nav-link:hover { background: var(--bg-hover); color: var(--text-0); }
.nav-link.active { background: var(--accent-bg); color: var(--accent-text); font-weight: 500; }

.content { flex: 1; overflow: hidden; }
</style>
