<script setup lang="ts">
import { toastQueue, dismiss } from '../composables/useToast'
</script>

<template>
  <Teleport to="body">
    <div class="app-toast-host" role="status" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="t in toastQueue"
          :key="t.id"
          class="app-toast"
          :class="`is-${t.variant}`"
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
  top: var(--s-6);
  left: 50%;
  transform: translateX(-50%);
  z-index: 1100;
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
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

.app-toast__dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--brand);
  flex-shrink: 0;
}
.app-toast.is-success .app-toast__dot { background: var(--mint); }
.app-toast.is-error .app-toast__dot { background: var(--red); }
.app-toast.is-warning .app-toast__dot { background: var(--amber); }
.app-toast.is-info .app-toast__dot { background: var(--lilac); }

.app-toast__msg { flex: 1; }

.toast-enter-active, .toast-leave-active { transition: opacity 0.18s ease, transform 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
.toast-enter-from { opacity: 0; transform: translateY(-8px); }
.toast-leave-to { opacity: 0; transform: translateY(-4px); }
.toast-move { transition: transform 0.18s ease; }
</style>
