<template>
  <div ref="root" class="field-explainer">
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
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { fields as glossaryFields } from '../copy/glossary'

const props = defineProps<{
  fieldKey: string
  fallbackLabel?: string
}>()

const emit = defineEmits<{
  (e: 'i-dont-know', fieldKey: string): void
}>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const entry = computed(() => glossaryFields[props.fieldKey])
const fallbackLabel = computed(() => props.fallbackLabel || props.fieldKey)

const close = () => { open.value = false }
const toggle = () => { open.value = !open.value }

const onDocPointerDown = (ev: PointerEvent) => {
  if (root.value && !root.value.contains(ev.target as Node)) close()
}
const onKeydown = (ev: KeyboardEvent) => {
  if (ev.key === 'Escape') close()
}

// 只在面板打开时挂全局监听：Esc 收起 + 点击外部收起（popover 行为）
watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onDocPointerDown, true)
    document.addEventListener('keydown', onKeydown)
  } else {
    document.removeEventListener('pointerdown', onDocPointerDown, true)
    document.removeEventListener('keydown', onKeydown)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
})

const onSkip = () => {
  emit('i-dont-know', props.fieldKey)
  open.value = false
}
</script>

<style scoped>
.field-explainer { margin-bottom: var(--s-1); }
.field-explainer__label-row {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  margin-bottom: var(--s-1);
}
.field-explainer__label {
  font-size: var(--fs-callout);
  color: var(--text-dim);
  font-weight: 500;
}
.field-explainer__help-btn {
  /* 视觉保持 ~20px 圆点，命中区域用伪元素扩到 44px（移动端 a11y） */
  position: relative;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid var(--brand-soft);
  background: var(--bg-soft);
  color: var(--brand);
  font-size: var(--fs-caption);
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.field-explainer__help-btn::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--size-tap);
  height: var(--size-tap);
  transform: translate(-50%, -50%);
}
.field-explainer__help-btn:hover { background: var(--brand-soft); }
.field-explainer__help-btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
.field-explainer__control { /* slot 控件直接放在这里 */ }
.field-explainer__panel {
  margin-top: var(--s-2);
  padding: var(--s-3);
  background: var(--bg-soft);
  border-left: 4px solid var(--brand);
  border-radius: var(--r-sm);
  color: var(--text);
}
.fx-line {
  margin: 0 0 var(--s-1);
  font-size: var(--fs-caption);
  line-height: var(--lh-relaxed);
}
.fx-line:last-of-type { margin-bottom: var(--s-2); }
.fx-line--idk { color: var(--text-dim); }
.fx-line strong { color: var(--text); }
.field-explainer__skip-btn {
  display: block;
  width: 100%;
  min-height: var(--size-tap);
  padding: var(--s-2) var(--s-3);
  font-size: var(--fs-callout);
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--brand);
  border-radius: var(--r-sm);
  cursor: pointer;
  font-weight: 500;
}
.field-explainer__skip-btn:hover { background: var(--bg-soft); border-color: var(--text-muted); }
.field-explainer__skip-btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

/* slide-down ≤ 200ms，无复杂动画 */
.fx-slide-enter-active, .fx-slide-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.fx-slide-enter-from, .fx-slide-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .fx-slide-enter-active, .fx-slide-leave-active { transition: none; }
  .fx-slide-enter-from, .fx-slide-leave-to { transform: none; }
}
</style>
