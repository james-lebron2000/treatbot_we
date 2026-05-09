// 全局确认 / 提示对话框：useConfirm / usePrompt 任意位置调用，AppDialogHost.vue 渲染。
// 替换原生 window.confirm/alert/prompt —— 自带 Apple 风视觉、可异步等待结果。
import { reactive } from 'vue'

export type DialogKind = 'confirm' | 'prompt' | 'alert'

export interface DialogState {
  open: boolean
  kind: DialogKind
  title: string
  description?: string
  placeholder?: string
  defaultValue?: string
  confirmText: string
  cancelText: string
  variant: 'default' | 'danger'
  loading: boolean
  inputValue: string
  resolve?: (v: boolean | string | null) => void
}

export const dialogState = reactive<DialogState>({
  open: false,
  kind: 'confirm',
  title: '',
  description: '',
  placeholder: '',
  defaultValue: '',
  confirmText: '确定',
  cancelText: '取消',
  variant: 'default',
  loading: false,
  inputValue: '',
})

function open<T>(patch: Partial<DialogState>): Promise<T> {
  return new Promise<T>((resolve) => {
    Object.assign(dialogState, {
      open: true,
      title: '',
      description: '',
      placeholder: '',
      defaultValue: '',
      confirmText: '确定',
      cancelText: '取消',
      variant: 'default',
      loading: false,
      inputValue: '',
      ...patch,
      resolve: resolve as DialogState['resolve'],
    })
    if (patch.defaultValue) dialogState.inputValue = patch.defaultValue
  })
}

export function close(value: boolean | string | null) {
  const fn = dialogState.resolve
  dialogState.open = false
  dialogState.loading = false
  dialogState.resolve = undefined
  fn?.(value)
}

export interface ConfirmOptions {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}

export function useConfirm() {
  return (opts: ConfirmOptions): Promise<boolean> => {
    return open<boolean>({
      kind: 'confirm',
      title: opts.title,
      description: opts.description,
      confirmText: opts.confirmText ?? '确定',
      cancelText: opts.cancelText ?? '取消',
      variant: opts.danger ? 'danger' : 'default',
    })
  }
}

export interface PromptOptions {
  title: string
  description?: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  cancelText?: string
}

export function usePrompt() {
  return (opts: PromptOptions): Promise<string | null> => {
    return open<string | null>({
      kind: 'prompt',
      title: opts.title,
      description: opts.description,
      placeholder: opts.placeholder,
      defaultValue: opts.defaultValue,
      confirmText: opts.confirmText ?? '确定',
      cancelText: opts.cancelText ?? '取消',
    })
  }
}

export interface AlertOptions {
  title: string
  description?: string
  confirmText?: string
}

export function useAlert() {
  return (opts: AlertOptions): Promise<void> => {
    return open<void>({
      kind: 'alert',
      title: opts.title,
      description: opts.description,
      confirmText: opts.confirmText ?? '我知道了',
      cancelText: '',
    })
  }
}
