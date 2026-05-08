const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../middleware/auth');
const { requireAdminToken, requireRole } = require('../middleware/adminAuth');
const { idempotencyMiddleware } = require('../middleware/idempotency');
const { strictLimiter, uploadLimiter } = require('../middleware/rateLimit');
// PRD-2026Q2 §2.3：Admin 操作审计日志中间件
const { logAdmin } = require('../middleware/auditLog');

// 控制器
const authController = require('../controllers/auth');
const userController = require('../controllers/user');
const medicalController = require('../controllers/medical');
const matchController = require('../controllers/match');
const applicationController = require('../controllers/application');
const adminController = require('../controllers/admin');
// Q3-红线 §A.2：用户合规自助接口（注销 / 数据导出 / consent / 改密码）
const meController = require('../controllers/me');
const croController = require('../controllers/cro');
const { croAuthMiddleware } = require('../middleware/croAuth');
const demoController = require('../controllers/demo');
// Q3-红线 §B.2：漏斗埋点（匿名亦允许，故放在 public 段）
const funnelController = require('../controllers/funnel');
// PRD-2026Q4 T0-7：用户写入路径的 PII 归一化 + 强校验中间件
const normalizePii = require('../middleware/normalizePii');

// ===== 公开的「试用演示」接口（免认证） =====
// 设计约束：只返回 fixtures/demoSamples.json 的只读数据，不触发 OCR，不写 DB。
router.get('/demo/samples', demoController.listSamples);
router.get('/demo/samples/:id/result', demoController.getSampleResult);
router.get('/demo/samples/:id/matches', demoController.getSampleMatches);

// Q3-红线 §B.2：漏斗埋点入口（匿名也写）
router.post('/track', funnelController.track);

// ===== 认证相关 =====
// PRD-2026Q4 T0-7：所有写入 phone / id_card 的入口前置 normalizePii
router.post('/auth/weapp-login', strictLimiter, normalizePii, authController.weappLogin);
router.post('/auth/send-code', strictLimiter, normalizePii, authController.sendVerificationCode);
router.post('/auth/h5-login', strictLimiter, normalizePii, authController.h5Login);
router.post('/auth/refresh', authController.refreshToken);
router.post('/auth/bind-phone', authMiddleware, strictLimiter, normalizePii, authController.bindPhone);
router.get('/auth/profile', authMiddleware, userController.getProfile);

// ===== 用户相关（需要认证） =====
router.get('/user/profile', authMiddleware, userController.getProfile);
router.get('/user/stats', authMiddleware, userController.getStats);
// PRD-2026Q4 T0-7：profile 更新会改写 phone / id_card，必须前置 normalizePii
router.put('/user/profile', authMiddleware, normalizePii, userController.updateProfile);

// ===== 用户合规自助（Q3-红线 §A.2，仅追加在用户路由组末尾） =====
router.post('/me/consent', authMiddleware, meController.recordConsent);
router.get('/me/consent', authMiddleware, meController.listConsent);
router.get('/me/export', authMiddleware, meController.exportMyData);
router.post('/me/delete-account', authMiddleware, strictLimiter, meController.deleteAccount);
router.post('/me/change-password', authMiddleware, strictLimiter, meController.changePassword);

// ===== 病历相关（需要认证） =====
router.post('/medical/upload',
  authMiddleware,
  uploadLimiter,
  medicalController.uploadMiddleware,
  medicalController.handleUpload
);
// Phase E.2：批量上传（最多 10 份；每份独立 record_id；任一失败不阻塞其他）
router.post('/medical/upload-batch',
  authMiddleware,
  uploadLimiter,
  medicalController.uploadMiddlewareBatch,
  medicalController.handleUploadBatch
);
router.get('/medical/parse-status', authMiddleware, medicalController.getParseStatus);
// Phase E.2：批量查询解析状态，单次请求最多 20 个 fileId
router.get('/medical/parse-status-batch', authMiddleware, medicalController.getParseStatusBatch);
router.post('/medical/parse-status-batch', authMiddleware, medicalController.getParseStatusBatch);
// Phase E.3：跨多份病历的疾病发展 + 治疗经过时间线（Doubao 优先，规则兜底）。
// Phase E.6 / Review #3：每次调用都跑 LLM（~$0.05/call），强制走 uploadLimiter (30/h) 防被滥用。
router.get('/medical/timeline', authMiddleware, uploadLimiter, medicalController.getTimeline);
router.get('/medical/records', authMiddleware, medicalController.getRecords);
router.get('/medical/records/:id', authMiddleware, medicalController.getRecordDetail);
router.get('/medical/records/:id/file', authMiddleware, medicalController.downloadRecordFile);
router.patch('/medical/records/:id/enrich', authMiddleware, medicalController.enrichRecord);
// PRD-2026Q2 §3.5：多病历管理页 —— 软删除（覆盖此前的硬删 route；同 URL，语义改为 deleted_at=now）。
router.delete('/medical/records/:id', authMiddleware, medicalController.softDeleteRecord);
// PRD-2026Q3 T1-3：多病历切换 active 基线
router.put('/medical/records/:id/activate', authMiddleware, medicalController.activateRecord);

