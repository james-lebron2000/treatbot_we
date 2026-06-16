<template>
  <section class="detail-page grid">
    <h2 class="detail-title">试验详情</h2>
    <div class="card" v-if="loading">加载中...</div>
    <div class="card" v-else-if="error">{{ error }}</div>

    <div v-else-if="trial" class="grid">
      <!-- 概览：试验名 + 彩色匹配度 + 关键属性 -->
      <div class="card detail-overview">
        <h3 class="detail-name">{{ trial.name }}</h3>
        <span class="score-pill" :class="`score-pill--${scoreTier(trial.score)}`">{{ trial.score }}%</span>
        <dl class="meta-list">
          <div class="meta-row"><dt>适应症</dt><dd>{{ trial.indication }}</dd></div>
          <div class="meta-row"><dt>申办方</dt><dd>{{ trial.sponsor }}</dd></div>
          <div class="meta-row"><dt>状态</dt><dd>{{ trial.statusText || trial.status }}</dd></div>
        </dl>
      </div>

      <div class="card" v-if="trial.reasons && trial.reasons.length">
        <h4 class="section-head">匹配依据</h4>
        <ul class="criteria-list criteria-list--check">
          <li v-for="r in trial.reasons" :key="r">{{ r }}</li>
        </ul>
      </div>

      <div class="card">
        <h4 class="section-head">研究介绍</h4>
        <p class="body-text">{{ trial.description }}</p>
      </div>

      <!-- 入排标准：分号串拆成清单，空时回退占位文案 -->
      <div class="card">
        <h4 class="section-head">入排标准</h4>
        <div class="criteria-block criteria-block--include">
          <p class="criteria-label">入选</p>
          <ul v-if="toCriteriaList((trial.inclusion || []).join('；')).length" class="criteria-list criteria-list--check">
            <li v-for="(c, i) in toCriteriaList((trial.inclusion || []).join('；'))" :key="`in-${i}`">{{ c }}</li>
          </ul>
          <p v-else class="muted criteria-empty">待补</p>
        </div>
        <div class="criteria-block criteria-block--exclude">
          <p class="criteria-label">排除</p>
          <ul v-if="toCriteriaList((trial.exclusion || []).join('；')).length" class="criteria-list criteria-list--dot">
            <li v-for="(c, i) in toCriteriaList((trial.exclusion || []).join('；'))" :key="`ex-${i}`">{{ c }}</li>
          </ul>
          <p v-else class="muted criteria-empty">待补</p>
        </div>
      </div>

      <div class="card" v-if="trial.hospitals && trial.hospitals.length">
        <h4 class="section-head">研究中心</h4>
        <ul class="criteria-list criteria-list--dot">
          <li v-for="h in trial.hospitals" :key="h">{{ h }}</li>
        </ul>
      </div>

      <div class="card accent-card accent-card--brand" v-if="trial.required_documents">
        <h4 class="section-head section-head--brand">报名所需资料</h4>
        <ul v-if="docList.length" class="criteria-list criteria-list--dot">
          <li v-for="doc in docList" :key="doc">{{ doc }}</li>
        </ul>
        <p v-else class="body-text pre-wrap">{{ trial.required_documents }}</p>
        <p class="hint-text">请向主治医生或医院病案室索取以上资料</p>
      </div>

      <div class="card accent-card accent-card--mint" v-if="trial.patient_subsidy">
        <h4 class="section-head section-head--mint">患者补助</h4>
        <p class="subsidy-text">{{ trial.patient_subsidy }}</p>
      </div>

      <div class="card" v-if="trial.contact && trial.contact.phone">
        <h4 class="section-head">联系方式</h4>
        <p class="body-text">{{ trial.contact.name }}：{{ trial.contact.phone }}</p>
      </div>

      <!-- 报名 CTA：未申请时移动端底部吸附；申请后展示回执卡 -->
      <div v-if="!applied" class="apply-bar">
        <button class="btn primary apply-btn" @click="applyTrial" :disabled="applying">
          {{ applying ? '提交中...' : '申请报名' }}
        </button>
      </div>
      <div v-else class="card receipt-card">
        <p class="receipt-title">申请已提交</p>
        <p class="body-text">
          {{ trial.sponsor || '研究机构' }}的工作人员将在 <strong>3 个工作日内</strong>通过电话联系您，请保持手机畅通。
        </p>
        <p class="hint-text receipt-hint">
          您可以在"申请"页面查看所有申请状态。
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../services/api'
// Q3-红线 §B.2：业务漏斗埋点
import { track } from '../utils/track'

