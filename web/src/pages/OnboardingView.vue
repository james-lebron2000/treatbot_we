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
      <button class="btn primary onboarding-cta" type="button" @click="confirm">
        {{ data.ctaPrimary }}
      </button>
      <button class="btn ghost onboarding-cta" type="button" @click="skip">
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
/* 移动优先：窄屏全宽，桌面收束到约 560px 的舒适阅读列并居中。 */
.onboarding-shell {
  max-width: 560px;
  margin-inline: auto;
  padding: var(--s-6) var(--s-4) var(--s-8);
  display: flex;
  flex-direction: column;
  gap: var(--s-6);
}

.onboarding-header {
  text-align: center;
}
.onboarding-title {
  margin: 0 0 var(--s-2);
  /* 流式标题：随视口在 title↔display 之间平滑缩放 */
  font-size: clamp(var(--fs-title), 6vw, var(--fs-display));
  line-height: var(--lh-tight);
  color: var(--text);
}
.onboarding-subtitle {
  margin: 0;
  color: var(--text-dim);
  font-size: var(--fs-subtitle);
  line-height: var(--lh-normal);
}

.onboarding-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}
.onboarding-step {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  padding: var(--s-4);
  background: var(--bg-soft);
  border-radius: var(--r-lg);
  border: 1px solid var(--line);
}
.step-icon {
  flex: 0 0 auto;
  width: var(--s-8);
  height: var(--s-8);
  border-radius: var(--r-pill);
  background: var(--brand);
  color: #fff;
  font-size: var(--fs-body);
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.step-body {
  flex: 1;
  min-width: 0;
}
.step-title {
  margin: 0 0 var(--s-1);
  font-size: var(--fs-subtitle);
  color: var(--text);
}
.step-text {
  margin: 0;
  font-size: var(--fs-callout);
  line-height: var(--lh-relaxed);
  color: var(--text-dim);
}

.onboarding-promise {
  text-align: center;
  background: var(--brand-soft);
  color: var(--brand-hover);
  padding: var(--s-3) var(--s-4);
  border-radius: var(--r-md);
  font-size: var(--fs-callout);
  line-height: var(--lh-normal);
}

.onboarding-actions {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}
/* 窄屏主 CTA 全宽、舒适触达；.btn 已保证 ≥44px 触达高度 */
.onboarding-cta {
  width: 100%;
  font-size: var(--fs-subtitle);
  font-weight: 600;
}

.onboarding-helpline {
  margin: 0;
  text-align: center;
  font-size: var(--fs-caption);
  line-height: var(--lh-normal);
  color: var(--text-muted);
}

/* 桌面：按钮回到自然宽度并右对齐成一行，给内容更稳的视觉节奏。 */
@media (min-width: 768px) {
  .onboarding-shell {
    padding-block: var(--s-12);
  }
  .onboarding-actions {
    flex-direction: row-reverse;
    justify-content: center;
  }
  .onboarding-cta {
    width: auto;
    min-width: 160px;
  }
}
</style>
