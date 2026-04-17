import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../pages/LoginView.vue'
import UploadView from '../pages/UploadView.vue'
import MatchesView from '../pages/MatchesView.vue'
import MatchDetailView from '../pages/MatchDetailView.vue'
import ProfileView from '../pages/ProfileView.vue'
import ApplicationsView from '../pages/ApplicationsView.vue'
import AdminView from '../pages/AdminView.vue'
import CroBoardView from '../pages/CroBoardView.vue'
import CroLoginView from '../pages/CroLoginView.vue'
import DemoView from '../pages/DemoView.vue'
import { useAuthStore } from '../stores/auth'

const router = createRouter({
  history: createWebHistory('/treatbot/'),
  routes: [
    { path: '/login', component: LoginView },
    { path: '/demo', component: DemoView },
    { path: '/', redirect: '/upload' },
    { path: '/upload', component: UploadView, meta: { requiresAuth: true } },
    { path: '/matches', component: MatchesView, meta: { requiresAuth: true } },
    { path: '/matches/:id', component: MatchDetailView, meta: { requiresAuth: true } },
    { path: '/profile', component: ProfileView, meta: { requiresAuth: true } },
    { path: '/applications', component: ApplicationsView, meta: { requiresAuth: true } },
    { path: '/admin', component: AdminView, meta: { requiresAuth: true } },
    { path: '/cro', component: CroBoardView },
    { path: '/cro/login', component: CroLoginView }
  ]
})

router.beforeEach((to) => {
  const authStore = useAuthStore()
  if (to.meta.requiresAuth && !authStore.token) {
    return '/login'
  }
  if (to.path === '/login' && authStore.token) {
    return '/upload'
  }
  return true
})

export default router
