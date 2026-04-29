<template>
  <div class="field-explainer">
    <div class="field-explainer__label-row">
      <span class="field-explainer__label">{{ entry?.label || fallbackLabel }}</span>
      <button
        type="button"
        class="field-explainer__help-btn"
        :aria-expanded="open"
        :aria-label="open ? '收起说明' : '这是什么？'"
        @click="toggle"
      >?</button>
    </div>

    <div class="field-explainer__control">
      <slot></slot>
    </div>

    <transition name="fx-slide">
      <div v-if="open && entry" class="field-explainer__panel">
        <p class="fx-line"><strong>白话解释：</strong>{{ entry.plain }}</p>
        <p class="fx-line"><strong>举个例子：</strong>{{ entry.example }}</p>
        <p class="fx-line"><strong>为什么问这个：</strong>{{ entry.whyAsk }}</p>
        <p class="fx-line fx-line--idk"><strong>不知道也没关系：</strong>{{ entry.iDontKnow }}</p>
        <button type="button" class="field-explainer__skip-btn" @click="onSkip">
          我不知道，先跳过
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
// PRD-2026Q3 §U2：把字段补全控件包一层「白话解释 + 我不知道逃生口」。
// 文案统一从仓库根 shared/copy/glossary.json 取（见 web/src/copy/glossary.ts re-export）。
import { computed, ref } from 'vue'
import { fields as glossaryFields } from '../copy/glossary'

const props = defineProps<{
  fieldKey: string
  fallbackLabel?: string
}>()

const emit = defineEmits<{
  (e: 'i-dont-know', fieldKey: string): void
}>()

const open = ref(false)
const entry = computed(() => glossaryFields[props.fieldKey])
const fallbackLabel = computed(() => props.fallbackLabel || props.fieldKey)

const toggle = () => { open.value = !open.value }

const onSkip = () => {
  emit('i-dont-know', props.fieldKey)
  open.value = false
}
</script>

<style scoped>
.field-explainer { margin-bottom: 4px; }
.field-explainer__label-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.field-explainer__label {
  font-size: 0.9rem;
  color: #374151;
  font-weight: 500;
}
.field-explainer__help-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid #93c5fd;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.field-explainer__help-btn:hover { background: #dbeafe; }
.field-explainer__control { /* slot 控件直接放在这里 */ }
.field-explainer__panel {
  margin-top: 8px;
  padding: 10px 12px;
  background: #f1f5f9;
  border-left: 4px solid #60a5fa;
  border-radius: 6px;
  color: #1f2937;
}
.fx-line {
  margin: 0 0 6px;
  font-size: 0.82rem;
  line-height: 1.55;
}
.fx-line:last-of-type { margin-bottom: 8px; }
.fx-line--idk { color: #475569; }
.fx-line strong { color: #0f172a; }
.field-explainer__skip-btn {
  display: block;
  width: 100%;
  padding: 8px 10px;
  font-size: 0.85rem;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #1d4ed8;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}
.field-explainer__skip-btn:hover { background: #f8fafc; border-color: #94a3b8; }

/* slide-down ≤ 200ms，无复杂动画 */
.fx-slide-enter-active, .fx-slide-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.fx-slide-enter-from, .fx-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
