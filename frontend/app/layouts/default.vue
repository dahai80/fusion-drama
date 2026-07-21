<template>
  <div class="shell">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <button class="brand" @click="navigateTo('/')">
          <div class="brand-mark">
            <img v-if="showBrandImage" :src="brandLogo" alt="火宝短剧" class="brand-logo" @error="showBrandImage = false" />
            <span v-else class="brand-fallback">火</span>
          </div>
          <div class="brand-text">
            <span class="brand-name">火宝短剧</span>
            <span class="brand-sub">Huobao Shorts</span>
          </div>
        </button>
      </div>

      <nav class="header-nav">
        <NuxtLink to="/" class="nav-link" :class="{ active: route.path === '/' }">
          <LayoutGrid :size="15" :stroke-width="1.8" />
          <span>项目</span>
        </NuxtLink>
        <NuxtLink to="/settings" class="nav-link" :class="{ active: route.path === '/settings' }">
          <Settings :size="15" :stroke-width="1.8" />
          <span>设置</span>
        </NuxtLink>
      </nav>
    </header>

    <main class="content">
      <slot />
    </main>
  </div>
</template>

<script setup>
import { LayoutGrid, Settings } from 'lucide-vue-next'
import brandLogo from '~/assets/huobao-logo.png'

const route = useRoute()
const showBrandImage = ref(true)
</script>

<style scoped>
.shell {
  display: flex; flex-direction: column;
  height: 100vh; overflow: hidden;
  background: var(--bg-base);
}

/* === Header === */
.header {
  display: flex; align-items: center;
  height: 56px; flex-shrink: 0;
  padding: 0 24px;
  background: var(--surface-raised);
  border-bottom: 1px solid var(--surface-outline);
  gap: 32px;
  box-shadow: none;
}

.header-left { display: flex; align-items: center; }

.brand {
  display: flex; align-items: center; gap: 10px;
  background: transparent; border: 1px solid transparent; cursor: pointer; padding: 3px 5px 3px 3px;
  text-decoration: none; border-radius: var(--radius);
  transition: background 0.18s var(--ease-out), border-color 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out);
}
.brand:hover {
  background: var(--bg-hover);
  border-color: var(--button-border);
}
.brand:focus-visible {
  outline: none;
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px var(--button-focus);
}
.brand-mark {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-2); border-radius: var(--radius);
  border: 1px solid var(--border);
  overflow: hidden;
}
.brand-logo {
  width: 22px;
  height: 22px;
  object-fit: contain;
  display: block;
}
.brand-fallback {
  font-size: 16px;
  font-weight: 700;
  color: var(--accent-text);
  line-height: 1;
}
.brand-text { display: flex; flex-direction: column; align-items: flex-start; line-height: 1; }
.brand-name {
  font-size: 15px; font-weight: 700;
  color: var(--text-0);
  letter-spacing: -0.01em;
}
.brand-sub {
  font-size: 10px; font-weight: 400;
  color: var(--text-3); margin-top: 1px;
  letter-spacing: 0.04em;
}

/* Nav */
.header-nav { display: flex; gap: 4px; flex: 1; }
.nav-link {
  display: flex; align-items: center; gap: 7px;
  min-height: var(--button-height);
  padding: 0 14px; border-radius: var(--button-radius);
  font-size: 13px; font-weight: 650;
  color: var(--text-2); text-decoration: none;
  transition: all 0.18s var(--ease-out);
  border: 1px solid transparent;
  line-height: 1;
}
.nav-link:hover {
  background: var(--bg-hover); color: var(--text-0);
  border-color: var(--button-border);
  box-shadow: none;
}
.nav-link.active {
  background: var(--accent-bg);
  color: var(--accent-text);
  border-color: var(--accent-glow);
  font-weight: 600;
  box-shadow: none;
}
.nav-link:focus-visible {
  outline: none;
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px var(--button-focus), var(--button-shadow);
}

/* Content */
.content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
</style>
