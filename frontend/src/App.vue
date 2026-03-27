<template>
  <div class="app">
    <nav class="sidebar" :class="{ collapsed }">
      <div class="sidebar-brand" @click="$router.push('/')">
        <Film :size="20" />
        <span v-if="!collapsed">HuoBao</span>
      </div>
      <div class="sidebar-nav">
        <router-link to="/" class="nav-item">
          <LayoutGrid :size="18" />
          <span v-if="!collapsed">项目</span>
        </router-link>
        <router-link to="/settings" class="nav-item">
          <Settings :size="18" />
          <span v-if="!collapsed">设置</span>
        </router-link>
      </div>
      <button class="sidebar-toggle" @click="collapsed = !collapsed">
        <PanelLeftClose v-if="!collapsed" :size="16" />
        <PanelLeftOpen v-else :size="16" />
      </button>
    </nav>
    <main class="main">
      <router-view />
    </main>
    <Toaster position="top-right" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Film, LayoutGrid, Settings, PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next'
import { Toaster } from 'vue-sonner'

const collapsed = ref(false)
</script>

<style scoped>
.app { display: flex; height: 100vh; overflow: hidden; }

.sidebar {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  transition: width 0.2s;
}
.sidebar.collapsed { width: 56px; }

.sidebar-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  font-size: 16px;
  font-weight: 700;
  color: var(--accent);
  cursor: pointer;
}

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 13px;
  transition: all 0.15s;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text); }
.nav-item.router-link-exact-active { background: rgba(232,162,67,0.1); color: var(--accent); }

.sidebar-toggle {
  padding: 12px;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  justify-content: center;
}

.main {
  flex: 1;
  overflow-y: auto;
  background: var(--bg);
}
</style>
