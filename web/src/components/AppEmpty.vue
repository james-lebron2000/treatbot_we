<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  description?: string
  size?: 'md' | 'lg'
}>(), {
  size: 'md',
})
</script>

<template>
  <div class="app-empty" :class="`is-${size}`">
    <div class="app-empty__icon" aria-hidden="true">
      <slot name="icon">
        <!-- 默认中性占位：圆环 + 横线，Apple 风留白 -->
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="32" cy="32" r="22" stroke-opacity="0.4" />
          <path d="M22 32h20" stroke-opacity="0.6" />
        </svg>
      </slot>
    </div>
    <h3 v-if="title" class="app-empty__title">{{ title }}</h3>
    <p v-if="description" class="app-empty__desc">{{ description }}</p>
    <div v-if="$slots.action" class="app-empty__action">
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.app-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  color: var(--text-dim);
  font-family: var(--font-sans);
}
.app-empty.is-md { padding: var(--s-8) var(--s-6); }
.app-empty.is-lg { padding: var(--s-12) var(--s-6); }

.app-empty__icon {
  width: 72px;
  height: 72px;
  color: var(--text-muted);
  margin-bottom: var(--s-4);
  display: flex;
  align-items: center;
  justify-content: center;
}
.app-empty__icon :deep(svg) { width: 100%; height: 100%; }

.app-empty__title {
  margin: 0 0 var(--s-2);
  font-size: var(--fs-subtitle);
  font-weight: 600;
  color: var(--text);
  line-height: var(--lh-tight);
}
.app-empty__desc {
  margin: 0;
  font-size: var(--fs-body);
  color: var(--text-dim);
  line-height: var(--lh-relaxed);
  max-width: 360px;
}
.app-empty__action { margin-top: var(--s-6); }
</style>
