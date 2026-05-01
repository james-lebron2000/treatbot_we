<template>
  <main class="app-shell" :class="{ 'app-shell-admin': isAdminRoute }">
    <header v-if="!isAdminRoute" class="app-header">
      <h1>数愈健康</h1>
      <p class="app-tagline">您的病历，您做主 · 温和陪伴每一步</p>
    </header>
    <section class="app-main" :class="{ 'app-main-admin': isAdminRoute }">
      <RouterView />
    </section>
    <nav v-if="showTabBar" class="tab-bar">
      <RouterLink to="/upload" class="tab-item" :class="{ active: route.path === '/upload' }">
        <span class="tab-icon">&#x1F4CB;</span>
        <span class="tab-label">上传</span>
      </RouterLink>
      <!-- PRD-2026Q2 §3.5：多病历管理入口 -->
      <RouterLink to="/records" class="tab-item" :class="{ active: route.path === '/records' }">
        <span class="tab-icon">&#x1F5C2;</span>
        <span class="tab-label">病历</span>
      </RouterLink>
      <RouterLink to="/matches" class="tab-item" :class="{ active: route.path.startsWith('/matches') }">
        <span class="tab-icon">&#x1F50D;</span>
        <span class="tab-label">匹配</span>
      </RouterLink>
      <RouterLink to="/applications" class="tab-item" :class="{ active: route.path === '/applications' }">
        <span class="tab-icon">&#x1F4DD;</span>
        <span class="tab-label">申请</span>
      </RouterLink>
      <RouterLink to="/profile" class="tab-item" :class="{ active: route.path === '/profile' || route.path.startsWith('/admin') }">
        <span class="tab-icon">&#x1F464;</span>
        <span class="tab-label">我的</span>
      </RouterLink>
    </nav>
    <!-- PRD-2026Q3 §U5：全局求助 FAB —— 登录页 / CRO 后台不展示 -->
    <HelpFab v-if="showHelpFab" />
  </main>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
// Q3-红线 §B.2：漏斗埋点 SDK
import { track } from './utils/track'
// PRD-2026Q3 §U5：全局求助按钮，文案来自 shared/copy/help.json。
const HelpFab = defineAsyncComponent(() => import('./components/HelpFab.vue'))

const route = useRoute()
const isAdminRoute = computed(() => route.path.startsWith('/admin'))
const showTabBar = computed(() => route.path !== '/login' && !route.path.startsWith('/cro') && !isAdminRoute.value)
const showHelpFab = computed(
  () => route.path !== '/login' && !route.path.startsWith('/cro') && !isAdminRoute.value && route.path !== '/onboarding'
)

onMounted(() => {
  // Q3-红线 §B.2：landing_view —— 应用首屏触发一次；后续 SPA 路由切换不重复发。
  track('landing_view')
})
</script>
