<template>
  <section class="grid">
    <h2>为您家人找到的可能性</h2>

    <!-- PRD-2026Q2 §3.5：当前病历切换入口（徽标）。没有 active 病历时也展示，便于引导用户。 -->
    <div class="card active-record">
      <div class="active-record__body">
        <p class="muted active-record__label">当前病历</p>
        <p class="active-record__value">
          {{ activeRecordLabel }}
        </p>
      </div>
      <router-link to="/records" class="btn ghost active-record__switch">切换</router-link>
    </div>

    <!-- 手动录入面板（用户没有病历时的入口）-->
    <div v-if="manualEntryOpen" class="card manual-entry">
      <h3 class="manual-entry__title">告诉我们基本情况就行</h3>
      <p class="manual-entry__hint">
        只要填写癌种，我们就能帮您找。没做基因检测也能查 —— <strong>有一批试验不需要基因结果</strong>。
      </p>
      <div class="manual-entry__fields">
        <div class="field">
          <label class="field__label">癌种 <span class="field__required">*</span></label>
          <input v-model="manualDisease" placeholder="例如：非小细胞肺癌、胃腺癌" />
        </div>
        <div class="manual-entry__row">
          <div class="field">
            <label class="field__label">分期</label>
            <select v-model="manualStage">
              <option value="">不限</option>
              <option value="I期">I期</option>
              <option value="II期">II期</option>
              <option value="III期">III期</option>
              <option value="IV期">IV期</option>
            </select>
          </div>
          <div class="field">
            <label class="field__label">城市</label>
            <input v-model="manualCity" placeholder="例如：北京" />
          </div>
        </div>
      </div>
      <div class="manual-entry__actions">
        <button class="btn primary manual-entry__btn" :disabled="!manualDisease.trim()" @click="applyManualEntry">
          找找看
        </button>
        <button class="btn ghost manual-entry__btn" @click="closeManualEntry">先不用</button>
      </div>
    </div>

    <!-- 无基因提示条 -->
    <div v-if="showNoGeneHint" class="card no-gene-hint">
      <p class="no-gene-hint__text">
        没做基因检测也没关系 —— 下面 <strong>{{ noGeneFriendlyCount }}</strong> 个试验不需要检测也能参加。
        <a href="#" @click.prevent="toggleGeneAgnosticOnly" class="no-gene-hint__link">
          {{ filterGeneAgnosticOnly ? '看看全部' : '只看这些 →' }}
        </a>
      </p>
    </div>

    <!-- 患者诊断摘要（可折叠） -->
    <details v-if="hasRecord" class="record-summary-toggle" open>
      <summary class="summary-trigger">我的诊断信息 <span class="toggle-hint">{{ summaryOpen ? '收起' : '展开' }}</span></summary>
      <RecordSummaryCard :record="patientStore.structuredRecord" />
    </details>

    <p class="muted" v-if="total > 0">为您找到 {{ total }} 个可能适合的试验 · 最匹配的排在前面</p>

    <!-- 筛选栏 -->
    <div v-if="filterOptions.phases.length || filterOptions.cities.length" class="filter-row">
      <select v-model="filterPhase" @change="resetAndLoad">
        <option value="">全部阶段</option>
        <option v-for="p in filterOptions.phases" :key="p" :value="p">{{ p }}</option>
      </select>
      <select v-model="filterCity" @change="resetAndLoad">
        <option value="">全部城市</option>
        <option v-for="c in filterOptions.cities" :key="c" :value="c">{{ c }}</option>
      </select>
      <select v-model="filterStatus" @change="resetAndLoad">
        <option value="">全部状态</option>
        <option value="recruiting">招募中</option>
        <option value="closed">已关闭</option>
      </select>
    </div>

    <!-- 加载骨架：占位卡片，避免内容跳动 -->
    <div v-if="loading" class="results-grid" aria-busy="true">
      <div v-for="n in 4" :key="n" class="card skeleton-card" aria-hidden="true">
        <div class="skeleton-line skeleton-line--title"></div>
        <div class="skeleton-line skeleton-line--reason"></div>
        <div class="skeleton-tags">
          <span class="skeleton-pill"></span>
          <span class="skeleton-pill"></span>
        </div>
        <div class="skeleton-line skeleton-line--meta"></div>
      </div>
      <p class="results-status">正在为家人找合适的试验…</p>
    </div>
    <div class="card error-card" v-else-if="error">{{ error }}</div>
    <div v-else-if="!matches.length && !loading" class="card empty-state">
      <div class="empty-state__icon" aria-hidden="true">🔍</div>
      <p class="empty-state__title">目前没找到完全贴合的试验</p>
      <p class="empty-state__hint">
        这不代表没有 —— 我们每周更新试验库，下周再来看看？<br/>
        也可以调整条件，或者让医生协助预筛。
      </p>
      <div class="empty-state__actions">
        <button class="btn primary" @click="openManualEntry">调整癌种 / 城市</button>
        <router-link to="/upload" class="btn ghost">重新上传病历</router-link>
      </div>
    </div>

    <div v-if="matches.length" class="results-grid">
      <div v-for="match in matches" :key="match.id" class="card match-card">
        <div class="match-card__header">
          <h3 class="match-card__name">{{ match.name }}</h3>
          <span class="score-pill" :class="scoreTier(match.score)">
            <span class="score-pill__pct">{{ match.score }}%</span>
            <span class="score-pill__label">{{ matchLevelText(match.score) }}</span>
          </span>
        </div>

        <!-- U3 痛点 A：置顶一句白话「为什么适合您家人」。
             不出现分数；用 glossary.matchReasons 字典翻译 reason key，命中前 2 条拼成句子。 -->
        <p v-if="topReasonSentence(match)" class="why-fit">
          <span class="why-fit-icon" aria-hidden="true">✓</span>
          <span class="why-fit-text">
            <span class="why-fit-label">为什么适合您家人：</span>{{ topReasonSentence(match) }}
          </span>
        </p>

        <div class="match-card__tags">
          <span class="badge">{{ match.phase }}</span>
          <span class="badge">{{ match.location }}</span>
          <span class="badge" v-if="match.statusText">{{ match.statusText }}</span>
          <span v-if="match.geneRequired === false" class="badge badge--gene">无需基因检测</span>
        </div>

        <!-- 详细原因（保留原 humanizeReasons 折叠展示，作为辅助信息） -->
        <details v-if="match.reasons && match.reasons.length" class="reason-detail">
          <summary>详细原因</summary>
          <div class="reason-detail__list">
            <span v-for="(reason, idx) in humanizeReasons(match.reasons).slice(0, 6)" :key="idx"
                  class="reason-detail__chip">
              {{ reason }}
            </span>
          </div>
        </details>

        <p class="match-card__meta">{{ match.indication }} | {{ match.institution }}</p>

        <div class="match-card__actions">
          <button class="btn ghost match-card__btn" @click="goDetail(match.id)">查看详情</button>
          <button class="btn primary match-card__btn" @click="apply(match)" :disabled="match.applied">
            {{ match.applied ? '已申请' : '想让研究团队联系我' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="total > pageSize" class="pager">
      <button class="btn ghost" :disabled="currentPage <= 1" @click="goPage(currentPage - 1)">上一页</button>
      <span class="muted pager__status">{{ currentPage }} / {{ totalPages }}</span>
      <button class="btn ghost" :disabled="currentPage >= totalPages" @click="goPage(currentPage + 1)">下一页</button>
    </div>

    <ConsentModal
      :visible="consentVisible"
      title="提交报名前，请确认这三件事"
      @confirm="onConsentConfirm"
      @cancel="onConsentCancel"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { api } from '../services/api'
import { sortMatches } from '../utils/schema'
import { usePatientStore } from '../stores/patient'
import RecordSummaryCard from '../components/RecordSummaryCard.vue'
// Q3-红线 §A.2.1：报名前如果未记录 share_with_cro scope，弹同意 modal。
import ConsentModal from '../components/ConsentModal.vue'
// PRD-2026Q3 §U3 痛点 A：把 reason key 翻译成大白话置顶句。
import { matchReasons } from '../copy/glossary'
import { POLICY_VERSION } from '../constants/privacy'
// Q3-红线 §B.2：业务漏斗埋点
import { track } from '../utils/track'

const router = useRouter()
const route = useRoute()
const patientStore = usePatientStore()

const hasRecord = computed(() => Object.keys(patientStore.structuredRecord || {}).length > 0)
const summaryOpen = ref(true)

// PRD-2026Q2 §3.5：当前病历徽标。优先用 store.records 里 active 的那一条的诊断文本；
// 手动录入态 (activeRecordId 为 null) 且 structuredRecord 有 diagnosis 时，展示手动录入 hint。
const activeRecordLabel = computed(() => {
  const active = patientStore.activeRecord
  if (active) {
    return active.diagnosis || active.type || active.id
  }
  const manualDiag = `${(patientStore.structuredRecord || {}).diagnosis || ''}`.trim()
  if (manualDiag) return `手动录入 · ${manualDiag}`
  return '未选择（去「我的病历」选一份）'
})

const loading = ref(false)
const error = ref('')
const matches = ref<Record<string, any>[]>([])
const total = ref(0)
const currentPage = ref(1)
const pageSize = 20
const totalPages = computed(() => Math.ceil(total.value / pageSize))

const filterPhase = ref('')
const filterCity = ref('')
const filterStatus = ref('')
const filterOptions = ref<{ phases: string[]; cities: string[] }>({ phases: [], cities: [] })

// 手动录入 + 无基因筛选
const manualEntryOpen = ref(false)
const manualDisease = ref('')
const manualStage = ref('')
const manualCity = ref('')
const filterGeneAgnosticOnly = ref(false)

const openManualEntry = () => {
  const rec = patientStore.structuredRecord || {}
  manualDisease.value = `${rec.diagnosis || ''}`
  manualStage.value = `${rec.stage || ''}`
  manualCity.value = `${rec.city || filterCity.value || ''}`
  manualEntryOpen.value = true
}
const closeManualEntry = () => { manualEntryOpen.value = false }
const applyManualEntry = () => {
  const disease = manualDisease.value.trim()
  if (!disease) return
  const rec: Record<string, unknown> = {
    diagnosis: disease,
    stage: manualStage.value,
    city: manualCity.value
  }
  // 手动录入是临时/探索态，不写后端 —— 只在 store 里保存，currentRecordId 置空以便 getMatches 走 filters 分支
  patientStore.setRecord('', rec)
  manualEntryOpen.value = false
  if (manualCity.value) filterCity.value = manualCity.value
  currentPage.value = 1
  loadMatches()
}

const toggleGeneAgnosticOnly = () => {
  filterGeneAgnosticOnly.value = !filterGeneAgnosticOnly.value
  currentPage.value = 1
  loadMatches()
}

const patientHasGene = computed(() => {
  const raw = patientStore.structuredRecord || {}
  const gene = `${raw.geneMutation || raw.gene_mutation || ''}`.trim()
  return gene.length > 0
})
const showNoGeneHint = computed(() => !patientHasGene.value && matches.value.length > 0 && noGeneFriendlyCount.value > 0)
const noGeneFriendlyCount = computed(() => matches.value.filter((m) => m.geneRequired === false).length)

const matchLevelText = (score: number) => {
  if (score >= 80) return '高度匹配'
  if (score >= 65) return '值得关注'
  if (score >= 50) return '可以了解'
  return '仅供参考'
}

const matchLevelStyle = (score: number) => {
  if (score >= 80) return { background: '#dcfce7', color: '#166534' }
  if (score >= 65) return { background: '#fef3c7', color: '#92400e' }
  if (score >= 50) return { background: '#e0e7ff', color: '#3730a3' }
  return { background: '#f3f4f6', color: '#6b7280' }
}

// 纯函数：把匹配分数映射到分数胶囊的配色档（仅返回 class，配色走 scoped 设计 token）。
// ≥75 高分=薄荷绿，50–74 中段=品牌蓝，<50 低段=琥珀色。
const scoreTier = (score: number): string => {
  if (score >= 75) return 'score-pill--high'
  if (score >= 50) return 'score-pill--mid'
  return 'score-pill--low'
}

// 将工程术语转为患者能理解的话
const reasonMap: [RegExp, string][] = [
  [/ECOG体能评分.*符合/, '体能状态符合要求'],
  [/ECOG体能评分默认符合/, '体能状态符合要求'],
  [/ECOG体能评分.*超出/, '体能状态可能不符'],
  [/诊断.*匹配|疾病.*匹配/, '癌症类型匹配'],
  [/疾病标签.*命中/, '癌症类型匹配'],
  [/基因.*匹配|突变.*匹配/, '基因检测结果匹配'],
  [/分期匹配/, '疾病分期匹配'],
  [/治疗线.*匹配/, '治疗阶段匹配'],
  [/PD-?L1.*匹配|pdl1/i, 'PD-L1 检测匹配'],
  [/城市匹配|地点匹配/, '有您所在城市的医院'],
  [/招募中/, '正在招募患者'],
  [/泛.*实体瘤/, '适用于多种实体瘤']
]

const humanizeReasons = (reasons: string[]) => {
  return reasons.map((r) => {
    for (const [pattern, friendly] of reasonMap) {
      if (pattern.test(r)) return friendly
    }
    return r
  })
}

// PRD-2026Q3 §U3 痛点 A：取 reasons 前 2 条，用 glossary.matchReasons 翻译成「为什么适合您家人」一句话。
// - 命中字典就用字典短语；没命中走 fallback。
// - 不出现分数 / 百分比，避免引发「为什么不是 100」的歧义。
const fallbackReason = matchReasons.fallback || '和您家人的情况比较接近'

const translateReasonKey = (raw: string): string => {
  if (!raw) return ''
  // 直接命中（后端返回的标准 key，例如 'gene_match'）
  if (raw in matchReasons) return matchReasons[raw]
  // 大小写规范化后再试一次（容错）
  const k = raw.trim().toLowerCase().replace(/\s+/g, '_')
  if (k in matchReasons) return matchReasons[k]
  // 旧/中文长描述：跑一遍 humanizeReasons 的正则映射，作为兜底友好化
  for (const [pattern, friendly] of reasonMap) {
    if (pattern.test(raw)) return friendly
  }
  return ''
}

const topReasonSentence = (match: { reasons?: string[] }): string => {
  const reasons = Array.isArray(match.reasons) ? match.reasons : []
  const translated: string[] = []
  for (const r of reasons) {
    const t = translateReasonKey(`${r}`)
    if (t && !translated.includes(t)) translated.push(t)
    if (translated.length >= 2) break
  }
  if (!translated.length) {
    // 有 reasons 但一条都没翻译出来 —— 用 fallback 兜底
    if (reasons.length) return fallbackReason + '。'
    return ''
  }
  return translated.join('；') + '。'
}

const normalize = (item: Record<string, any>) => ({
  id: item.id || item.trialId,
  name: item.name || item.title,
  score: Number(item.score || item.matchScore || 0),
  phase: item.phase || '待补',
  location: item.location || '待补',
  indication: item.indication || item.cancerType || '待补',
  institution: item.institution || '待补',
  reasons: item.reasons || [],
  statusText: item.statusText || '',
  geneRequired: item.geneRequired === true ? true : (item.geneRequired === false ? false : undefined),
  updatedAt: item.updatedAt || item.createdAt || '',
  applied: false
})

const loadMatches = async () => {
  loading.value = true
  error.value = ''
  try {
    const rec = patientStore.structuredRecord || {}
    const params: Record<string, unknown> = {
      recordId: patientStore.currentRecordId || undefined,
      page: currentPage.value,
      pageSize
    }
    if (filterPhase.value) params.phase = filterPhase.value
    if (filterCity.value) params.city = filterCity.value
    if (filterStatus.value) params.status = filterStatus.value
    // 没有 recordId（手动录入 / 探索态）时，把 store 里的结构化字段传给 api 的 filters 构造器
    if (!patientStore.currentRecordId) {
      if (rec.diagnosis) params.disease = rec.diagnosis
      if (rec.stage) params.stage = rec.stage
      if (rec.city && !filterCity.value) params.city = rec.city
    }
    if (filterGeneAgnosticOnly.value) params.gene_required = false

    const payload = await api.getMatches(params)
    const list = Array.isArray(payload) ? payload : payload.list || payload.items || payload.trials || payload.matches || []
    matches.value = sortMatches(list.map(normalize))
    total.value = payload.pagination?.total || list.length
    // Q3-红线 §B.2：match_view —— 列表加载成功（含 0 条），用于漏斗到达率
    track('match_view', { count: matches.value.length, page: currentPage.value })
  } catch {
    error.value = '加载时遇到小问题 —— 稍后再试一次？您的数据没丢。'
  } finally {
    loading.value = false
  }
}

const resetAndLoad = () => { currentPage.value = 1; loadMatches() }

const loadFilterOptions = async () => {
  try {
    const opts = await api.getFilterOptions()
    filterOptions.value = { phases: opts.phases || [], cities: opts.cities || opts.locations || [] }
  } catch { /* non-fatal */ }
}

const goPage = (page: number) => { currentPage.value = page; loadMatches(); window.scrollTo({ top: 0, behavior: 'smooth' }) }

const goDetail = (id: string) => { router.push(`/matches/${id}`) }

// Q3-红线 §A.2.1：consent gate
const consentVisible = ref(false)
const hasShareConsent = ref(false)
const pendingApply = ref<any | null>(null)

const checkShareConsent = async () => {
  try {
    const data: any = await api.getMyConsent()
    const list = data?.list || []
    hasShareConsent.value = list.some((c: any) => c.scope === 'share_with_cro' && c.policyVersion === POLICY_VERSION)
  } catch {
    hasShareConsent.value = false
  }
}

const onConsentConfirm = async () => {
  try {
    await Promise.all([
      api.recordConsent('upload', POLICY_VERSION).catch(() => null),
      api.recordConsent('match', POLICY_VERSION).catch(() => null),
      api.recordConsent('share_with_cro', POLICY_VERSION).catch(() => null)
    ])
    hasShareConsent.value = true
    consentVisible.value = false
    if (pendingApply.value) {
      const match = pendingApply.value
      pendingApply.value = null
      apply(match)
    }
  } catch {
    consentVisible.value = false
  }
}

const onConsentCancel = () => {
  consentVisible.value = false
  pendingApply.value = null
}

const apply = async (match: any) => {
  if (match.applied) return
  if (!hasShareConsent.value) {
    pendingApply.value = match
    consentVisible.value = true
    return
  }
  // Q3-红线 §B.2：trial_apply —— 用户点击报名（同意已通过的那一支）
  track('trial_apply', { trialId: match.id })
  try {
    await api.applyTrial({ trialId: match.id, recordId: patientStore.currentRecordId || '' })
    match.applied = true
    // Q3-红线 §B.2：application_submitted —— 后端 200 后才算转化
    track('application_submitted', { trialId: match.id })
    alert('好了 ✓ 研究团队通常 1-3 个工作日内会联系您。这段时间您不用做什么，有消息会短信通知。')
  } catch (err: any) {
    alert(err?.response?.data?.message || '提交时遇到小问题 —— 稍后再试一次？')
  }
}

onMounted(() => {
  if (route.query.manualEntry === '1') {
    openManualEntry()
  }
  // PRD-2026Q2 §3.5：首次进入顺手加载病历列表以给顶部徽标填数据；失败不阻塞主流程。
  if (!patientStore.records.length) {
    patientStore.loadRecords().catch(() => null)
  }
  loadMatches()
  loadFilterOptions()
  checkShareConsent()
})
</script>

<style scoped>
/* ── 当前病历徽标 ───────────────────────────────────────── */
.active-record {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-3);
  background: var(--bg-soft);
}

.active-record__body {
  flex: 1;
  min-width: 0;
}

.active-record__label {
  margin: 0;
  font-size: var(--fs-caption);
}

.active-record__value {
  margin: 2px 0 0;
  font-size: var(--fs-callout);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.active-record__switch {
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── 手动录入面板 ───────────────────────────────────────── */
.manual-entry {
  background: var(--brand-soft);
  border-color: var(--brand-soft);
}

.manual-entry__title {
  margin: 0 0 var(--s-1);
  color: var(--brand-hover);
  font-size: var(--fs-subtitle);
}

.manual-entry__hint {
  margin: 0 0 var(--s-3);
  font-size: var(--fs-callout);
  color: var(--text-dim);
  line-height: var(--lh-normal);
}

.manual-entry__fields {
  display: grid;
  gap: var(--s-3);
}

.manual-entry__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-2);
}

.field__label {
  display: block;
  margin-bottom: var(--s-1);
  font-size: var(--fs-callout);
  color: var(--text-dim);
}

.field__required {
  color: var(--red);
}

.manual-entry__actions {
  display: flex;
  gap: var(--s-2);
  margin-top: var(--s-3);
}

.manual-entry__btn {
  flex: 1;
}

/* ── 无基因提示条 ───────────────────────────────────────── */
.no-gene-hint {
  background: var(--amber-soft);
  border-color: var(--amber-soft);
  padding: var(--s-2) var(--s-3);
}

.no-gene-hint__text {
  margin: 0;
  font-size: var(--fs-callout);
  color: var(--amber-text);
  line-height: var(--lh-normal);
}

.no-gene-hint__link {
  color: var(--brand-hover);
  text-decoration: underline;
}

/* ── 诊断信息折叠 ───────────────────────────────────────── */
.record-summary-toggle {
  margin-bottom: var(--s-1);
}

.summary-trigger {
  cursor: pointer;
  font-size: var(--fs-body);
  color: var(--brand);
  font-weight: 500;
  padding: var(--s-2) 0;
  list-style: none;
  display: flex;
  align-items: center;
  gap: var(--s-1);
  min-height: var(--size-tap);
}

.summary-trigger::-webkit-details-marker {
  display: none;
}

.summary-trigger::before {
  content: '▸';
  transition: transform 0.2s;
}

details[open] > .summary-trigger::before {
  transform: rotate(90deg);
}

.toggle-hint {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  font-weight: 400;
}

/* ── 筛选栏 ─────────────────────────────────────────────
   窄屏 2 列网格（避免下拉框被挤窄/溢出），≥768 转为按内容横向铺排可换行。 */
.filter-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s-2);
}

