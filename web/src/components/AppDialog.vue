<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import AppButton from './AppButton.vue'

const props = withDefaults(defineProps<{
  open: boolean
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger'
  loading?: boolean
  dismissible?: boolean
}>(), {
  confirmText: '确定',
  cancelText: '取消',
  variant: 'default',
  loading: false,
  dismissible: true,
})

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

// Stable ids so the dialog can point aria-labelledby / aria-describedby at its
// own title and body. Only wired up when the corresponding content exists.
const titleId = useId()
const descId = useId()
const labelledBy = computed(() => (props.title ? titleId : undefined))
// The body always carries the desc id; assistive tech reads whatever it wraps
// (description text and/or slotted content). Omitted entirely when empty.
const describedBy = computed(() => descId)

const panelRef = ref<HTMLElement | null>(null)
// The element focused before the dialog opened, restored on close.
let lastFocused: HTMLElement | null = null

const close = () => {
  if (props.loading) return
  emit('update:open', false)
  emit('cancel')
}
const confirm = () => {
  emit('confirm')
}
const onScrim = () => {
  if (props.dismissible) close()
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableEls(): HTMLElement[] {
  const root = panelRef.value
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  )
}

function focusInitial() {
  const root = panelRef.value
  if (!root) return
  const els = focusableEls()
  // Prefer an explicitly marked default, but only if it is itself focusable;
  // otherwise the first focusable control, else the panel so focus never
  // escapes to the page behind.
  const marked = root.querySelector<HTMLElement>('[data-dialog-default]')
  const preferred = marked && els.includes(marked) ? marked : undefined
  const target = preferred ?? els[0] ?? root
  target.focus()
}

// Keep Tab focus cycling inside the panel (basic focus trap).
function trapTab(e: KeyboardEvent) {
  const els = focusableEls()
  if (els.length === 0) {
    // Nothing focusable inside — keep focus on the panel.
    e.preventDefault()
    panelRef.value?.focus()
    return
  }
  const first = els[0]
  const last = els[els.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (e.shiftKey) {
    if (active === first || !panelRef.value?.contains(active)) {
      e.preventDefault()
      last.focus()
    }
  } else {
    if (active === last || !panelRef.value?.contains(active)) {
      e.preventDefault()
      first.focus()
    }
  }
}

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.dismissible) {
    close()
    return
  }
  if (e.key === 'Tab') {
    trapTab(e)
  }
}

function activate() {
  lastFocused = (document.activeElement as HTMLElement) ?? null
  document.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
  nextTick(() => focusInitial())
}

function deactivate() {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
  // Return focus to whatever was focused before the dialog opened.
  const el = lastFocused
  lastFocused = null
  if (el && typeof el.focus === 'function' && document.contains(el)) {
    el.focus()
  }
}

watch(() => props.open, (open) => {
  if (open) activate()
  else deactivate()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="app-dialog">
        <div class="app-dialog__scrim" @click="onScrim" />
        <div
          ref="panelRef"
          class="app-dialog__panel"
          :class="{ 'is-danger': variant === 'danger' }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="labelledBy"
          :aria-describedby="describedBy"
          tabindex="-1"
        >
          <header v-if="title" class="app-dialog__header">
            <h2 :id="titleId" class="app-dialog__title">{{ title }}</h2>
          </header>
          <div :id="descId" class="app-dialog__body">
            <p v-if="description" class="app-dialog__desc">{{ description }}</p>
            <slot />
          </div>
          <footer class="app-dialog__footer">
            <slot name="footer">
              <AppButton variant="ghost" :disabled="loading" @click="close">{{ cancelText }}</AppButton>
              <AppButton
                :variant="variant === 'danger' ? 'danger' : 'primary'"
                :loading="loading"
                data-dialog-default
                @click="confirm"
              >
                {{ confirmText }}
              </AppButton>
            </slot>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-dialog {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Comfortable gutter + respect notches / home indicator. */
  padding: calc(var(--s-4) + env(safe-area-inset-top)) calc(var(--s-4) + env(safe-area-inset-right))
    calc(var(--s-4) + env(safe-area-inset-bottom)) calc(var(--s-4) + env(safe-area-inset-left));
  font-family: var(--font-sans);
}
.app-dialog__scrim {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
}
.app-dialog__panel {
  position: relative;
  width: 100%;
  max-width: 420px;
  max-height: calc(100vh - var(--s-8));
  max-height: calc(100dvh - var(--s-8));
  overflow-y: auto;
  background: var(--bg);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
}
.app-dialog__panel:focus-visible { outline: none; box-shadow: var(--shadow-2), var(--shadow-focus); }
.app-dialog__header { padding: var(--s-6) var(--s-6) 0; }
.app-dialog__title {
  margin: 0;
  font-size: var(--fs-subtitle);
  font-weight: 600;
  color: var(--text);
  line-height: var(--lh-tight);
}
.app-dialog__body { padding: var(--s-3) var(--s-6) var(--s-4); }
.app-dialog__desc {
  margin: 0;
  font-size: var(--fs-body);
  color: var(--text-dim);
  line-height: var(--lh-relaxed);
  white-space: pre-wrap;
}
.app-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-6) var(--s-6);
}
/* Give actions room on narrow phones: stack full-width so they never crowd. */
@media (max-width: 380px) {
  .app-dialog__footer {
    flex-direction: column-reverse;
    align-items: stretch;
  }
  .app-dialog__footer :deep(.app-btn) { width: 100%; }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.fade-enter-active .app-dialog__panel,
.fade-leave-active .app-dialog__panel {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.fade-enter-from .app-dialog__panel { transform: translateY(8px) scale(0.98); }
.fade-leave-to .app-dialog__panel { transform: translateY(4px) scale(0.99); }

@media (prefers-reduced-motion: reduce) {
  .fade-enter-active, .fade-leave-active,
  .fade-enter-active .app-dialog__panel,
  .fade-leave-active .app-dialog__panel {
    transition: none;
  }
  .fade-enter-from .app-dialog__panel,
  .fade-leave-to .app-dialog__panel { transform: none; }
}
</style>
