/**
 * 统一的"温暖陪伴"文案字典
 *
 * 遵循 `docs/brand-voice-guidelines.md`：
 * - 每个错误 = 共情一句 + 可行动作一句
 * - 每个加载态 ≤ 12 字，主动告诉用户在做什么
 * - 空态永远配"去做什么"的动作建议
 * - 称谓统一用"您"；系统自称"我们"
 *
 * 使用示例：
 *   import { empathy } from '@/i18n/empathy'
 *   throw new Error(empathy.error.network)
 *   loadingText.value = empathy.loading.parsing
 */

export const empathy = {
  /* ───────── 错误 ───────── */
  error: {
    network: '网络有点卡，您的数据没丢，稍等再试一次',
    timeout: '这次等得有点久，可能网络不太稳，再试一次？',
    permission: '这里需要先登录 —— 登录只用手机号，不会存其它信息',
    notFound: '这个页面找不到了 —— 可能链接过期，回首页看看？',
    rateLimit: (retryAfterSec: number) =>
      `您操作得挺快，稍等 ${Math.ceil(retryAfterSec / 60)} 分钟我们就能继续`,
    server: '我们这边出了点小状况 —— 您的数据都还在，稍后再来一次',
    parse: '这张图片我们没能看清 —— 换张清晰些的再试试？或者直接手动输入关键信息也行',
    unknown: '刚刚卡了一下，您的数据没丢，再试一次？',
    invalidPhone: '手机号看起来不太对，再核对一下？',
    invalidCode: '验证码对不上呢，再核对一下？（可以让我们重发）',
    codeExpired: '验证码已经过期啦，让我们给您重新发一条',
    fileTooLarge: '这份文件有点大 —— 压缩一下或分几次传，也是可以的',
    fileTypeInvalid: '我们支持图片和 PDF —— 换一种格式再试试？'
  },

  /* ───────── 加载态 ───────── */
  loading: {
    brief: '马上好…',
    saving: '正在为您保存…',
    uploading: '正在上传您的病历…',
    parsing: '正在帮您看懂这份病历…',
    parsingDetail: 'AI 在找诊断、分期、基因信息 —— 这些稍后您能直接核对修改',
    matching: '正在为您家人找合适的试验…',
    matchingDetail: '我们会告诉您每一项为什么被选中',
    submitting: '正在提交您的申请…',
    sendingCode: '短信正在路上…'
  },

  /* ───────── 空态 ───────── */
  empty: {
    records: '还没有上传过病历 —— 上传第一份，我们帮您看懂它',
    matches: '目前没找到完全贴合的试验 —— 但这不代表没有。我们每周更新，下周再来看看？',
    matchesNoRecord: '先上传一份病历，我们才能为您家人找到合适的选择',
    applications: '您还没有提交过申请。不着急，等您看好试验再说，随时都可以',
    notifications: '暂时没有新消息 —— 有进展我们会第一时间短信通知您'
  },

  /* ───────── 操作成功（克制，不放烟花）───────── */
  success: {
    brief: '好了 ✓',
    saved: '已保存',
    submitted: '已提交 —— 我们会继续跟进',
    uploaded: '上传好了，正在帮您看懂…',
    codeSent: '验证码已发送，请注意查收短信',
    deleted: '已删除 —— 这份数据彻底从我们这边移除了',
    exported: '导出完成 —— 这份数据是完整的您',
    logout: '已退出。您的数据仍然安全保留，下次登录可直接看到'
  },

  /* ───────── 隐私承诺（3 层）───────── */
  privacy: {
    l1: '您的数据始终是您的',
    l2: '🔒 我们不存储您的任何隐私数据 · 所有信息由您自己保管 · 您随时可以带走或删除',
    l2Short: '🔒 数据仅在您的账户里 · 随时可删',
    upload: '您上传的病历仅在您的账户里，我们不做任何其它用途，您随时可以删除',
    match: '匹配只使用您核对过的信息，我们不会把您的病历发给试验方 —— 除非您主动申请',
    apply: '只有您点击"申请"后，研究团队才能看到您的联系方式',
    smsGuarantee: '我们只用手机号给您发必要短信。不骚扰、不外传、可随时注销'
  },

  /* ───────── 按钮 ───────── */
  button: {
    login: '进入，帮家人找下一步',
    retry: '再试一次',
    retryAlt: '换张图再试',
    cancel: '先不了',
    confirm: '好的',
    skip: '暂时跳过',
    uploadStart: '开始解析（约 3 分钟）',
    manualEntry: '手头没有报告？直接告诉我们关键信息也能匹配 →',
    seeDemo: '先看看别人家的病历怎么被看懂 →',
    export: '📥 导出我的全部数据',
    deleteRecord: '🗑 删除这份病历',
    deleteAccount: '🚪 注销账户（彻底删除所有数据）'
  },

  /* ───────── 告知类（提示、非错非成）───────── */
  notice: {
    demoDisclaimer: '这是一份已脱敏的示例病历 —— 我们不会动用您的数据，也不会在您的账户里留下任何痕迹',
    smsSafety: '我们不会因为任何理由让您转账，请警惕',
    notMedicalAdvice: '以上结果仅供您和医生参考，不代替诊断',
    weeklyUpdate: '试验库每周更新，有新匹配我们会短信告诉您',
    editableResult: '哪里不对直接改 —— 您改过的就是对的'
  }
} as const

export type EmpathyKey = keyof typeof empathy
