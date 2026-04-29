<template>
  <!--
    PRD-2026Q3 §U5：首屏期望管理 onboarding。
    目标：30 秒告诉「0 医学基础」的家属：我们做什么 / 您要做什么 / 大致多久。
    跳过状态以 localStorage('onboardingSeenAt') 持久化，回访不再打扰。
  -->
  <section class="onboarding-shell">
    <header class="onboarding-header">
      <h2 class="onboarding-title">{{ data.title }}</h2>
      <p class="onboarding-subtitle">您只用拍照上传病历，剩下的我们做。</p>
    </header>

    <ol class="onboarding-steps">
      <li v-for="step in data.steps" :key="step.icon" class="onboarding-step">
        <span class="step-icon">{{ step.icon }}</span>
        <div class="step-body">
          <h3 class="step-title">{{ step.title }}</h3>
          <p class="step-text">{{ step.body }}</p>
        </div>
      </li>
    </ol>

    <div class="onboarding-promise">
      {{ data.promise }}
    </div>

    <div class="onboarding-actions">
      <button class="btn-primary" type="button" @click="confirm">
        {{ data.ctaPrimary }}
      </button>
      <button class="btn-secondary" type="button" @click="skip">
        {{ data.ctaSecondary }}
      </button>
    </div>

    <p class="onboarding-helpline">
      看不明白随时点右下角 <strong>「需要帮忙」</strong>，可以打电话给我们。
    </p>
  </section>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { expectations } from '../copy/help'

interface Step { icon: string; title: string; body: string }
interface Expectations {
  title: string
  steps: Step[]
  promise: string
  ctaPrimary: string
  ctaSecondary: string
}

const data = expectations as unknown as Expectations
const router = useRouter()

const persistSeen = () => {
  try {
    localStorage.setItem('onboardingSeenAt', String(Date.now()))
  } catch {
    /* private mode 等场景静默忽略——下次再展示一次也无妨 */
  }
}

const confirm = () => {
  persistSeen()
  router.replace('/upload')
}

const skip = () => {
  persistSeen()
  router.replace('/upload')
}
</script>

<style scoped>
.onboarding-shell {
  max-width: 540px;
  margin: 0 auto;
  padding: 28px 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.onboarding-header {
  text-align: center;
}
.onboarding-title {
  margin: 0 0 6px;
  font-size: 1.35rem;
  color: #0F172A;
}
.onboarding-subtitle {
  margin: 0;
  color: #475569;
  font-size: 0.95rem;
}
.onboarding-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.onboarding-step {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px;
  background: #F8FAFC;
  border-radius: 14px;
  border: 1px solid #E2E8F0;
}
.step-icon {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #1F5AC7;
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.step-body {
  flex: 1;
}
.step-title {
  margin: 0 0 4px;
  font-size: 1rem;
  color: #0F172A;
}
.step-text {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.55;
  color: #334155;
}
.onboarding-promise {
  text-align: center;
  background: #F0F6FF;
  color: #1F5AC7;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 0.9rem;
}
.onboarding-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.btn-primary {
  border: none;
  background: #1F5AC7;
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  padding: 14px 0;
  border-radius: 12px;
  cursor: pointer;
}
.btn-secondary {
  border: 1px solid #CBD5E1;
  background: #fff;
  color: #475569;
  font-size: 0.95rem;
  padding: 12px 0;
  border-radius: 12px;
  cursor: pointer;
}
.onboarding-helpline {
  margin: 0;
  text-align: center;
  font-size: 0.82rem;
  color: #64748B;
}
</style>
