/**
 * PRD-2026Q2 §3.6：腾讯云行为验证码（TCaptcha）后端校验。
 *
 * 设计原则：软集成。
 *  - 未配置 TENCENT_CAPTCHA_APP_ID / TENCENT_CAPTCHA_SECRET_KEY 时直接放行
 *    （dev 联调环境，H5 前端也不会弹滑块，见 web/src/utils/captcha.ts）
 *  - 配置了才真正调腾讯接口；任何失败（网络/签名/风险）都记日志后拒绝
 */
const axios = require('axios');
const logger = require('../utils/logger');

const isEnabled = () =>
  Boolean(process.env.TENCENT_CAPTCHA_APP_ID && process.env.TENCENT_CAPTCHA_SECRET_KEY);

/**
 * 校验 TCaptcha 票据。
 * @param {object} params
 * @param {string} params.ticket    前端完成滑块后回调的 ticket
 * @param {string} params.randstr   前端完成滑块后回调的 randstr
 * @param {string} params.userIp    用户真实 IP
 * @param {string} [params.captchaAppId] 若前端带了 appId（便于双端一致校验）
 * @returns {Promise<{ valid: boolean, reason?: string }>}
 */
const verify = async ({ ticket, randstr, userIp, captchaAppId } = {}) => {
  if (!isEnabled()) {
    return { valid: true };
  }

  if (!ticket || !randstr) {
    return { valid: false, reason: 'missing_ticket' };
  }

  const appId = process.env.TENCENT_CAPTCHA_APP_ID;
  if (captchaAppId && captchaAppId !== appId) {
    return { valid: false, reason: 'appid_mismatch' };
  }

  try {
    const resp = await axios.get('https://ssl.captcha.qq.com/ticket/verify', {
      params: {
        aid: appId,
        AppSecretKey: process.env.TENCENT_CAPTCHA_SECRET_KEY,
        Ticket: ticket,
        Randstr: randstr,
        UserIP: userIp || ''
      },
      timeout: 5000
    });

    const body = resp.data || {};
    // 腾讯文档：response === "1" 表示校验通过
    if (`${body.response}` === '1') {
      return { valid: true };
    }
    logger.warn('[Captcha] 腾讯校验拒绝', { body });
    return { valid: false, reason: body.err_msg || 'tencent_reject' };
  } catch (err) {
    logger.warn('[Captcha] 腾讯校验异常', { error: err.message });
    return { valid: false, reason: 'tencent_unreachable' };
  }
};

module.exports = { verify, isEnabled };