.filter-row > select {
  min-width: 0;
}

@media (min-width: 768px) {
  .filter-row {
    display: flex;
    flex-wrap: wrap;
  }
  .filter-row > select {
    flex: 1 1 160px;
    width: auto;
  }
}

/* ── 结果网格 ───────────────────────────────────────────
   GOAL 2：移动单列，≥768 多列自适应铺满宽屏；卡片等高、可读。 */
.results-grid {
  display: grid;
  gap: var(--s-3);
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .results-grid {
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  }
}

.results-status {
  grid-column: 1 / -1;
  margin: 0;
  text-align: center;
  color: var(--brand);
  font-size: var(--fs-callout);
}

/* ── 试验卡片 ───────────────────────────────────────────
   flex 纵向布局，操作按钮锚定底部 (margin-top:auto) 保证网格内等高。 */
.match-card {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin-bottom: 0;
}

.match-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--s-2);
}

.match-card__name {
  margin: 0;
  font-size: var(--fs-subtitle);
  line-height: var(--lh-tight);
  flex: 1;
}

/* ── 分数胶囊（GOAL 4）：分档配色，展示百分比 + 文案标签 ── */
.score-pill {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: var(--s-1) var(--s-2);
  border-radius: var(--r-pill);
  white-space: nowrap;
  flex-shrink: 0;
  text-align: center;
}

