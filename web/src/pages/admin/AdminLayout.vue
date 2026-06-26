<template>
  <section class="admin-layout">
    <aside class="admin-sidebar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 28 28" width="28" height="28" fill="none">
            <rect x="1.5" y="1.5" width="25" height="25" rx="7" fill="var(--brand)" />
            <path d="M9 14.5l3 3 7-7" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <div class="brand-text">
          <strong>数愈管理端</strong>
          <span>运营数据 · 上传审阅</span>
        </div>
      </div>
      <nav class="admin-nav" aria-label="管理员后台导航">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="admin-nav-item"
          :class="{ active: route.path === item.to }"
        >
          <span class="nav-icon" aria-hidden="true" v-html="item.icon"></span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>

    <div class="admin-content">
      <header class="admin-topbar">
        <div>
          <p class="eyebrow">Admin Console</p>
          <h2>{{ currentTitle }}</h2>
        </div>
        <div class="top-actions">
          <span class="admin-name">{{ adminName }}</span>
          <button class="back-link" type="button" @click="logout">退出管理端</button>
        </div>
      </header>
      <RouterView />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const navItems = [
  {
    to: '/admin/dashboard',
    label: 'Dashboard',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>'
  },
  {
    to: '/admin/users',
    label: '注册用户',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
  },
  {
    to: '/admin/cases',
    label: '患者/病例',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M12 11v6"/><path d="M9 14h6"/></svg>'
  },
  {
    to: '/admin/records',
    label: '上传数据',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></svg>'
  },
  {
    to: '/admin/operations',
    label: '运营工具',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>'
  }
]

const currentTitle = computed(() => {
  return navItems.find((item) => item.to === route.path)?.label || '管理员后台'
})

const adminName = computed(() => {
  try {
    const parsed = JSON.parse(localStorage.getItem('adminUser') || '{}')
    return parsed.username || 'admin'
  } catch {
    return 'admin'
  }
})

const logout = () => {
  localStorage.removeItem('adminToken')
  localStorage.removeItem('adminUser')
  router.replace('/admin/login')
}
</script>

<style scoped>
.admin-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  min-height: 100vh;
  background: var(--bg-soft);
  font-family: var(--font-sans);
}

.admin-sidebar {
  border-right: 1px solid var(--line);
  background: var(--bg);
  padding: var(--s-6) var(--s-3);
  display: flex;
  flex-direction: column;
  gap: var(--s-6);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: 0 var(--s-2);
}

.brand-mark {
  display: inline-flex;
  flex-shrink: 0;
}

.brand-text {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.brand-text strong {
  font-size: var(--fs-subtitle);
  color: var(--text);
  line-height: var(--lh-tight);
}

.brand-text span {
  color: var(--text-muted);
  font-size: var(--fs-caption);
  line-height: var(--lh-tight);
}

.admin-nav {
  display: grid;
  gap: var(--s-1);
}

.admin-nav-item {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  border-radius: var(--r-md);
  color: var(--text-dim);
  padding: 10px var(--s-3);
  font-size: var(--fs-callout);
  font-weight: 500;
  transition: background 150ms ease, color 150ms ease;
}

.admin-nav-item:hover {
  background: var(--brand-soft);
  color: var(--brand-hover);
}

.admin-nav-item.active {
  background: var(--brand);
  color: #fff;
  box-shadow: var(--shadow-1);
}

.nav-icon {
  display: inline-flex;
  width: 18px;
  height: 18px;
}

.admin-content {
  min-width: 0;
  padding: var(--s-6);
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.admin-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--s-4) var(--s-6);
  box-shadow: var(--shadow-1);
}

.admin-topbar h2,
.admin-topbar p {
  margin: 0;
}

.admin-topbar h2 {
  color: var(--text);
  font-size: var(--fs-title);
  line-height: var(--lh-tight);
}

.eyebrow {
  color: var(--brand);
  font-size: var(--fs-caption);
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
  margin-bottom: 4px;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  color: var(--text-dim);
  font-size: var(--fs-callout);
}

.admin-name {
  background: var(--brand-soft);
  color: var(--brand-hover);
  padding: 4px var(--s-3);
  border-radius: var(--r-pill);
  font-weight: 600;
  font-size: var(--fs-caption);
}

.back-link {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  color: var(--text-dim);
  padding: var(--s-2) var(--s-3);
  font-size: var(--fs-callout);
  background: var(--bg);
  cursor: pointer;
  transition: border-color 150ms ease, color 150ms ease;
}

.back-link:hover {
  border-color: var(--brand);
  color: var(--brand);
}

@media (max-width: 760px) {
  .admin-layout {
    grid-template-columns: 1fr;
  }

  .admin-sidebar {
    border-right: none;
    border-bottom: 1px solid var(--line);
    padding: var(--s-4);
    flex-direction: column;
  }

  .admin-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-2);
  }

  .admin-content {
    padding: var(--s-4);
  }

  .admin-topbar {
    padding: var(--s-3) var(--s-4);
  }
}
</style>