// ===== 匹配相关（需要认证） =====
router.get('/matches', authMiddleware, matchController.getMatches);
router.get('/matches/search', authMiddleware, matchController.searchTrials);
router.get('/matches/filters', authMiddleware, matchController.getFilterOptions);
router.post('/trials/matches/find', authMiddleware, matchController.findMatches);
router.get('/trials', authMiddleware, matchController.searchTrials);
router.get('/trials/search', authMiddleware, matchController.searchTrials);
router.get('/trials/filters', authMiddleware, matchController.getFilterOptions);
router.get('/trials/:id', authMiddleware, matchController.getTrialDetail);

// ===== 报名相关（需要认证 + 幂等） =====
// PRD-2026Q4 T0-7：报名联系电话进入 contact_phone，同样走 normalizePii
router.post('/applications', authMiddleware, strictLimiter, normalizePii, idempotencyMiddleware, applicationController.create);
router.get('/applications', authMiddleware, applicationController.getList);
router.put('/applications/:id/cancel', authMiddleware, applicationController.cancel);
// PRD-2026Q3 T0-2：用户查看自己报名的状态变更时间线
router.get('/applications/:id/timeline', authMiddleware, applicationController.getTimeline);

// ===== 管理后台 API（需要管理员权限）=====
// PRD-2026Q2 §2.3：所有 admin 路由都挂 logAdmin(action)，在 res finish 后异步落审计。
router.post('/admin/login', strictLimiter, adminController.adminLogin);
router.get('/admin/session', authMiddleware, requireAdminToken, logAdmin('view_admin_session'), adminController.getAdminSession);
router.get('/admin/dashboard', authMiddleware, requireAdminToken, logAdmin('view_dashboard'), adminController.getDashboardStats);
router.get('/admin/users', authMiddleware, requireAdminToken, logAdmin('view_users'), adminController.getUserList);
router.get('/admin/records', authMiddleware, requireAdminToken, logAdmin('view_records'), adminController.getRecordList);
router.get('/admin/applications', authMiddleware, requireAdminToken, logAdmin('view_applications'), adminController.getApplicationList);
router.put('/admin/applications/:id/status', authMiddleware, requireAdminToken, logAdmin('update_application_status', (req) => ({ targetType: 'application', targetId: req.params.id })), adminController.updateApplicationStatus);
// PRD-2026Q3 T0-2：admin 查看任一申请的状态时间线（含 actor_id，便于追责）
router.get('/admin/applications/:id/timeline', authMiddleware, requireAdminToken, logAdmin('view_application_timeline', (req) => ({ targetType: 'application', targetId: req.params.id })), adminController.getApplicationTimeline);
router.get('/admin/logs', authMiddleware, requireAdminToken, logAdmin('view_logs'), adminController.getSystemLogs);
router.get('/admin/trials', authMiddleware, requireAdminToken, logAdmin('view_trials'), adminController.getAdminTrials);
// PRD-2026Q2 §2.4：试验新鲜度健康度视图（W4 前端消费）
router.get('/admin/trials/health', authMiddleware, requireAdminToken, logAdmin('view_trials_health'), adminController.getTrialsHealth);
router.post('/admin/applications/:id/notes', authMiddleware, requireAdminToken, logAdmin('add_application_note', (req) => ({ targetType: 'application', targetId: req.params.id })), adminController.addApplicationNote);
// PRD-2026Q3 T1-6：含 PII 的全量导出仅 super；脱敏维度的 applications 导出全角色可访问。
router.get('/admin/exports/users', authMiddleware, requireAdminToken, requireRole('super'), logAdmin('export_users'), adminController.exportUsers);
router.get('/admin/exports/records', authMiddleware, requireAdminToken, requireRole('super'), logAdmin('export_records'), adminController.exportRecords);
router.get('/admin/exports/applications', authMiddleware, requireAdminToken, logAdmin('export_applications'), adminController.exportApplications);
router.get('/admin/cro', authMiddleware, requireAdminToken, logAdmin('view_cro'), adminController.getCroList);
// PRD-2026Q3 T1-6：CRO 公司维护是 cro_liaison 的核心职责；super 兜底；ops 不参与商务关系。
router.post('/admin/cro', authMiddleware, requireAdminToken, requireRole('super', 'cro_liaison'), logAdmin('create_cro'), adminController.createCro);
router.put('/admin/cro/:id', authMiddleware, requireAdminToken, requireRole('super', 'cro_liaison'), logAdmin('update_cro', (req) => ({ targetType: 'cro', targetId: req.params.id })), adminController.updateCro);
// PRD-2026Q2 §2.3 + Q3 T1-6：单字段明文揭示是 PII 解码，仅 super；后续加 requireMfa。
router.get('/admin/users/:id/reveal', authMiddleware, requireAdminToken, requireRole('super'), logAdmin('reveal_field', (req) => ({ targetType: 'user', targetId: req.params.id })), adminController.revealField);
// Phase E.4：单用户的匹配 + 时间线视图（运营排查 / CRO 推送复核）
router.get('/admin/users/:id/matches', authMiddleware, requireAdminToken, logAdmin('view_user_matches', (req) => ({ targetType: 'user', targetId: req.params.id })), adminController.getUserMatches);

