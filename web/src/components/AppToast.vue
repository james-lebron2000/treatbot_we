<script setup lang="ts">
import { toastQueue, dismiss } from '../composables/useToast'
import type { ToastVariant } from '../composables/useToast'

// Errors and warnings interrupt (assertive); info/success wait their turn.
const isUrgent = (v: ToastVariant) => v === 'error' || v === 'warning'
</script>

<template>
  <Teleport to="body">
    <div class="app-toast-host" aria-atomic="true">
      <TransitionGroup name="toast">
        <div
          v-for="t in toastQueue"
          :key="t.id"
          class="app-toast"
          :class="`is-${t.variant}`"
          :role="isUrgent(t.variant) ? 'alert' : 'status'"
          :aria-live="isUrgent(t.variant) ? 'assertive' : 'polite'"
          aria-atomic="true"
          @click="dismiss(t.id)"
        >
          <span class="app-toast__dot" aria-hidden="true" />
          <span class="app-toast__msg">{{ t.message }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.app-toast-host {
  position: fixed;
  /* Bottom-anchored so toasts clear the tab bar / home indicator. */
  bottom: calc(var(--s-6) + env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  z-index: 1100;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-2);
  width: max-content;
  max-width: calc(100vw - var(--s-8));
  pointer-events: none;
  font-family: var(--font-sans);
}

.app-toast {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-4);
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-2);
  font-size: var(--fs-callout);
  line-height: var(--lh-normal);
  pointer-events: auto;
  cursor: pointer;
  max-width: min(420px, calc(100vw - var(--s-8)));
}

/* Variant accent: tinted surface + matching dot, token colors only. */
.app-toast__dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--brand);
  flex-shrink: 0;
}
.app-toast.is-info {
  background: var(--brand-soft);
  border-color: var(--brand-soft);
  color: var(--text);
}
.app-toast.is-info .app-toast__dot { background: var(--brand); }

.app-toast.is-success {
  background: var(--mint-soft);
  border-color: var(--mint-soft);
  color: var(--mint-text);
}
.app-toast.is-success .app-toast__dot { background: var(--mint); }

.app-toast.is-warning {
  background: var(--amber-soft);
  border-color: var(--amber-soft);
  color: var(--amber-text);
}
.app-toast.is-warning .app-toast__dot { background: var(--amber); }

.app-toast.is-error {
  background: var(--red-soft);
  border-color: var(--red-soft);
  color: var(--red-text);
}
.app-toast.is-error .app-toast__dot { background: var(--red); }

.app-toast__msg { flex: 1; }

.toast-enter-active, .toast-leave-active { transition: opacity 0.18s ease, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
.toast-enter-from { opacity: 0; transform: translateY(8px); }
.toast-leave-to { opacity: 0; transform: translateY(4px); }
.toast-move { transition: transform 0.18s ease; }

@media (prefers-reduced-motion: reduce) {
  .toast-enter-active, .toast-leave-active, .toast-move { transition: none; }
  .toast-enter-from { transform: none; }
  .toast-leave-to { transform: none; }
}
</style>
