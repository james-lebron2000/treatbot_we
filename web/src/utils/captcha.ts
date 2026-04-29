// PRD-2026Q2 §3.6：H5 前端腾讯行为验证码（TCaptcha）封装。
//
// 设计原则：软集成。
//  - 未配置 VITE_TENCENT_CAPTCHA_APP_ID → ensureCaptchaTicket 直接 resolve(null)，
//    登录流程原样不变（后端也会放行）。
//  - 配置了才动态注入 TCaptcha.js 脚本并弹出滑块。

type TCaptchaResult = {
  ret: number
  ticket?: string
  randstr?: string
}

// 腾讯官方脚本挂在 window 上的构造器
type TCaptchaCtor = new (
  appId: string,
  callback: (res: TCaptchaResult) => void,
  options?: Record<string, unknown>
) => { show: () => void; destroy?: () => void }

declare global {
  interface Window {
    TencentCaptcha?: TCaptchaCtor
  }
}

const SCRIPT_URL = 'https://turing.captcha.qcloud.com/TCaptcha.js'
let scriptLoader: Promise<void> | null = null

export const captchaAppId = (): string => {
  return (import.meta.env.VITE_TENCENT_CAPTCHA_APP_ID as string | undefined) || ''
}

export const captchaEnabled = (): boolean => Boolean(captchaAppId())

const loadScript = (): Promise<void> => {
  if (scriptLoader) return scriptLoader
  scriptLoader = new Promise<void>((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('no document'))
      return
    }
    if (window.TencentCaptcha) {
      resolve()
      return
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('captcha script load failed')), { once: true })
      return
    }
    const s = document.createElement('script')
    s.src = SCRIPT_URL
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('captcha script load failed'))
    document.head.appendChild(s)
  })
  return scriptLoader
}

export type CaptchaTicket = {
  ticket: string
  randstr: string
  captchaAppId: string
}

/**
 * 若已配置 captcha，弹滑块并拿到 ticket；未配置返回 null。
 * 用户关闭/校验失败会 reject。
 */
export const ensureCaptchaTicket = async (): Promise<CaptchaTicket | null> => {
  const appId = captchaAppId()
  if (!appId) return null

  await loadScript()
  if (!window.TencentCaptcha) {
    throw new Error('captcha sdk not ready')
  }

  return new Promise<CaptchaTicket>((resolve, reject) => {
    try {
      const instance = new (window.TencentCaptcha as TCaptchaCtor)(appId, (res) => {
        if (res.ret === 0 && res.ticket && res.randstr) {
          resolve({ ticket: res.ticket, randstr: res.randstr, captchaAppId: appId })
        } else {
          reject(new Error('captcha_cancelled'))
        }
      })
      instance.show()
    } catch (err) {
      reject(err instanceof Error ? err : new Error('captcha_error'))
    }
  })
}