const route = useRoute()
const loading = ref(false)
const error = ref('')
const trial = ref<Record<string, any> | null>(null)
const applying = ref(false)
const applied = ref(false)

const docList = computed(() => {
  const raw = trial.value?.required_documents || ''
  if (!raw) return []
  // 按换行、顿号、分号拆分
  return raw.split(/[;\n；、\r]+/).map((s: string) => s.trim()).filter(Boolean)
})

// 纯函数：按列表页同款分档给匹配度上色。≥75 高、50–74 中、<50 低。
const scoreTier = (score: number): 'high' | 'mid' | 'low' => {
  const n = Number(score) || 0
  if (n >= 75) return 'high'
  if (n >= 50) return 'mid'
  return 'low'
}

// 纯函数：把分号/换行串成的入排标准拆成清单条目；空则返回空数组（模板回退原文/占位）。
const toCriteriaList = (text: string): string[] => {
  if (!text) return []
  return String(text)
    .split(/[;\n；、\r]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

const loadDetail = async () => {
  loading.value = true
  error.value = ''

  try {
    const payload = await api.getTrialDetail(String(route.params.id))
    trial.value = {
      id: payload.id || payload.trialId,
      name: payload.name || payload.title,
      score: Number(payload.score || payload.matchScore || 0),
      indication: payload.indication || payload.cancerType || '待补',
      sponsor: payload.sponsor || payload.institution || '待补',
      status: payload.status,
      statusText: payload.statusText || '',
      description: payload.description || '暂无说明',
      inclusion: payload.inclusion || payload.inclusionCriteria || [],
      exclusion: payload.exclusion || payload.exclusionCriteria || [],
      reasons: payload.reasons || [],
      required_documents: payload.required_documents || '',
      patient_subsidy: payload.patient_subsidy || '',
      hospitals: payload.hospitals || [],
      contact: payload.contact || {}
    }
  } catch {
    error.value = '加载详情失败'
  } finally {
    loading.value = false
  }
}

const applyTrial = async () => {
  if (!trial.value) return
  applying.value = true
  // Q3-红线 §B.2：trial_apply —— 详情页报名按钮点击
  track('trial_apply', { trialId: trial.value.id, source: 'detail' })
  try {
    await api.applyTrial({ trialId: trial.value.id })
    applied.value = true
    // Q3-红线 §B.2：application_submitted —— 后端 200 后才算转化
    track('application_submitted', { trialId: trial.value.id, source: 'detail' })
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '申请失败'
    alert(msg)
  } finally {
    applying.value = false
  }
}

onMounted(loadDetail)
</script>

<style scoped>
/* 桌面下把内容收进舒适阅读列；移动端整宽。 */
.detail-page {
  max-width: var(--container-read);
  margin-inline: auto;
  /* 给移动端底部吸附 CTA 让位（含安全区），避免遮住末尾内容 */
  padding-bottom: calc(var(--size-tap) + var(--s-6) + env(safe-area-inset-bottom, 0px));
}

.detail-title {
  font-size: var(--fs-title);
  line-height: var(--lh-tight);
  margin: 0;
}

/* ---- 概览卡 ---- */
.detail-overview {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
  gap: var(--s-2) var(--s-3);
}

.detail-name {
  margin: 0;
  font-size: var(--fs-subtitle);
  line-height: var(--lh-tight);
  color: var(--text);
}

.meta-list {
  grid-column: 1 / -1;
  margin: 0;
  display: grid;
  gap: var(--s-1);
}

.meta-row {
  display: flex;
  gap: var(--s-2);
  font-size: var(--fs-body);
  line-height: var(--lh-normal);
}

.meta-row dt {
  flex-shrink: 0;
  color: var(--text-dim);
}

.meta-row dt::after {
  content: '：';
}

.meta-row dd {
  margin: 0;
  color: var(--text);
}

/* ---- 匹配度彩色徽标（与列表页分档一致）---- */
.score-pill {
  justify-self: end;
  display: inline-flex;
  align-items: center;
  padding: var(--s-1) var(--s-3);
  border-radius: var(--r-pill);
  font-size: var(--fs-callout);
  font-weight: 700;
  white-space: nowrap;
}

.score-pill--high {
  background: var(--mint-soft);
  color: var(--mint-text);
}

.score-pill--mid {
  background: var(--brand-soft);
  color: var(--brand-hover);
}

.score-pill--low {
  background: var(--amber-soft);
  color: var(--amber-text);
}

/* ---- 区块标题 ---- */
.section-head {
  margin: 0 0 var(--s-2);
  font-size: var(--fs-subtitle);
  line-height: var(--lh-tight);
  color: var(--text);
}

.section-head--brand {
  color: var(--brand-hover);
}

.section-head--mint {
  color: var(--mint-text);
}

/* ---- 正文 / 辅助文案 ---- */
.body-text {
  margin: 0;
  font-size: var(--fs-body);
  line-height: var(--lh-relaxed);
  color: var(--text-dim);
}

.pre-wrap {
  white-space: pre-wrap;
}

.hint-text {
  margin: var(--s-2) 0 0;
  font-size: var(--fs-caption);
  line-height: var(--lh-normal);
  color: var(--text-muted);
}

/* ---- 入排标准 / 清单 ---- */
.criteria-block + .criteria-block {
  margin-top: var(--s-3);
}

.criteria-label {
  margin: 0 0 var(--s-1);
  font-size: var(--fs-callout);
  font-weight: 600;
  color: var(--text);
}

.criteria-empty {
  margin: 0;
  font-size: var(--fs-body);
}

.criteria-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: var(--s-1);
}

.criteria-list li {
  position: relative;
  padding-left: var(--s-4);
  font-size: var(--fs-body);
  line-height: var(--lh-relaxed);
  color: var(--text-dim);
}

/* 入选 / 匹配依据：绿色对勾标记 */
.criteria-list--check li::before {
  content: '✓';
  position: absolute;
  left: 0;
  top: 0;
  color: var(--mint);
  font-weight: 700;
}

/* 排除 / 中性清单：圆点标记 */
.criteria-list--dot li::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 0.7em;
  width: 5px;
  height: 5px;
  border-radius: var(--r-pill);
  background: var(--text-muted);
}

