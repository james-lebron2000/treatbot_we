// Q3-红线 §A.2.1：隐私政策版本号常量
// 文案改版后修改这里 → 用户下次进入 Upload / 报名页会被 force re-prompt 同意。
// 后端 user_consent.policy_version 即从此值写入。
export const POLICY_VERSION = 'v2026Q3-1'

export type ConsentScope = 'upload' | 'match' | 'share_with_cro'
