<template>
  <!-- 申请状态药丸：文案 + 色调均来自 shared/copy/statuses.js 单一来源。
       未知状态走中性兜底，直接显示原始 key，避免静默丢信息。 -->
  <span :class="['status-pill', `tone-${tone}`]">{{ label }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
// @ts-ignore — plain CJS module（与 shared/copy/help.js、upload.js 同源，无 .d.ts）
import statuses from '@shared/copy/statuses.js'

type Audience = 'patient' | 'cro'
type StatusEntry = { patient: string; cro: string; tone: string }

const props = withDefaults(
  defineProps<{
    status: string
    audience?: Audience
  }>(),
  { audience: 'patient' }
)

const statusMap = (statuses as { applicationStatus: Record<string, StatusEntry> }).applicationStatus

const entry = computed<StatusEntry | undefined>(() => statusMap[props.status])

// 文案：按受众取 patient / cro；未知状态回退到原始 key（不静默丢失）。
const label = computed(() => {
  const e = entry.value
  if (!e) return props.status
  return props.audience === 'cro' ? e.cro : e.patient
})

// 色调：映射到 token class；未知状态用中性 muted。
const tone = computed(() => entry.value?.tone || 'muted')
</script>

<style scoped>
/* token-only：圆角 / 字号 / 间距全部走 tokens.css，无裸 hex（除 #fff，本组件不需要）。 */
.status-pill {
  display: inline-block;
  padding: 3px var(--s-2);
  border-radius: var(--r-pill);
  font-size: var(--fs-caption);
  line-height: var(--lh-tight);
  font-weight: 500;
  white-space: nowrap;
}

.tone-amber {
  background: var(--amber-soft);
  color: var(--amber-text);
}

.tone-brand {
  background: var(--brand-soft);
  color: var(--brand-hover);
}

.tone-mint {
  background: var(--mint-soft);
  color: var(--mint-text);
}

.tone-red {
  background: var(--red-soft);
  color: var(--red-text);
}

.tone-muted {
  background: var(--bg-soft);
  color: var(--text-muted);
}
</style>
