<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
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
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && props.dismissible) close()
}

watch(() => props.open, (open) => {
  if (open) {
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
  } else {
    document.removeEventListener('keydown', onKey)
    document.body.style.overflow = ''
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="app-dialog" role="dialog" aria-modal="true">
        <div class="app-dialog__scrim" @click="onScrim" />
        <div class="app-dialog__panel" :class="{ 'is-danger': variant === 'danger' }">
          <header v-if="title" class="app-dialog__header">
            <h2 class="app-dialog__title">{{ title }}</h2>
          </header>
          <div class="app-dialog__body">
            <p v-if="description" class="app-dialog__desc">{{ description }}</p>
            <slot />
          </div>
          <footer class="app-dialog__footer">
            <slot name="footer">
              <AppButton variant="ghost" :disabled="loading" @click="close">{{ cancelText }}</AppButton>
              <AppButton :variant="variant === 'danger' ? 'danger' : 'primary'" :loading="loading" @click="confirm">
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
  padding: var(--s-4);
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
  background: var(--bg);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-2);
  overflow: hidden;
}
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
  gap: var(--s-2);
  padding: var(--s-3) var(--s-6) var(--s-6);
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.fade-enter-active .app-dialog__panel,
.fade-leave-active .app-dialog__panel {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.fade-enter-from .app-dialog__panel { transform: translateY(8px) scale(0.98); }
.fade-leave-to .app-dialog__panel { transform: translateY(4px) scale(0.99); }
</style>
