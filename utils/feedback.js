// utils/feedback.js
// PRD-2026Q3 §B.1 反馈封装
// 目标：所有关键操作（上传/匹配/申请/删除）走统一的 start/success/error/confirm 链路。
// - 错误必须给重试入口：error(msg, { retry, retryText }) 弹 modal 让用户一键重试
// - loading 自动配对：start() 拿到 token，success/error 自动调 hideLoading
// - 文案语气克制温和（数愈健康医疗品牌）
//
// 用法：
//   const fb = require('../../utils/feedback')
//   const t = fb.start('正在为您解析病历…')
//   try { ... ; fb.success('已为您整理好', t) }
//   catch (err) { fb.error('解析时遇到小问题', { retry: () => doParse(), token: t }) }

const DEFAULTS = {
  loadingTitle: '请稍候…',
  successDuration: 1600,
  errorDuration: 2400,
  retryText: '再试一次',
  cancelText: '稍后再说'
}

let activeToken = 0

function start(title) {
  const token = ++activeToken
  wx.showLoading({ title: title || DEFAULTS.loadingTitle, mask: true })
  return token
}

function _maybeHide(token) {
  if (!token || token === activeToken) {
    wx.hideLoading()
  }
}

function success(message, token) {
  _maybeHide(token)
  if (!message) return
  wx.showToast({
    title: message,
    icon: 'success',
    duration: DEFAULTS.successDuration,
    mask: false
  })
}

function info(message, token) {
  _maybeHide(token)
  if (!message) return
  wx.showToast({
    title: message,
    icon: 'none',
    duration: DEFAULTS.successDuration,
    mask: false
  })
}

// error(message, options?)
//   options.retry: () => Promise|void  传入则弹 modal，"再试一次" 触发；否则只弹 toast
//   options.retryText / cancelText: 覆盖按钮文案
//   options.token: 与 start() 配对，用于关 loading
//   options.detail: 副标题/技术细节，附加在 modal content 后面
function error(message, options) {
  const opts = options || {}
  _maybeHide(opts.token)
  const text = message || '操作失败，请稍后再试'

  if (typeof opts.retry === 'function') {
    const detail = opts.detail ? `\n\n${opts.detail}` : ''
    wx.showModal({
      title: text,
      content: `${opts.hint || '点「再试一次」我们会重新为您处理。'}${detail}`,
      confirmText: opts.retryText || DEFAULTS.retryText,
      cancelText: opts.cancelText || DEFAULTS.cancelText,
      confirmColor: '#2563eb',
      success: (res) => {
        if (res.confirm) {
          try { opts.retry() } catch (_) { /* swallow */ }
        }
      }
    })
    return
  }

  wx.showToast({
    title: text,
    icon: 'none',
    duration: DEFAULTS.errorDuration,
    mask: false
  })
}

// confirm({ title, content, confirmText, cancelText, danger })
// 返回 Promise<boolean>，便于 await 写法
function confirm(opts) {
  const o = opts || {}
  return new Promise((resolve) => {
    wx.showModal({
      title: o.title || '确认操作',
      content: o.content || '',
      confirmText: o.confirmText || '确认',
      cancelText: o.cancelText || '再想想',
      confirmColor: o.danger ? '#dc2626' : '#2563eb',
      success: (res) => resolve(Boolean(res.confirm)),
      fail: () => resolve(false)
    })
  })
}

// 主动关闭最近一次 loading（如取消/中止时用）
function dismiss(token) {
  _maybeHide(token)
}

module.exports = {
  start,
  success,
  info,
  error,
  confirm,
  dismiss
}
