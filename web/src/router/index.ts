import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// 路由懒加载 — 登录页以外的所有页面都按需切片，首屏只装 Login + Vue 运行时。
// 对应 PRD-2026Q2 §2.7。
const LoginView = () => import('../pages/LoginView.vue')
const UploadView = () => import('../pages/UploadView.vue')
const MatchesView = () => import('../pages/MatchesView.vue')
const MatchDetailView = () => import('../pages/MatchDetailView.vue')
const ProfileView = () => import('../pages/ProfileView.vue')
const ApplicationsView = () => import('../pages/ApplicationsView.vue')
const AdminLayout = () => import('../pages/admin/AdminLayout.vue')
const AdminDashboardView = () => import('../pages/admin/DashboardView.vue')
const AdminUsersView = () => import('../pages/admin/UsersView.vue')
const AdminRecordsView = () => import('../pages/admin/RecordsView.vue')
const AdminOperationsView = () => import('../pages/admin/OperationsView.vue')
const CroBoardView = () => import('../pages/CroBoardView.vue')
const CroLoginView = () => import('../pages/CroLoginView.vue')
const DemoView = () => import('../pages/DemoView.vue')
// PRD-2026Q2 §3.5：多病历管理页，懒加载保证首屏不受影响。
const RecordsView = () => import('../pages/RecordsView.vue')
// PRD-2026Q3 §U5：首屏期望管理 onboarding（30 秒了解我们）。
const OnboardingView = () => import('../pages/OnboardingView.vue')
// PRD-2026Q3 §A.2：隐私政策公开页（无需登录），同时承担合规版本号展示与「了解我们如何处理您的数据」入口。
const PrivacyView = () => import('../pages/PrivacyView.vue')

const router = createRouter({
  history: createWebHistory('/treatbot/'),
  routes: [
    { path: '/login', component: LoginView },
    { path: '/demo', component: DemoView },
    { path: '/privacy', component: PrivacyView },
    { path: '/', redirect: '/upload' },
    { path: '/onboarding', component: OnboardingView, meta: { requiresAuth: true } },
    { path: '/upload', component: UploadView, meta: { requiresAuth: true } },
    { path: '/records', component: RecordsView, meta: { requiresAuth: true } },
    { path: '/matches', component: MatchesView, meta: { requiresAuth: true } },
    { path: '/matches/:id', component: MatchDetailView, meta: { requiresAuth: true } },
    { path: '/profile', component: ProfileView, meta: { requiresAuth: true } },
    { path: '/applications', component: ApplicationsView, meta: { requiresAuth: true } },
    {
      path: '/admin',
      component: AdminLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/admin/dashboard' },
        { path: 'dashboard', component: AdminDashboardView },
        { path: 'users', component: AdminUsersView },
        { path: 'records', component: AdminRecordsView },
        { path: 'operations', component: AdminOperationsView }
      ]
    },
    { path: '/cro', component: CroBoardView },
    { path: '/cro/login', component: CroLoginView }
  ]
})

// PRD-2026Q3 §U5：首次登录后第一次进 /upload 之前先看 onboarding。
// 跳过状态写入 localStorage('onboardingSeenAt')，回访不再打扰。
const hasSeenOnboarding = () => {
  try {
    return Boolean(localStorage.getItem('onboardingSeenAt'))
  } catch {
    return true // 私密模式无法读 storage 时不阻塞用户
  }
}

router.beforeEach((to) => {
  const authStore = useAuthStore()
  if (to.meta.requiresAuth && !authStore.token) {
    return '/login'
  }
  if (to.path === '/login' && authStore.token) {
    return '/upload'
  }
  if (to.path === '/upload' && authStore.token && !hasSeenOnboarding()) {
    return '/onboarding'
  }
  return true
})

export default router
