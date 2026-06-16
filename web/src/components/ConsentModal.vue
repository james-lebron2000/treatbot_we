<template>
  <!--
    Q3-红线 §A.2.1 + PRD-2026Q3 §U3 痛点 B：上传 / 报名前的同意 modal。
    三个 checkbox 必须全勾才能 confirm —— 后端记录单条 (scope, policyVersion)。
    U3：法律语 → 大白话；底部加隐私承诺 + 显式「查看记录 / 一键导出删除」入口。
    Prop 接口（visible / title）保持不变，避免破坏调用方。
  -->
  <div v-if="visible" class="consent-mask" role="dialog" aria-modal="true" @click.self="onCancel">
    <div class="consent-modal">
      <header class="consent-header">
        <span class="consent-lock" aria-hidden="true">🔒</span>
        <h3 class="consent-title">{{ title }}</h3>
      </header>
      <div class="consent-body">
        <p class="consent-intro">
          勾选下面三件事，我们才会动您家人的数据。每条都说人话 —— 不放心可以问客服。
        </p>
        <ul class="consent-list">
          <li>
            <label class="consent-row">
              <input type="checkbox" v-model="agree.parse" />
              <span>我同意系统用这些信息找研究项目。</span>
            </label>
          </li>
          <li>
            <label class="consent-row">
              <input type="checkbox" v-model="agree.llm" />
              <span>我同意 AI 看一眼我的病历，找出关键信息（不会留底）。</span>
            </label>
          </li>
          <li>
            <label class="consent-row">
              <input type="checkbox" v-model="agree.cro" />
              <span>我同意把匹配结果转给研究团队联络我（您可以随时撤回）。</span>
            </label>
          </li>
        </ul>

        <!-- 隐私承诺 + 数据自主权入口 -->
        <div class="consent-promise">
          <p class="consent-promise-line">{{ promiseLine }}</p>
          <div class="consent-promise-links">
            <button type="button" class="link-btn" @click="goConsentRecord">立即查看我的同意记录</button>
            <span class="link-sep">·</span>
            <button type="button" class="link-btn" @click="goDataControl">立即一键导出/删除我的数据</button>
          </div>
        </div>

        <p class="consent-version">隐私政策版本：{{ policyVersion }}</p>
      </div>
      <div class="consent-actions">
        <button class="btn ghost" @click="onCancel">先不了</button>
        <button class="btn primary" :disabled="!allAgreed || submitting" @click="onConfirm">
          {{ submitting ? '提交中…' : '我同意，开始上传' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { POLICY_VERSION } from '../constants/privacy'
// PRD-2026Q3 §U3 痛点 B：底部承诺一行从 shared/copy/help.json 读，保持文案单一来源。
import { expectations } from '../copy/help'

const props = defineProps<{
  visible: boolean
  title?: string
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
  // U3：父组件可监听这两个意图（如果路由不可达时由父组件兜底处理）。
  (e: 'view-consent'): void
  (e: 'manage-data'): void
}>()

const policyVersion = POLICY_VERSION
const submitting = ref(false)
const agree = reactive({ parse: false, llm: false, cro: false })

const allAgreed = computed(() => agree.parse && agree.llm && agree.cro)
const title = computed(() => props.title || '在开始之前，请确认这三件事')
const promiseLine = expectations?.promise || '全程免费 · 您的数据您说了算 · 不卖给第三方'

// 路由可能不存在时退化为 emit 事件（vue-router 在 setup 顶层即使无匹配也允许 push，
// 但为了语义清晰，这里仍优先尝试 push 已存在的 /profile 路由——它承载导出/删除/同意记录）。
const router = useRouter()

const goConsentRecord = () => {
  // /profile 页承载「我的数据」面板，包含同意状态与导出/删除入口。
  if (!routeExists('/profile')) {
    emit('view-consent')
    return
  }
  router.push('/profile').catch(() => emit('view-consent'))
}

const goDataControl = () => {
  if (!routeExists('/profile')) {
    emit('manage-data')
    return
  }
  router.push('/profile').catch(() => emit('manage-data'))
}

function routeExists(path: string): boolean {
  try {
    const matched = router.resolve(path)
    return matched && matched.matched && matched.matched.length > 0
  } catch {
    return false
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    agree.parse = false
    agree.llm = false
    agree.cro = false
    submitting.value = false
  }
})

const onConfirm = () => {
  if (!allAgreed.value || submitting.value) return
  submitting.value = true
  emit('confirm')
}

const onCancel = () => {
  if (submitting.value) return
  emit('cancel')
}
</script>

<style scoped>
.consent-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--s-4);
  /* 安全区：刘海 / 底部手势条都不遮挡内容 */
  padding-top: max(var(--s-4), env(safe-area-inset-top, 0px));
  padding-bottom: max(var(--s-4), env(safe-area-inset-bottom, 0px));
}

