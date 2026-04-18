<template>
  <main class="app-shell">
    <header class="app-header">
      <h1>数愈健康</h1>
    </header>
    <section class="app-main">
      <RouterView />
    </section>
    <nav v-if="showTabBar" class="tab-bar">
      <RouterLink to="/upload" class="tab-item" :class="{ active: route.path === '/upload' }">
        <span class="tab-icon">&#x1F4CB;</span>
        <span class="tab-label">上传</span>
      </RouterLink>
      <RouterLink to="/matches" class="tab-item" :class="{ active: route.path.startsWith('/matches') }">
        <span class="tab-icon">&#x1F50D;</span>
        <span class="tab-label">匹配</span>
      </RouterLink>
      <RouterLink to="/applications" class="tab-item" :class="{ active: route.path === '/applications' }">
        <span class="tab-icon">&#x1F4DD;</span>
        <span class="tab-label">申请</span>
      </RouterLink>
      <RouterLink to="/profile" class="tab-item" :class="{ active: route.path === '/profile' || route.path === '/admin' }">
        <span class="tab-icon">&#x1F464;</span>
        <span class="tab-label">我的</span>
      </RouterLink>
    </nav>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'

const route = useRoute()
const showTabBar = computed(() => route.path !== '/login' && !route.path.startsWith('/cro'))
</script>
