import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as Sentry from '@sentry/vue'
import App from './App.vue'
import router from './router'
import './styles/tokens.css'
import './style.css'

const app = createApp(App)

// Q3-红线 §A.3：前端 Sentry 接入。VITE_SENTRY_DSN 未配置时 init 仍然安全地 no-op。
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    app,
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration({ router })],
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
    environment: import.meta.env.MODE
  })
}

app.use(createPinia()).use(router).mount('#app')
