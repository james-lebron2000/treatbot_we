<template>
  <section class="admin-layout">
    <aside class="admin-sidebar">
      <div class="brand">
        <strong>数愈管理端</strong>
        <span>运营数据与上传审阅</span>
      </div>
      <nav class="admin-nav" aria-label="管理员后台导航">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="admin-nav-item"
          :class="{ active: route.path === item.to }"
        >
          <span class="nav-icon">{{ item.icon }}</span>
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
          <span>{{ adminName }}</span>
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
  { to: '/admin/dashboard', label: 'Dashboard', icon: '□' },
  { to: '/admin/users', label: '注册用户', icon: '○' },
  { to: '/admin/records', label: '上传数据', icon: '◇' },
  { to: '/admin/operations', label: '运营工具', icon: '△' }
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
  grid-template-columns: 220px minmax(0, 1fr);
  min-height: calc(100vh - 32px);
  background: #f5f7fb;
}

.admin-sidebar {
  border-right: 1px solid #dde3ed;
  background: #111827;
  color: #f9fafb;
  padding: 20px 14px;
}

.brand {
  display: grid;
  gap: 4px;
  padding: 0 8px 20px;
}

.brand strong {
  font-size: 18px;
}

.brand span {
  color: #a7b0c0;
  font-size: 12px;
}

.admin-nav {
  display: grid;
  gap: 6px;
}

.admin-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 8px;
  color: #d1d5db;
  padding: 10px 12px;
  font-size: 14px;
}

.admin-nav-item.active,
.admin-nav-item:hover {
  background: #2563eb;
  color: #fff;
}

.nav-icon {
  width: 18px;
  text-align: center;
}

.admin-content {
  min-width: 0;
  padding: 20px;
}

.admin-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.admin-topbar h2,
.admin-topbar p {
  margin: 0;
}

.eyebrow {
  color: #6b7280;
  font-size: 12px;
  text-transform: uppercase;
}

.top-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  color: #6b7280;
  font-size: 13px;
}

.back-link {
  border: 1px solid #cfd7e6;
  border-radius: 8px;
  color: #374151;
  padding: 8px 12px;
  font-size: 13px;
  background: #fff;
  cursor: pointer;
}

@media (max-width: 760px) {
  .admin-layout {
    grid-template-columns: 1fr;
  }

  .admin-sidebar {
    border-right: none;
    padding: 12px;
  }

  .brand {
    padding-bottom: 12px;
  }

  .admin-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .admin-content {
    padding: 12px;
  }
}
</style>