/* ---- 强调卡（资料 / 补助）：左边色条 + 柔色底 ---- */
.accent-card {
  border-left: 3px solid var(--line);
}

.accent-card--brand {
  border-left-color: var(--brand);
  background: var(--bg-soft);
}

.accent-card--mint {
  border-left-color: var(--mint);
  background: var(--bg-mint);
}

.subsidy-text {
  margin: 0;
  font-size: var(--fs-body);
  line-height: var(--lh-relaxed);
  color: var(--mint-text);
}

/* ---- 报名 CTA ---- */
.apply-bar {
  text-align: center;
}

.apply-btn {
  width: 100%;
  font-size: var(--fs-subtitle);
  font-weight: 600;
}

/* ---- 申请回执卡 ---- */
.receipt-card {
  background: var(--bg-mint);
  border-color: var(--mint);
}

.receipt-title {
  margin: 0 0 var(--s-1);
  font-weight: 700;
  color: var(--mint-text);
}

.receipt-hint {
  color: var(--text-dim);
}

/* 移动端：报名按钮吸附底部，触达 ≥44px，含刘海安全区。 */
@media (max-width: 640px) {
  .apply-bar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 50;
    padding: var(--s-2) var(--s-3);
    padding-bottom: calc(var(--s-2) + env(safe-area-inset-bottom, 0px));
    background: var(--bg);
    border-top: 1px solid var(--line);
    box-shadow: var(--shadow-2);
  }
}

/* 桌面：恢复常规文档流，按钮回到内容列内、左对齐宽度自适应。 */
@media (min-width: 641px) {
  .apply-btn {
    width: auto;
    min-width: 240px;
    padding-inline: var(--s-8);
  }
}
</style>
