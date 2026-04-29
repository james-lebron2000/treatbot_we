<template>
  <!--
    Q3-红线 §A.2.1 + PRD-2026Q3 §U3 痛点 B：上传 / 报名前的同意 modal。
    三个 checkbox 必须全勾才能 confirm —— 后端记录单条 (scope, policyVersion)。
    U3：法律语 → 大白话；底部加隐私承诺 + 显式「查看记录 / 一键导出删除」入口。
    Prop 接口（visible / title）保持不变，避免破坏调用方。
  -->
  <div v-if="visible" class="consent-mask" role="dialog" aria-modal="true" @click.self="onCancel">
    <div class="consent-modal">
      <h3 class="consent-title">{{ title }}</h3>
      <p class="consent-intro">
        勾选下面三件事，我们才会动您家人的数据。每条都说人话 —— 不放心可以问客服。
      </p>
      <ul class="consent-list">
        <li>
          <label>
            <input type="checkbox" v-model="agree.parse" />
            <span>我同意系统用这些信息找研究项目。</span>
          </label>
        </li>
        <li>
          <label>
            <input type="checkbox" v-model="agree.llm" />
            <span>我同意 AI 看一眼我的病历，找出关键信息（不会留底）。</span>
          </label>
        </li>
        <li>
          <label>
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
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.consent-modal {
  background: #fff;
  border-radius: 16px;
  padding: 22px 20px 18px;
  max-width: 460px;
  width: 100%;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}

.consent-title {
  margin: 0 0 8px;
  font-size: 1.05rem;
  color: #111827;
}

.consent-intro {
  margin: 0 0 12px;
  font-size: 0.88rem;
  color: #4b5563;
  line-height: 1.6;
}

.consent-list {
  list-style: none;
  padding: 0;
  margin: 0 0 12px;
  display: grid;
  gap: 10px;
}

.consent-list label {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-size: 0.9rem;
  color: #1f2937;
  line-height: 1.55;
  cursor: pointer;
}

.consent-list input[type='checkbox'] {
  margin-top: 4px;
  flex-shrink: 0;
}

.consent-promise {
  margin: 6px 0 12px;
  padding: 10px 12px;
  background: #f0f9ff;
  border-radius: 8px;
  border: 1px solid #bae6fd;
}

.consent-promise-line {
  margin: 0 0 6px;
  font-size: 0.85rem;
  color: #075985;
  font-weight: 600;
  text-align: center;
}

.consent-promise-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
  align-items: center;
  font-size: 0.78rem;
}

.link-btn {
  background: none;
  border: none;
  padding: 2px 4px;
  color: #1d4ed8;
  cursor: pointer;
  text-decoration: underline;
  font-size: 0.78rem;
  font-family: inherit;
}

.link-btn:hover {
  color: #1e40af;
}

.link-sep {
  color: #9ca3af;
}

.consent-version {
  margin: 0 0 14px;
  font-size: 0.78rem;
  color: #9ca3af;
}

.consent-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.consent-actions .btn {
  min-width: 96px;
}
</style>
