<script setup lang="ts">
type Variant = 'default' | 'soft' | 'cream' | 'mint' | 'lilac'
type Padding = 'sm' | 'md' | 'lg'

withDefaults(defineProps<{
  variant?: Variant
  padding?: Padding
  bordered?: boolean
  interactive?: boolean
}>(), {
  variant: 'default',
  padding: 'md',
  bordered: true,
  interactive: false,
})
</script>

<template>
  <article
    :class="[
      'app-card',
      `is-${variant}`,
      `pad-${padding}`,
      { 'is-bordered': bordered, 'is-interactive': interactive },
    ]"
    :tabindex="interactive ? 0 : undefined"
  >
    <header v-if="$slots.header" class="app-card__header">
      <slot name="header" />
    </header>
    <div class="app-card__body">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="app-card__footer">
      <slot name="footer" />
    </footer>
  </article>
</template>

<style scoped>
.app-card {
  border-radius: var(--r-lg);
  background: var(--bg);
  box-shadow: var(--shadow-1);
  color: var(--text);
}
.app-card.is-bordered { border: 1px solid var(--line); }

.app-card.is-soft { background: var(--bg-soft); }
.app-card.is-cream { background: var(--bg-cream); }
.app-card.is-mint { background: var(--bg-mint); }
.app-card.is-lilac { background: var(--bg-lilac); }

.app-card.pad-sm .app-card__body { padding: var(--s-3); }
.app-card.pad-md .app-card__body { padding: var(--s-4); }
.app-card.pad-lg .app-card__body { padding: var(--s-6); }

.app-card__header {
  padding: var(--s-4) var(--s-4) var(--s-2);
  font-size: var(--fs-subtitle);
  font-weight: 600;
  line-height: var(--lh-tight);
}
.app-card__footer {
  padding: var(--s-2) var(--s-4) var(--s-4);
  border-top: 1px solid var(--line);
  margin-top: var(--s-2);
}

.app-card.is-interactive {
  cursor: pointer;
  transition: box-shadow 0.15s, transform 0.15s;
}
.app-card.is-interactive:hover { box-shadow: var(--shadow-2); }
.app-card.is-interactive:active { transform: scale(0.995); }
.app-card.is-interactive:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

@media (prefers-reduced-motion: reduce) {
  .app-card.is-interactive { transition: none; }
  .app-card.is-interactive:active { transform: none; }
}
</style>