// PRD-2026Q3 T1-4：CPA 月度对账（仅 super；含金额信息，权限收紧）
router.get('/admin/billing/summary', authMiddleware, requireAdminToken, requireRole('super'), logAdmin('view_billing_summary'), adminController.getBillingSummary);

// PRD-2026Q4 T0-1：trialCrawler null 守门复核队列（仅 super，触及试验数据写回）
router.get('/admin/trials/field-review', authMiddleware, requireAdminToken, requireRole('super'), logAdmin('view_trial_field_review'), adminController.getTrialFieldReviewQueue);
router.post('/admin/trials/field-review/:id/resolve', authMiddleware, requireAdminToken, requireRole('super'), logAdmin('resolve_trial_field_review', (req) => ({ targetType: 'trial_field_review', targetId: req.params.id })), adminController.resolveTrialFieldReview);

// PRD-2026Q2 §3.2：OCR 队列 DLQ 列表 + 手动重试
router.get('/admin/ocr-failures', authMiddleware, requireAdminToken, logAdmin('view_ocr_failures'), adminController.listOcrFailures);
router.post('/admin/ocr-failures/:id/retry', authMiddleware, requireAdminToken, logAdmin('retry_ocr_failure', (req) => ({ targetType: 'ocr_failure', targetId: req.params.id })), adminController.retryOcrFailure);

// ===== CRO API（CRO 账号认证）=====
router.post('/cro/login', strictLimiter, croController.croLogin);
router.get('/cro/profile', croAuthMiddleware, croController.getCroProfile);
router.get('/cro/trials', croAuthMiddleware, croController.getCroTrials);
router.get('/cro/applications', croAuthMiddleware, croController.getCroApplications);
router.put('/cro/applications/:id/status', croAuthMiddleware, croController.updateCroApplicationStatus);
// PRD-2026Q3 T0-2：CRO 批量推进状态（最多 200 条），单失败不阻塞其他
router.post('/cro/applications/bulk-status', croAuthMiddleware, croController.bulkUpdateCroApplicationStatus);
router.post('/cro/applications/:id/notes', croAuthMiddleware, croController.addCroNote);
router.get('/cro/exports/applications', croAuthMiddleware, croController.exportCroApplications);

module.exports = router;
