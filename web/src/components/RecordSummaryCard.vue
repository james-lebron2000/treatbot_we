<template>
  <div class="summary-card">
    <div class="summary-header">
      <h3 class="summary-title">📋 诊断摘要</h3>
      <span class="fill-rate" :class="fillRateClass">{{ fillCount }}/{{ totalCount }} 项已识别</span>
    </div>

    <!-- 主诊断区域 -->
    <div class="diagnosis-hero" v-if="record.diagnosis">
      <div class="hero-label">诊断</div>
      <div class="hero-value">{{ record.diagnosis }}</div>
      <div class="hero-tags">
        <span v-if="record.stage" class="hero-tag stage">{{ record.stage }}</span>
        <span v-if="hasValue('tnmStage')" class="hero-tag stage">{{ record.tnmStage }}</span>
        <span v-if="record.ecog !== '' && record.ecog != null" class="hero-tag ecog">ECOG {{ record.ecog }}</span>
      </div>
      <!-- 副信息行：年龄 / 性别 / 病理类型 / 医院 / 确诊日期 -->
      <div v-if="heroMetaLine" class="hero-meta">{{ heroMetaLine }}</div>
    </div>

    <!-- 详细字段（核心三件） -->
    <div class="summary-grid">
      <!-- 基因突变 -->
      <div class="field-row" v-if="hasValue('geneMutation')">
        <div class="field-icon">🧬</div>
        <div class="field-content">
          <div class="field-label">基因检测结果</div>
          <div class="field-value gene">{{ record.geneMutation }}</div>
        </div>
      </div>

      <!-- PD-L1 -->
      <div class="field-row" v-if="hasValue('pdl1')">
        <div class="field-icon">🔬</div>
        <div class="field-content">
          <div class="field-label">PD-L1 表达</div>
          <div class="field-value">{{ record.pdl1 }}</div>
        </div>
      </div>

      <!-- 治疗史 -->
      <div class="field-row" v-if="hasValue('treatment')">
        <div class="field-icon">💊</div>
        <div class="field-content">
          <div class="field-label">
            既往治疗
            <span v-if="hasValue('treatmentLine')" class="line-badge">第{{ record.treatmentLine }}线</span>
          </div>
          <div class="field-value treatment">{{ record.treatment }}</div>
        </div>
      </div>

      <!-- 转移部位 -->
      <div class="field-row" v-if="metastasisSites.length">
        <div class="field-icon">🩸</div>
        <div class="field-content">
          <div class="field-label">转移部位</div>
          <div class="field-value">{{ metastasisSites.join('、') }}</div>
        </div>
      </div>

      <!-- 合并症 -->
      <div class="field-row" v-if="comorbidities.length">
        <div class="field-icon">📌</div>
        <div class="field-content">
          <div class="field-label">合并症</div>
          <div class="field-value">{{ comorbidities.join('、') }}</div>
        </div>
      </div>
    </div>

    <!-- 病程时间线 -->
    <section v-if="timeline.length" class="summary-section">
      <button class="section-header" type="button" @click="toggle('timeline')">
        <span class="section-title">🗓️ 病程时间线</span>
        <span class="section-toggle">{{ expanded.timeline ? '收起' : '展开' }}</span>
      </button>
      <p class="section-hint">这位患者从发现到现在，发生过哪些关键节点。</p>
      <div v-if="expanded.timeline || timelineCollapsedItems.length === timeline.length" class="section-body">
        <ul class="timeline">
          <li
            v-for="(t, i) in (expanded.timeline ? timeline : timelineCollapsedItems)"
            :key="`tl-${i}`"
            class="timeline-item"
            :class="`tl-${t.type || 'other'}`"
          >
            <div class="tl-dot"></div>
            <div class="tl-body">
              <div class="tl-date">{{ t.date }}</div>
              <div class="tl-event">{{ t.event }}</div>
            </div>
          </li>
        </ul>
        <button
          v-if="!expanded.timeline && timeline.length > 3"
          class="section-more"
          type="button"
          @click="toggle('timeline')"
        >展开更多 ({{ timeline.length - 3 }} 条)</button>
      </div>
      <div v-else class="section-body">
        <ul class="timeline">
          <li
            v-for="(t, i) in timelineCollapsedItems"
            :key="`tl-c-${i}`"
            class="timeline-item"
            :class="`tl-${t.type || 'other'}`"
          >
            <div class="tl-dot"></div>
            <div class="tl-body">
              <div class="tl-date">{{ t.date }}</div>
              <div class="tl-event">{{ t.event }}</div>
            </div>
          </li>
        </ul>
        <button class="section-more" type="button" @click="toggle('timeline')">
          展开更多 ({{ timeline.length - timelineCollapsedItems.length }} 条)
        </button>
      </div>
    </section>

    <!-- 分子特征 -->
    <section v-if="hasMolecular" class="summary-section">
      <button class="section-header" type="button" @click="toggle('molecular')">
        <span class="section-title">🧬 分子特征</span>
        <span class="section-toggle">{{ expanded.molecular ? '收起' : '展开' }}</span>
      </button>
      <p class="section-hint">肿瘤上有哪些「开关」被异常打开了。</p>
      <div v-if="expanded.molecular" class="section-body">
        <div v-if="molecular.drivers && molecular.drivers.length" class="mol-block">
          <div class="mol-block-title">驱动突变（Driver）</div>
          <div class="chip-row">
            <span v-for="(g, i) in molecular.drivers" :key="`d-${i}`" class="chip chip-driver">
              {{ g.gene }} <span class="chip-sub">{{ g.variant }}</span>
            </span>
          </div>
        </div>
        <div v-if="molecular.actionable && molecular.actionable.length" class="mol-block">
          <div class="mol-block-title">可干预靶点（Actionable）</div>
          <div class="chip-row">
            <span v-for="(g, i) in molecular.actionable" :key="`a-${i}`" class="chip chip-actionable">
              {{ g.gene }} <span class="chip-sub">{{ g.variant }}</span>
            </span>
          </div>
        </div>
        <div v-if="molecular.lossOfFunction && molecular.lossOfFunction.length" class="mol-block">
          <div class="mol-block-title">功能缺失（LoF）</div>
          <div class="chip-row">
            <span v-for="(g, i) in molecular.lossOfFunction" :key="`l-${i}`" class="chip chip-lof">
              {{ g.gene }} <span class="chip-sub">{{ g.variant }}</span>
            </span>
          </div>
        </div>
        <div v-if="molecular.vus && molecular.vus.length" class="mol-block">
          <div class="mol-block-title">意义未明（VUS）</div>
          <div class="chip-row">
            <span v-for="(g, i) in molecular.vus" :key="`v-${i}`" class="chip chip-vus">
              {{ g.gene }} <span class="chip-sub">{{ g.variant }}</span>
            </span>
          </div>
        </div>
        <div v-if="biomarkers && hasAnyBiomarker" class="mol-block">
          <div class="mol-block-title">综合标志物</div>
          <div class="biomarker-grid">
            <div v-if="biomarkers.tmb" class="bm-item">
              <span class="bm-key">TMB</span>
              <span class="bm-val">{{ biomarkers.tmb.value }} ({{ biomarkers.tmb.level }})</span>
            </div>
            <div v-if="biomarkers.msi" class="bm-item">
              <span class="bm-key">MSI</span><span class="bm-val">{{ biomarkers.msi }}</span>
            </div>
            <div v-if="biomarkers.mmr" class="bm-item">
              <span class="bm-key">MMR</span><span class="bm-val">{{ biomarkers.mmr }}</span>
            </div>
            <div v-if="biomarkers.pdl1" class="bm-item">
              <span class="bm-key">PD-L1</span><span class="bm-val">{{ biomarkers.pdl1 }}</span>
            </div>
            <div v-if="biomarkers.her2" class="bm-item">
              <span class="bm-key">HER2</span><span class="bm-val">{{ biomarkers.her2 }}</span>
            </div>
            <div v-if="biomarkers.claudin182" class="bm-item">
              <span class="bm-key">Claudin18.2</span><span class="bm-val">{{ biomarkers.claudin182 }}</span>
            </div>
          </div>
        </div>
        <div v-if="molecular.drugMetabolism && molecular.drugMetabolism.length" class="mol-block">
          <div class="mol-block-title">药物代谢相关基因</div>
          <ul class="dm-list">
            <li v-for="(d, i) in molecular.drugMetabolism" :key="`dm-${i}`">
              <strong>{{ d.gene }}</strong>（{{ d.genotype }}）— {{ d.implication }}
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- 类器官药敏 -->
    <section v-if="hasOrganoid" class="summary-section">
      <button class="section-header" type="button" @click="toggle('organoid')">
        <span class="section-title">🧪 类器官药敏</span>
        <span class="section-toggle">{{ expanded.organoid ? '收起' : '展开' }}</span>
      </button>
      <p class="section-hint">把肿瘤细胞拿出来在实验室里试药，看哪些有效、哪些无效。</p>
      <div v-if="expanded.organoid" class="section-body">
        <div v-if="organoid.sensitive && organoid.sensitive.length" class="mol-block">
          <div class="mol-block-title">敏感（推荐参考）</div>
          <div class="chip-row">
            <span v-for="(d, i) in organoid.sensitive" :key="`s-${i}`" class="chip chip-sens">{{ d }}</span>
          </div>
        </div>
        <div v-if="organoid.resistant && organoid.resistant.length" class="mol-block">
          <div class="mol-block-title">耐药（不建议）</div>
          <div class="chip-row">
            <span v-for="(d, i) in organoid.resistant" :key="`r-${i}`" class="chip chip-resist">{{ d }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- 影像与肿瘤标志物 -->
    <section v-if="imaging.length || tumorMarkers.length" class="summary-section">
      <button class="section-header" type="button" @click="toggle('imaging')">
        <span class="section-title">🖼️ 影像与肿瘤标志物</span>
        <span class="section-toggle">{{ expanded.imaging ? '收起' : '展开' }}</span>
      </button>
      <p class="section-hint">肿瘤现在长在哪、长得多大；血里的「报警值」是不是在升高。</p>
      <div v-if="expanded.imaging" class="section-body">
        <div v-if="imaging.length" class="mol-block">
          <div class="mol-block-title">影像</div>
          <ul class="img-list">
            <li v-for="(im, i) in imaging" :key="`im-${i}`">
              <span class="img-date">{{ im.date }}</span>
              <span class="img-mod">{{ im.modality }}</span>
              <span class="img-find">{{ im.findings }}</span>
            </li>
          </ul>
        </div>
        <div v-if="tumorMarkers.length" class="mol-block">
          <div class="mol-block-title">肿瘤标志物</div>
          <div class="marker-grid">
            <div v-for="(m, i) in tumorMarkers" :key="`tm-${i}`" class="marker-item">
              <span class="bm-key">{{ m.name }}</span>
              <span class="bm-val">
                {{ m.value }}<span v-if="m.unit"> {{ m.unit }}</span>
                <span v-if="m.flag" class="marker-flag">{{ m.flag }}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 治疗史 -->
    <section v-if="treatmentHistory.length" class="summary-section">
      <button class="section-header" type="button" @click="toggle('treatments')">
        <span class="section-title">💊 治疗史</span>
        <span class="section-toggle">{{ expanded.treatments ? '收起' : '展开' }}</span>
      </button>
      <p class="section-hint">用过哪些方案、各自的反应是什么。</p>
      <div v-if="expanded.treatments" class="section-body">
        <ul class="th-list">
          <li v-for="(t, i) in treatmentHistory" :key="`th-${i}`">
            <div class="th-name">{{ t.name }}</div>
            <div class="th-meta">
              <span v-if="t.startDate || t.endDate">{{ t.startDate || '?' }} ~ {{ t.endDate || '至今' }}</span>
              <span v-if="t.response" class="th-response">{{ t.response }}</span>
            </div>
          </li>
        </ul>
      </div>
    </section>

    <!-- vMTB 推荐方案 -->
    <section v-if="vMTBPlans.length" class="summary-section">
      <button class="section-header" type="button" @click="toggle('vmtb')">
        <span class="section-title">🧠 vMTB 推荐方案</span>
        <span class="section-toggle">{{ expanded.vmtb ? '收起' : '展开' }}</span>
      </button>
      <p class="section-hint">虚拟多学科会诊给出的几条候选思路 —— 仅供医生参考，最终由医生决定。</p>
      <div v-if="expanded.vmtb" class="section-body">
        <div v-for="(p, i) in vMTBPlans" :key="`mtb-${i}`" class="vmtb-card">
          <div class="vmtb-label">{{ p.label }}</div>
          <div class="vmtb-regimen">{{ p.regimen }}</div>
          <div v-if="p.rationale" class="vmtb-rationale">理由：{{ p.rationale }}</div>
          <div v-if="p.monitoring" class="vmtb-monitor">监测：{{ p.monitoring }}</div>
        </div>
      </div>
    </section>

    <!-- 待补充信息 -->
    <section v-if="infoGaps.length" class="summary-section">
      <button class="section-header" type="button" @click="toggle('gaps')">
        <span class="section-title">⚠️ 待补充信息</span>
        <span class="section-toggle">{{ expanded.gaps ? '收起' : '展开' }}</span>
      </button>
      <p class="section-hint">下次去医院时，这些资料带上会更准。</p>
      <div v-if="expanded.gaps" class="section-body">
        <ul class="gap-list">
          <li v-for="(g, i) in infoGaps" :key="`gap-${i}`">{{ g }}</li>
        </ul>
      </div>
    </section>

    <!-- 下一步建议 -->
    <section v-if="priorityActions.length" class="summary-section">
      <button class="section-header" type="button" @click="toggle('actions')">
        <span class="section-title">🎯 下一步建议</span>
        <span class="section-toggle">{{ expanded.actions ? '收起' : '展开' }}</span>
      </button>
      <p class="section-hint">接下来最值得做的几件事，按紧急程度排序。</p>
      <div v-if="expanded.actions" class="section-body">
        <ul class="action-list">
          <li v-for="(a, i) in priorityActions" :key="`act-${i}`">
            <span class="urgency-badge" :class="`u-${a.urgency || 'medium'}`">
              {{ urgencyLabel(a.urgency) }}
            </span>
            <span class="action-label">{{ a.label }}</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- 未识别项提示 -->
    <div class="missing-hint" v-if="missingLabels.length">
      <span class="missing-icon">⚠️</span>
      <span>未识别到：{{ missingLabels.join('、') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { FIELD_SCHEMAS } from '../utils/schema'

interface Variant { gene: string; variant: string; impact?: string }
interface VusEntry { gene: string; variant: string }
interface Biomarkers {
  tmb?: { value: number; level: string }
  msi?: string
  mmr?: string
  pdl1?: string
  her2?: string
  claudin182?: string
  hla?: string
}
interface DrugMetabolism { gene: string; genotype: string; implication: string }
interface MolecularBlock {
  drivers?: Variant[]
  actionable?: Variant[]
  lossOfFunction?: Variant[]
  vus?: VusEntry[]
  biomarkers?: Biomarkers
  drugMetabolism?: DrugMetabolism[]
}
interface TimelineEntry { date: string; event: string; type?: string }
interface ImagingEntry { date: string; modality: string; findings: string }
interface TumorMarker { name: string; value: number | string; unit?: string; flag?: string }
interface TreatmentHistoryEntry { name: string; startDate?: string; endDate?: string; response?: string }
interface VMTBPlan { label: string; regimen: string; rationale?: string; monitoring?: string }
interface PriorityAction { label: string; urgency?: 'high' | 'medium' | 'low' | string }

export interface PatientRecord {
  diagnosis?: string
  stage?: string
  geneMutation?: string
  pdl1?: string
  ecog?: string
  treatment?: string
  treatmentLine?: string
  confidence?: number
  tnmStage?: string
  pathologyType?: string
  age?: number
  sex?: string
  weight?: number
  hospital?: string
  diagnosisDate?: string
  comorbidities?: string[]
  metastasisSites?: string[]
  surgicalHistory?: { name: string; date?: string }[]
  timeline?: TimelineEntry[]
  molecular?: MolecularBlock
  organoidDrugSensitivity?: { sensitive?: string[]; resistant?: string[] }
  imaging?: ImagingEntry[]
  tumorMarkers?: TumorMarker[]
  treatmentHistory?: TreatmentHistoryEntry[]
  vMTBPlans?: VMTBPlan[]
  infoGaps?: string[]
  priorityActions?: PriorityAction[]
  [key: string]: unknown
}

const props = defineProps<{
  record: PatientRecord
}>()

const hasValue = (key: string) => {
  const v = (props.record as Record<string, unknown>)[key]
  return v !== undefined && v !== null && `${v}`.trim() !== '' && v !== '未识别到'
}

const coreFields = ['diagnosis', 'stage', 'geneMutation', 'ecog', 'treatment', 'treatmentLine', 'pdl1']

const fillCount = computed(() => coreFields.filter(k => hasValue(k)).length)
const totalCount = coreFields.length

const fillRateClass = computed(() => {
  const ratio = fillCount.value / totalCount
  if (ratio >= 0.7) return 'good'
  if (ratio >= 0.4) return 'medium'
  return 'low'
})

const missingLabels = computed(() => {
  return FIELD_SCHEMAS
    .filter(f => f.required && !hasValue(f.key))
    .map(f => f.friendlyLabel)
})

// 折叠状态
const expanded = reactive<Record<string, boolean>>({
  timeline: false,
  molecular: false,
  organoid: false,
  imaging: false,
  treatments: false,
  vmtb: false,
  gaps: false,
  actions: false
})

const toggle = (key: string) => { expanded[key] = !expanded[key] }

// 衍生字段
const heroMetaLine = computed(() => {
  const parts: string[] = []
  if (props.record.age) parts.push(`${props.record.age} 岁`)
  if (props.record.sex) parts.push(props.record.sex)
  if (props.record.pathologyType) parts.push(props.record.pathologyType)
  if (props.record.hospital) parts.push(props.record.hospital)
  if (props.record.diagnosisDate) parts.push(`确诊 ${props.record.diagnosisDate}`)
  return parts.join(' · ')
})

const metastasisSites = computed<string[]>(() => Array.isArray(props.record.metastasisSites) ? props.record.metastasisSites : [])
const comorbidities = computed<string[]>(() => Array.isArray(props.record.comorbidities) ? props.record.comorbidities : [])
const timeline = computed<TimelineEntry[]>(() => Array.isArray(props.record.timeline) ? props.record.timeline : [])
const timelineCollapsedItems = computed(() => timeline.value.slice(0, 3))

const molecular = computed<MolecularBlock>(() => props.record.molecular || {})
const biomarkers = computed<Biomarkers | undefined>(() => molecular.value.biomarkers)
const hasMolecular = computed(() => {
  const m = molecular.value
  return !!(
    (m.drivers && m.drivers.length) ||
    (m.actionable && m.actionable.length) ||
    (m.lossOfFunction && m.lossOfFunction.length) ||
    (m.vus && m.vus.length) ||
    hasAnyBiomarker.value ||
    (m.drugMetabolism && m.drugMetabolism.length)
  )
})
const hasAnyBiomarker = computed(() => {
  const b = biomarkers.value
  if (!b) return false
  return !!(b.tmb || b.msi || b.mmr || b.pdl1 || b.her2 || b.claudin182 || b.hla)
})

const organoid = computed(() => props.record.organoidDrugSensitivity || { sensitive: [], resistant: [] })
const hasOrganoid = computed(() => {
  const o = organoid.value
  return !!((o.sensitive && o.sensitive.length) || (o.resistant && o.resistant.length))
})

const imaging = computed<ImagingEntry[]>(() => Array.isArray(props.record.imaging) ? props.record.imaging : [])
const tumorMarkers = computed<TumorMarker[]>(() => Array.isArray(props.record.tumorMarkers) ? props.record.tumorMarkers : [])
const treatmentHistory = computed<TreatmentHistoryEntry[]>(() => Array.isArray(props.record.treatmentHistory) ? props.record.treatmentHistory : [])
const vMTBPlans = computed<VMTBPlan[]>(() => Array.isArray(props.record.vMTBPlans) ? props.record.vMTBPlans : [])
const infoGaps = computed<string[]>(() => Array.isArray(props.record.infoGaps) ? props.record.infoGaps : [])
const priorityActions = computed<PriorityAction[]>(() => Array.isArray(props.record.priorityActions) ? props.record.priorityActions : [])

const urgencyLabel = (u?: string) => {
  if (u === 'high') return '紧急'
  if (u === 'low') return '常规'
  return '建议'
}
</script>

<style scoped>
.summary-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  position: relative;
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.summary-title {
  margin: 0;
  font-size: 1rem;
  color: #1f2937;
}

.fill-rate {
  font-size: 0.78rem;
  padding: 3px 10px;
  border-radius: 12px;
  font-weight: 500;
}

.fill-rate.good { background: #dcfce7; color: #166534; }
.fill-rate.medium { background: #fef3c7; color: #92400e; }
.fill-rate.low { background: #fee2e2; color: #991b1b; }

/* 主诊断区域 */
.diagnosis-hero {
  background: linear-gradient(135deg, #eff6ff, #f0f9ff);
  border-radius: 10px;
  padding: 14px 16px;
  margin-bottom: 12px;
}

.hero-label {
  font-size: 0.78rem;
  color: #6b7280;
  margin-bottom: 4px;
}

.hero-value {
  font-size: 1.15rem;
  font-weight: 600;
  color: #1e40af;
  line-height: 1.4;
}

.hero-tags {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.hero-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 500;
}

.hero-tag.stage { background: #fef3c7; color: #92400e; }
.hero-tag.ecog { background: #dbeafe; color: #1e40af; }

.hero-meta {
  margin-top: 8px;
  font-size: 0.78rem;
  color: #4b5563;
  line-height: 1.5;
}

/* 字段行 */
.summary-grid {
  display: grid;
  gap: 10px;
}

.field-row {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 8px;
}

.field-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
  width: 24px;
  text-align: center;
  padding-top: 2px;
}

.field-content { flex: 1; min-width: 0; }

.field-label {
  font-size: 0.78rem;
  color: #6b7280;
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.field-value {
  font-size: 0.92rem;
  color: #1f2937;
  line-height: 1.5;
  word-break: break-word;
}

.field-value.gene { color: #7c3aed; font-weight: 500; }
.field-value.treatment { color: #374151; }

.line-badge {
  display: inline-block;
  padding: 0 6px;
  background: #f3e8ff;
  color: #7c3aed;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 500;
}

/* Section 折叠样式 */
.summary-section {
  margin-top: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background: #f9fafb;
  border: none;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.section-title {
  font-size: 0.92rem;
  font-weight: 600;
  color: #1f2937;
}

.section-toggle {
  font-size: 0.78rem;
  color: #2563eb;
}

.section-hint {
  margin: 6px 12px 0;
  font-size: 0.78rem;
  color: #6b7280;
  line-height: 1.5;
}

.section-body { padding: 8px 12px 12px; }

.section-more {
  display: block;
  margin: 8px auto 0;
  background: none;
  border: 1px dashed #cbd5e1;
  color: #2563eb;
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 0.78rem;
  cursor: pointer;
}

/* Timeline */
.timeline { list-style: none; padding: 0; margin: 0; }
.timeline-item {
  position: relative;
  padding: 8px 0 8px 18px;
  border-left: 2px solid #e5e7eb;
}
.timeline-item:last-child { padding-bottom: 0; }
.tl-dot {
  position: absolute;
  left: -6px;
  top: 12px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #93c5fd;
}
.timeline-item.tl-surgery .tl-dot { background: #f97316; }
.timeline-item.tl-progression .tl-dot { background: #ef4444; }
.timeline-item.tl-molecular .tl-dot { background: #7c3aed; }
.timeline-item.tl-treatment .tl-dot { background: #10b981; }
.timeline-item.tl-imaging .tl-dot { background: #0ea5e9; }
.timeline-item.tl-diagnosis .tl-dot { background: #1e40af; }
.tl-date { font-size: 0.78rem; color: #6b7280; }
.tl-event { font-size: 0.88rem; color: #1f2937; line-height: 1.45; }

/* 分子特征 */
.mol-block { margin-top: 10px; }
.mol-block:first-child { margin-top: 0; }
.mol-block-title {
  font-size: 0.78rem;
  color: #6b7280;
  margin-bottom: 6px;
}
.chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 500;
}
.chip-sub { font-size: 0.72rem; opacity: 0.8; font-weight: 400; }
.chip-driver { background: #fee2e2; color: #991b1b; }
.chip-actionable { background: #dcfce7; color: #166534; }
.chip-lof { background: #fde68a; color: #92400e; }
.chip-vus { background: #e5e7eb; color: #374151; }
.chip-sens { background: #dcfce7; color: #166534; }
.chip-resist { background: #f3f4f6; color: #6b7280; }

.biomarker-grid, .marker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 6px;
}
.bm-item, .marker-item {
  display: flex;
  justify-content: space-between;
  padding: 6px 10px;
  background: #f9fafb;
  border-radius: 6px;
  font-size: 0.82rem;
}
.bm-key { color: #6b7280; }
.bm-val { color: #1f2937; font-weight: 500; }
.marker-flag { color: #dc2626; margin-left: 4px; font-weight: 600; }

.dm-list, .img-list, .th-list, .gap-list, .action-list {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.55;
}
.dm-list li, .img-list li, .gap-list li {
  padding: 6px 0;
  border-bottom: 1px dashed #f1f5f9;
  color: #374151;
}
.dm-list li:last-child, .img-list li:last-child, .gap-list li:last-child { border-bottom: none; }
.img-list .img-date { color: #6b7280; margin-right: 6px; }
.img-list .img-mod { color: #1e40af; margin-right: 6px; font-weight: 500; }
.img-list .img-find { color: #374151; }

/* 治疗史 */
.th-list li {
  padding: 8px 10px;
  margin-bottom: 6px;
  background: #f9fafb;
  border-radius: 6px;
}
.th-list li:last-child { margin-bottom: 0; }
.th-name { font-weight: 600; color: #1f2937; }
.th-meta { font-size: 0.78rem; color: #6b7280; display: flex; gap: 8px; flex-wrap: wrap; margin-top: 2px; }
.th-response { color: #b45309; }

/* vMTB */
.vmtb-card {
  margin-bottom: 8px;
  padding: 10px 12px;
  border-radius: 8px;
  background: linear-gradient(135deg, #eff6ff, #f0fdf4);
  border: 1px solid #c7d2fe;
}
.vmtb-card:last-child { margin-bottom: 0; }
.vmtb-label {
  font-size: 0.78rem;
  color: #4338ca;
  font-weight: 600;
  margin-bottom: 2px;
}
.vmtb-regimen {
  font-size: 0.95rem;
  color: #1f2937;
  font-weight: 500;
  line-height: 1.4;
}
.vmtb-rationale, .vmtb-monitor {
  font-size: 0.8rem;
  color: #4b5563;
  margin-top: 4px;
  line-height: 1.5;
}

/* gap / actions */
.gap-list li::before { content: '· '; color: #f59e0b; }
.action-list li {
  padding: 6px 0;
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px dashed #f1f5f9;
}
.action-list li:last-child { border-bottom: none; }
.urgency-badge {
  flex-shrink: 0;
  font-size: 0.72rem;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 500;
}
.u-high { background: #fee2e2; color: #991b1b; }
.u-medium { background: #fef3c7; color: #92400e; }
.u-low { background: #dbeafe; color: #1e40af; }
.action-label { color: #1f2937; }

/* 未识别提示 */
.missing-hint {
  margin-top: 10px;
  padding: 8px 12px;
  background: #fffbeb;
  border-radius: 8px;
  font-size: 0.82rem;
  color: #92400e;
  display: flex;
  align-items: center;
  gap: 6px;
}

.missing-icon { flex-shrink: 0; }
</style>