.score-pill__pct {
  font-size: var(--fs-callout);
  font-weight: 700;
  line-height: 1.1;
}

.score-pill__label {
  font-size: var(--fs-caption);
  line-height: 1.1;
  opacity: 0.85;
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

/* ── 标签行 ─────────────────────────────────────────────── */
.match-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1);
}

.badge--gene {
  background: var(--mint-soft);
  color: var(--mint-text);
}

.match-card__meta {
  margin: 0;
  font-size: var(--fs-callout);
  color: var(--text-dim);
}

.match-card__actions {
  display: flex;
  gap: var(--s-2);
  margin-top: auto;
  padding-top: var(--s-1);
}

.match-card__btn {
  flex: 1;
}

/* PRD-2026Q3 §U3 痛点 A：每张卡片置顶的「为什么适合您家人」白话句。
   GOAL 5：薄荷绿底 + 左色条 + ✓ 图标，作为卡片内最显眼的信息块。 */
.why-fit {
  display: flex;
  align-items: flex-start;
  gap: var(--s-1);
  margin: 0;
  padding: var(--s-2) var(--s-3);
  background: var(--bg-mint);
  border-left: 3px solid var(--mint);
  border-radius: var(--r-sm);
  font-size: var(--fs-callout);
  line-height: var(--lh-normal);
  color: var(--mint-text);
}

