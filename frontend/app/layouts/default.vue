<template>
  <div class="studio">
    <aside class="sidebar">
      <div class="sidebar-brand">
        <span class="brand-icon">▶</span>
        <span class="brand-text">HuoBao</span>
      </div>
      <nav class="sidebar-nav">
        <NuxtLink to="/" class="nav-link" :class="{ active: route.path === '/' }">
          <LayoutGrid :size="15" /> 项目
        </NuxtLink>
        <NuxtLink to="/settings" class="nav-link" :class="{ active: route.path === '/settings' }">
          <Settings :size="15" /> 设置
        </NuxtLink>
      </nav>
    </aside>
    <main class="main">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { LayoutGrid, Settings } from 'lucide-vue-next'
const route = useRoute()
</script>

<style scoped>
.studio { display: flex; height: 100vh; overflow: hidden; }

.sidebar {
  width: 52px; flex-shrink: 0;
  display: flex; flex-direction: column;
  background: var(--bg-panel); border-right: 1px solid var(--border);
}

.sidebar-brand {
  display: flex; align-items: center; justify-content: center;
  height: 40px; border-bottom: 1px solid var(--border);
}
.brand-icon { font-size: 14px; color: var(--accent); }
.brand-text { display: none; }

.sidebar-nav { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 6px; }

.nav-link {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 36px; border-radius: var(--radius);
  color: var(--text-muted); text-decoration: none; transition: all 0.1s;
}
.nav-link:hover { background: var(--bg-hover); color: var(--text-secondary); }
.nav-link.active { background: var(--bg-active); color: var(--accent); }

.main { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
</style>
