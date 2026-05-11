// Q3-红线 §B.2：小程序漏斗埋点。
//
// 复刻 web/src/utils/track.ts 的语义，但裁剪掉 sendBeacon / fetch keepalive
// （WeApp 没有这些 API），统一走 wx.request。失败一律静默——埋点不能阻断业务。
//
// 服务端入口在 server/routes/index.js:33 → controllers/funnel.js，匿名也接收。
// 事件白名单与服务端 + H5 三端同款；不在白名单里的事件直接丢弃，避免脏数据。

const WHITELIST = new Set([
  'landing_view',
  'upload_start',
  'upload_success',
  'match_view',
  'trial_apply',
  'application_submitted',
  // Plan §Phase 3.2：客户端模糊度 advisory —— 用于阈值校准
  'client_blur_advisory'
])

// 5s 内同 event 去重（防止 onShow + onLoad 重复触发 / 用户连点）。
// 用 Map 而不是 storage：埋点是幂等的辅助信号，没必要持久化。
const recent = new Map()
const DEDUP_WINDOW_MS = 5000

const resolveBaseUrl = () => {
  try {
    const app = typeof getApp === 'function' ? getApp() : null
    if (app && app.globalData && app.globalData.apiBaseUrl) {
      return `${app.globalData.apiBaseUrl}`.replace(/\/+$/, '')
    }
  } catch (error) {
    // ignore
  }
  return 'https://inseq.top'
}

const track = (event, props) => {
  if (!event || typeof event !== 'string') return
  if (!WHITELIST.has(event)) return

  const now = Date.now()
  const last = recent.get(event) || 0
  if (now - last < DEDUP_WINDOW_MS) return
  recent.set(event, now)

  const payload = {
    event,
    props: props && typeof props === 'object' ? props : {},
    ts: now,
    platform: 'weapp'
  }

  let token = ''
  try {
    token = wx.getStorageSync('token') || ''
  } catch (error) {
    // ignore
  }

  try {
    wx.request({
      url: `${resolveBaseUrl()}/api/track`,
      method: 'POST',
      data: payload,
      header: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : ''
      },
      timeout: 5000,
      // 静默：埋点失败不打 toast、不抛、不重试
      fail: () => {}
    })
  } catch (error) {
    // wx.request 同步异常也吞掉
  }
}

module.exports = {
  track,
  WHITELIST
}
