// 全局 toast 队列：useToast() 任意位置调用，AppToast.vue 渲染。
// 设计依据：医疗场景需轻量、可叠加、有语义色（成功 / 警告 / 错误 / 中性），
// 不阻塞用户操作 —— 替换 `alert()` 中那些「点知道才能继续」的反人类体验。
import { reactive } from 'vue'

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
  duration: number
  timer?: ReturnType<typeof setTimeout>
}

export const toastQueue = reactive<ToastItem[]>([])

let nextId = 1

export function dismiss(id: number) {
  const idx = toastQueue.findIndex(t => t.id === id)
  if (idx === -1) return
  const t = toastQueue[idx]
  if (t.timer) clearTimeout(t.timer)
  toastQueue.splice(idx, 1)
}

function push(message: string, variant: ToastVariant, duration: number) {
  const id = nextId++
  const item: ToastItem = { id, message, variant, duration }
  if (duration > 0) {
    item.timer = setTimeout(() => dismiss(id), duration)
  }
  toastQueue.push(item)
  return id
}

export function useToast() {
  return {
    info: (msg: string, duration = 3000) => push(msg, 'info', duration),
    success: (msg: string, duration = 2500) => push(msg, 'success', duration),
    warning: (msg: string, duration = 4000) => push(msg, 'warning', duration),
    error: (msg: string, duration = 5000) => push(msg, 'error', duration),
    dismiss,
  }
}
