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
        <span v-if="record.ecog !== '' && record.ecog != null" class="hero-tag ecog">ECOG {{ record.ecog }}</span>
      </div>
    </div>

    <!-- 详细字段 -->
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
    </div>

    <!-- 未识别项提示 -->
    <div class="missing-hint" v-if="missingLabels.length">
      <span class="missing-icon">⚠️</span>
      <span>未识别到：{{ missingLabels.join('、') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { FIELD_SCHEMAS } from '../utils/schema'

const props = defineProps<{
  record: Record<string, unknown>
}>()

const hasValue = (key: string) => {
  const v = props.record[key]
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
}

.hero-tag {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 500;
}

.hero-tag.stage {
  background: #fef3c7;
  color: #92400e;
}

.hero-tag.ecog {
  background: #dbeafe;
  color: #1e40af;
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

.field-content {
  flex: 1;
  min-width: 0;
}

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

.field-value.gene {
  color: #7c3aed;
  font-weight: 500;
}

.field-value.treatment {
  color: #374151;
}

.line-badge {
  display: inline-block;
  padding: 0 6px;
  background: #f3e8ff;
  color: #7c3aed;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 500;
}

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

.missing-icon {
  flex-shrink: 0;
}
</style>