.why-fit-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--mint);
  color: #fff;
  font-size: var(--fs-caption);
  line-height: 18px;
  text-align: center;
  font-weight: 700;
}

.why-fit-text {
  flex: 1;
  min-width: 0;
}

.why-fit-label {
  font-weight: 600;
  color: var(--mint-text);
}

/* ── 详细原因折叠 ───────────────────────────────────────── */
.reason-detail {
  margin: 0;
}

.reason-detail > summary {
  cursor: pointer;
  font-size: var(--fs-caption);
  color: var(--text-dim);
  list-style: none;
  padding: var(--s-1) 0;
}

.reason-detail > summary::-webkit-details-marker {
  display: none;
}

.reason-detail > summary::before {
  content: '▸ ';
  display: inline-block;
  transition: transform 0.15s;
}

.reason-detail[open] > summary::before {
  content: '▾ ';
}

.reason-detail__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-1);
  margin: var(--s-1) 0 0;
}

.reason-detail__chip {
  font-size: var(--fs-caption);
  padding: 2px var(--s-1);
  border-radius: var(--r-sm);
  background: var(--mint-soft);
  color: var(--mint-text);
}

/* ── 错误 / 空态 ───────────────────────────────────────── */
.error-card {
  color: var(--red-text);
}

.empty-state {
  text-align: center;
  padding: var(--s-6) var(--s-4);
}

