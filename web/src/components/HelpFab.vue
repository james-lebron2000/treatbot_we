<template>
  <!--
    PRD-2026Q3 §U5：全局求助 FAB。

    患者教育原则（与 shared/copy/help.json 一致）：
    - 任何时候都能找到「真人」「教学」「常见问题」三类入口；
    - 不在帮助里塞医学术语；
    - 退出按钮在右上角醒目可点。

    数据源：shared/copy/help.json（通过 web/src/copy/help.ts 转 ESM）。
  -->
  <div class="help-fab-root">
    <button
      class="help-fab-btn"
      type="button"
      :aria-label="fab.ariaLabel"
      @click="open = !open"
    >
      <span class="help-fab-icon" aria-hidden="true">{{ fab.icon }}</span>
      <span class="help-fab-label">{{ fab.label }}</span>
    </button>

    <transition name="help-fab-pop">
      <div v-if="open" class="help-sheet" role="dialog" aria-modal="true" :aria-label="fab.ariaLabel">
        <header class="help-sheet-header">
          <span class="help-sheet-title">需要我们帮哪一步？</span>
          <button class="help-sheet-close" type="button" aria-label="关闭" @click="open = false">×</button>
        </header>
        <ul class="help-sheet-list">
          <li v-for="opt in options" :key="opt.key">
            <button class="help-sheet-item" type="button" @click="onSelect(opt)">
              <span class="help-sheet-item-title">{{ opt.title }}</span>
              <span class="help-sheet-item-sub">{{ opt.subtitle }}</span>
            </button>
          </li>
        </ul>
        <footer class="help-sheet-footer">
          <span>{{ promise }}</span>
        </footer>
      </div>
    </transition>

    <transition name="help-fab-pop">
      <div v-if="modalText" class="help-modal-mask" @click.self="modalText = ''">
        <div class="help-modal-card" role="dialog" aria-modal="true">
          <p class="help-modal-text">{{ modalText }}</p>
          <button class="help-modal-ok" type="button" @click="modalText = ''">我明白了</button>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import help, { expectations } from '../copy/help'

interface HelpOption {
  key: string
  title: string
  subtitle: string
  actionType: 'tel' | 'modal' | 'route'
  actionPayload: string
}

const fab = (help as { fab: { label: string; ariaLabel: string; icon: string } }).fab
const options = (help as { options: HelpOption[] }).options
const promise = expectations?.promise ?? '全程免费 · 您的数据您说了算'

const open = ref(false)
const modalText = ref('')

// Esc 关闭当前最上层弹层：先关 modal，再关 sheet（与 aria-modal 对话框预期一致）
const onKeydown = (ev: KeyboardEvent) => {
  if (ev.key !== 'Escape') return
  if (modalText.value) modalText.value = ''
  else if (open.value) open.value = false
}
const anyOpen = computed(() => open.value || Boolean(modalText.value))
watch(anyOpen, (active) => {
  if (active) document.addEventListener('keydown', onKeydown)
  else document.removeEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

const onSelect = (opt: HelpOption) => {
  open.value = false
  if (opt.actionType === 'tel') {
    // H5 端用 tel: 协议；浏览器拦截则降级展示电话号码
    const tel = opt.actionPayload.replace(/[^0-9+\-]/g, '')
    if (tel) {
      window.location.href = `tel:${tel}`
    } else {
      modalText.value = opt.subtitle
    }
    return
  }
  if (opt.actionType === 'modal') {
    modalText.value = opt.actionPayload
    return
  }
  if (opt.actionType === 'route') {
    window.location.hash = opt.actionPayload
  }
}
</script>

<style scoped>
.help-fab-root {
  position: fixed;
  right: var(--s-4);
  /* 让出底部 tab-bar 高度，并尊重 iOS 安全区 */
  bottom: calc(88px + env(safe-area-inset-bottom, 0px));
  z-index: 1100;
}
.help-fab-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: var(--size-tap);
  padding: 10px 16px;
  border: none;
  border-radius: var(--r-pill);
  background: var(--brand);
  color: #fff;
  font-size: 0.95rem;
  box-shadow: 0 6px 18px rgba(31, 90, 199, 0.32);
  cursor: pointer;
}
.help-fab-btn:hover { background: var(--brand-hover); }
.help-fab-btn:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus), 0 6px 18px rgba(31, 90, 199, 0.32);
}
.help-fab-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  font-weight: 700;
  font-size: 0.9rem;
}
.help-sheet {
  position: absolute;
  right: 0;
  bottom: 60px;
  width: 280px;
  background: var(--bg);
  border-radius: var(--r-lg);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
  overflow: hidden;
}
.help-sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 8px;
  font-weight: 600;
}
.help-sheet-title {
  font-size: 0.95rem;
  color: var(--text);
}
.help-sheet-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--size-tap);
  min-height: var(--size-tap);
  border: none;
  border-radius: 50%;
  background: var(--bg-soft);
  color: var(--text-dim);
  font-size: 1.1rem;
  cursor: pointer;
}
.help-sheet-close:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
.help-sheet-list {
  list-style: none;
  margin: 0;
  padding: 0 6px 6px;
}
.help-sheet-item {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 4px;
  min-height: var(--size-tap);
  padding: 12px 12px;
  border: none;
  background: transparent;
  text-align: left;
  border-radius: 10px;
  cursor: pointer;
}
.help-sheet-item:hover {
  background: var(--bg-soft);
}
.help-sheet-item:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
.help-sheet-item-title {
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 600;
}
.help-sheet-item-sub {
  color: var(--text-dim);
  font-size: 0.82rem;
  line-height: 1.4;
}
.help-sheet-footer {
  padding: 8px 16px 14px;
  font-size: 0.78rem;
  color: var(--brand);
  background: var(--bg-soft);
}
.help-modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1300;
  padding: 20px;
}
.help-modal-card {
  width: 100%;
  max-width: 360px;
  background: var(--bg);
  border-radius: var(--r-lg);
  padding: 20px 18px 16px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22);
}
.help-modal-text {
  margin: 0 0 16px;
  white-space: pre-line;
  color: var(--text);
  font-size: 0.95rem;
  line-height: 1.55;
}
.help-modal-ok {
  width: 100%;
  min-height: var(--size-tap);
  padding: 10px 0;
  border: none;
  border-radius: var(--r-md);
  background: var(--brand);
  color: #fff;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}
.help-modal-ok:hover { background: var(--brand-hover); }
.help-modal-ok:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}
.help-fab-pop-enter-active, .help-fab-pop-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.help-fab-pop-enter-from, .help-fab-pop-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

@media (prefers-reduced-motion: reduce) {
  .help-fab-pop-enter-active, .help-fab-pop-leave-active { transition: none; }
  .help-fab-pop-enter-from, .help-fab-pop-leave-to { transform: none; }
}

/* CRO 大屏 / 桌面端不需要这么靠下 */
@media (min-width: 768px) {
  .help-fab-root {
    bottom: 24px;
  }
}
</style>