/* 桌面：居中卡片。内容超高时整张卡片不超过视口，由内部 body 滚动。 */
.consent-modal {
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border-radius: var(--r-lg);
  max-width: 460px;
  width: 100%;
  max-height: 100%;
  box-shadow: var(--shadow-2);
  overflow: hidden;
}

.consent-header {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-6) var(--s-6) var(--s-2);
  flex-shrink: 0;
}

.consent-lock {
  font-size: var(--fs-subtitle);
  line-height: 1;
}

.consent-title {
  margin: 0;
  font-size: var(--fs-subtitle);
  font-weight: 600;
  color: var(--text);
  line-height: var(--lh-tight);
}

/* 可滚动主体：内容超过视口高度时这里出现滚动条，头/脚保持可见。 */
.consent-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 var(--s-6) var(--s-2);
}

.consent-intro {
  margin: 0 0 var(--s-3);
  font-size: var(--fs-callout);
  color: var(--text-dim);
  line-height: var(--lh-relaxed);
}

.consent-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--s-3);
  display: grid;
  gap: var(--s-1);
}

/* 每个勾选项是 ≥44px 的整行点击区：点标签任意位置都能勾选。 */
.consent-row {
  display: flex;
  gap: var(--s-3);
  align-items: flex-start;
  min-height: var(--size-tap);
  padding: var(--s-2);
  margin: 0 calc(-1 * var(--s-2));
  border-radius: var(--r-sm);
  font-size: var(--fs-callout);
  color: var(--text);
  line-height: var(--lh-normal);
  cursor: pointer;
  transition: background-color 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.consent-row:hover {
  background: var(--bg-soft);
}

.consent-row input[type='checkbox'] {
  width: 20px;
  height: 20px;
  margin-top: 2px;
  flex-shrink: 0;
  accent-color: var(--brand);
  cursor: pointer;
}

.consent-promise {
  margin: var(--s-1) 0 var(--s-3);
  padding: var(--s-3);
  background: var(--bg-soft);
  border-radius: var(--r-sm);
  border: 1px solid var(--brand-soft);
}

.consent-promise-line {
  margin: 0 0 var(--s-1);
  font-size: var(--fs-callout);
  color: var(--mint-text);
  font-weight: 600;
  text-align: center;
}

.consent-promise-links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1);
  justify-content: center;
  align-items: center;
}

.link-btn {
  background: none;
  border: none;
  padding: var(--s-1) var(--s-1);
  color: var(--brand-hover);
  cursor: pointer;
  text-decoration: underline;
  font-size: var(--fs-caption);
  font-family: inherit;
}

.link-btn:hover {
  color: var(--brand);
}

.link-btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
  border-radius: var(--r-sm);
}

.link-sep {
  color: var(--text-muted);
}

.consent-version {
  margin: 0;
  font-size: var(--fs-caption);
  color: var(--text-muted);
}

/* 底部操作条：右对齐两枚 ≥44px 按钮，窄屏不挤。 */
.consent-actions {
  display: flex;
  gap: var(--s-3);
  justify-content: flex-end;
  padding: var(--s-3) var(--s-6) var(--s-6);
  flex-shrink: 0;
}

.consent-actions .btn {
  min-width: 96px;
}

/* 移动端 ≤480px：底部全宽 sheet（贴底、上圆角），动作按钮各占一半且不拥挤。 */
@media (max-width: 480px) {
  .consent-mask {
    align-items: flex-end;
    padding: 0;
  }

  .consent-modal {
    max-width: 100%;
    max-height: 92vh;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
  }

  .consent-header {
    padding: var(--s-4) var(--s-4) var(--s-2);
  }

  .consent-body {
    padding: 0 var(--s-4) var(--s-2);
  }

  .consent-actions {
    padding: var(--s-3) var(--s-4);
    padding-bottom: max(var(--s-4), env(safe-area-inset-bottom, 0px));
  }

  .consent-actions .btn {
    flex: 1;
    min-width: 0;
  }
}
</style>