.empty-state__icon {
  font-size: 32px;
  line-height: 1;
  margin-bottom: var(--s-2);
}

.empty-state__title {
  color: var(--text-dim);
  margin: 0 0 var(--s-1);
  font-size: var(--fs-body);
}

.empty-state__hint {
  font-size: var(--fs-callout);
  color: var(--text-muted);
  margin: 0 0 var(--s-3);
  line-height: var(--lh-relaxed);
}

.empty-state__actions {
  display: flex;
  gap: var(--s-2);
  justify-content: center;
  flex-wrap: wrap;
  margin-top: var(--s-2);
}

/* ── 加载骨架 ───────────────────────────────────────────── */
.skeleton-card {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin-bottom: 0;
}

.skeleton-line,
.skeleton-pill {
  background: var(--bg-soft);
  border-radius: var(--r-sm);
  position: relative;
  overflow: hidden;
}

.skeleton-line--title { height: 18px; width: 70%; }
.skeleton-line--reason { height: 32px; width: 100%; border-radius: var(--r-sm); }
.skeleton-line--meta { height: 12px; width: 50%; }

.skeleton-tags {
  display: flex;
  gap: var(--s-1);
}

.skeleton-pill {
  height: 18px;
  width: 64px;
  border-radius: var(--r-pill);
}

.skeleton-line::after,
.skeleton-pill::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.6), transparent);
  animation: skeleton-shimmer 1.3s infinite;
}

@keyframes skeleton-shimmer {
  100% { transform: translateX(100%); }
}

/* ── 分页 ───────────────────────────────────────────────── */
.pager {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: var(--s-2);
  margin-top: var(--s-4);
}

.pager__status {
  line-height: 2.2;
}
</style>
