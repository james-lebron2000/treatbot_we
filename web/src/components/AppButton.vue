<script setup lang="ts">
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'sm'

withDefaults(defineProps<{
  variant?: Variant
  size?: Size
  disabled?: boolean
  loading?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  variant: 'primary',
  size: 'md',
  disabled: false,
  loading: false,
  type: 'button',
})
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="['app-btn', `is-${variant}`, `is-${size}`, { 'is-loading': loading }]"
  >
    <span v-if="loading" class="spinner" aria-hidden="true" />
    <span class="label"><slot /></span>
  </button>
</template>

<style scoped>
.app-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  border: 1px solid transparent;
  border-radius: var(--r-md);
  font-family: var(--font-sans);
  font-size: var(--fs-callout);
  font-weight: 600;
  line-height: var(--lh-normal);
  cursor: pointer;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s, transform 0.1s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.app-btn.is-md { padding: var(--s-3) var(--s-4); min-height: 40px; }
.app-btn.is-sm { padding: var(--s-2) var(--s-3); min-height: 32px; font-size: var(--fs-caption); }

.app-btn:focus-visible { outline: none; box-shadow: var(--shadow-focus); }
.app-btn:active:not(:disabled) { transform: scale(0.98); }

.app-btn.is-primary {
  background: var(--brand);
  color: #fff;
}
.app-btn.is-primary:hover:not(:disabled) { background: var(--brand-hover); }

.app-btn.is-secondary {
  background: var(--brand-soft);
  color: var(--brand);
}
.app-btn.is-secondary:hover:not(:disabled) { background: #c7dcfa; }

.app-btn.is-ghost {
  background: transparent;
  color: var(--text);
  border-color: var(--line);
}
.app-btn.is-ghost:hover:not(:disabled) { background: var(--bg-soft); }

.app-btn.is-danger {
  background: var(--red);
  color: #fff;
}
.app-btn.is-danger:hover:not(:disabled) { background: #b91c1c; }

.app-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.app-btn.is-loading .label { opacity: 0.7; }

.spinner {
  width: 14px; height: 14px;
  border: 2px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: app-btn-spin 0.7s linear infinite;
}
@keyframes app-btn-spin {
  to { transform: rotate(360deg); }
}
</style>
