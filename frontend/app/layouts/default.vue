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
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
          <span>项目</span>
        </NuxtLink>
        <NuxtLink to="/settings" class="nav-link" :class="{ active: route.path === '/settings' }">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span>设置</span>
        </NuxtLink>
      </nav>

      <div class="header-right">
        <div class="film-strip">
          <span class="film-frame"></span>
          <span class="film-frame"></span>
          <span class="film-frame"></span>
        </div>
      </div>
    </header>

    <main class="content">
      <slot />
    </main>
  </div>
</template>

<script setup>
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
  box-shadow: 0 1px 0 rgba(255,255,255,0.03), 0 10px 24px rgba(0,0,0,0.18);
}

.header-left { display: flex; align-items: center; }

.brand {
  display: flex; align-items: center; gap: 10px;
  background: transparent; border: 1px solid transparent; cursor: pointer; padding: 3px 5px 3px 3px;
  text-decoration: none; border-radius: var(--radius);
  transition: background 0.18s var(--ease-out), border-color 0.18s var(--ease-out), box-shadow 0.18s var(--ease-out);
}
.brand:hover {
  background: rgba(242,238,230,0.04);
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
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 700;
  color: var(--accent-text);
  line-height: 1;
}
.brand-text { display: flex; flex-direction: column; align-items: flex-start; line-height: 1; }
.brand-name {
  font-family: var(--font-display);
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
  background: var(--button-bg); color: var(--text-0);
  border-color: var(--button-border);
  box-shadow: var(--button-shadow);
}
.nav-link.active {
  background: linear-gradient(180deg, var(--accent-bg), rgba(217,111,39,0.08));
  color: var(--accent-text);
  border-color: var(--accent-glow);
  font-weight: 600;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.05);
}
.nav-link:focus-visible {
  outline: none;
  border-color: var(--action-primary);
  box-shadow: 0 0 0 3px var(--button-focus), var(--button-shadow);
}

.header-right { display: flex; align-items: center; margin-left: auto; }

/* Film strip decoration */
.film-strip {
  display: flex; align-items: center; gap: 3px;
  padding: 6px 10px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.film-frame {
  width: 8px; height: 10px;
  background: var(--bg-3);
  border-radius: 1.5px;
  transition: background 0.2s;
}
.film-frame:nth-child(2) { background: var(--accent); opacity: 0.6; }
.film-frame:nth-child(3) { opacity: 0.3; }

/* Content */
.content { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
</style>
