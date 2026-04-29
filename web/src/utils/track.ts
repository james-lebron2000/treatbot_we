/**
 * Q3-红线 §B.2：前端漏斗埋点 SDK（best-effort，绝不影响业务流）。
 *
 * 设计要点：
 *  - 不引入 axios —— 避免拦截器把 401 重定向到 /login；track 是匿名也允许的。
 *  - 优先 navigator.sendBeacon，可在页面跳转 / 关闭瞬间仍把事件送出；
 *    sendBeacon 失败回退到 fetch keepalive。
 *  - 任何异常一律吞掉 —— 埋点失败不能干扰用户操作。
 *  - anonId 走 localStorage（key 'tb_anon_id'）；登录后后端会顺手把 user_id 关联上。
 */

const ANON_KEY = 'tb_anon_id'

const safeRandomUUID = (): string => {
  try {
    const c = (globalThis as any).crypto
    if (c && typeof c.randomUUID === 'function') {
      return c.randomUUID()
    }
  } catch {
    /* noop */
  }
  // 兜底：时间戳 + 随机串，足以区分会话；不强求 RFC4122
  return `anon_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

function getAnonId(): string {
  try {
    const existing = localStorage.getItem(ANON_KEY)
    if (existing) return existing
    const fresh = safeRandomUUID()
    localStorage.setItem(ANON_KEY, fresh)
    return fresh
  } catch {
    // localStorage 被禁（隐私模式 / SSR）时降级为内存值；同会话内仍能串联
    return safeRandomUUID()
  }
}

export function track(event: string, metadata?: Record<string, unknown>): void {
  const body = { event, anonId: getAnonId(), metadata }
  const payload = JSON.stringify(body)
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' })
      if (navigator.sendBeacon('/api/track', blob)) return
    }
  } catch {
    /* fall through to fetch */
  }
  try {
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(() => {
      /* swallow */
    })
  } catch {
    /* swallow */
  }
}
