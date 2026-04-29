const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');
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

// ===== 公开的「试用演示」接口（免认证） =====
// 设计约束：只返回 fixtures/demoSamples.json 的只读数据，不触发 OCR，不写 DB。
router.get('/demo/samples', demoController.listSamples);
router.get('/demo/samples/:id/result', demoController.getSampleResult);
router.get('/demo/samples/:id/matches', demoController.getSampleMatches);

// Q3-红线 §B.2：漏斗埋点入口（匿名也写）
router.post('/track', funnelController.track);

// ===== 认证相关 =====
router.post('/auth/weapp-login', strictLimiter, authController.weappLogin);
router.post('/auth/send-code', strictLimiter, authController.sendVerificationCode);
router.post('/auth/h5-login', strictLimiter, authController.h5Login);
router.post('/auth/refresh', authController.refreshToken);
router.post('/auth/bind-phone', authMiddleware, strictLimiter, authController.bindPhone);
router.get('/auth/profile', authMiddleware, userController.getProfile);

// ===== 用户相关（需要认证） =====
router.get('/user/profile', authMiddleware, userController.getProfile);
router.get('/user/stats', authMiddleware, userController.getStats);
router.put('/user/profile', authMiddleware, userController.updateProfile);

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
router.get('/medical/parse-status', authMiddleware, medicalController.getParseStatus);
router.get('/medical/records', authMiddleware, medicalController.getRecords);
router.get('/medical/records/:id', authMiddleware, medicalController.getRecordDetail);
router.get('/medical/records/:id/file', authMiddleware, medicalController.downloadRecordFile);
router.patch('/medical/records/:id/enrich', authMiddleware, medicalController.enrichRecord);
// PRD-2026Q2 §3.5：多病历管理页 —— 软删除（覆盖此前的硬删 route；同 URL，语义改为 deleted_at=now）。
router.delete('/medical/records/:id', authMiddleware, medicalController.softDeleteRecord);

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
router.post('/applications', authMiddleware, strictLimiter, idempotencyMiddleware, applicationController.create);
router.get('/applications', authMiddleware, applicationController.getList);
router.put('/applications/:id/cancel', authMiddleware, applicationController.cancel);

// ===== 管理后台 API（需要管理员权限）=====
// PRD-2026Q2 §2.3：所有 admin 路由都挂 logAdmin(action)，在 res finish 后异步落审计。
router.get('/admin/dashboard', authMiddleware, requireAdmin, logAdmin('view_dashboard'), adminController.getDashboardStats);
router.get('/admin/users', authMiddleware, requireAdmin, logAdmin('view_users'), adminController.getUserList);
router.get('/admin/records', authMiddleware, requireAdmin, logAdmin('view_records'), adminController.getRecordList);
router.get('/admin/applications', authMiddleware, requireAdmin, logAdmin('view_applications'), adminController.getApplicationList);
router.put('/admin/applications/:id/status', authMiddleware, requireAdmin, logAdmin('update_application_status', (req) => ({ targetType: 'application', targetId: req.params.id })), adminController.updateApplicationStatus);
router.get('/admin/logs', authMiddleware, requireAdmin, logAdmin('view_logs'), adminController.getSystemLogs);
router.get('/admin/trials', authMiddleware, requireAdmin, logAdmin('view_trials'), adminController.getAdminTrials);
// PRD-2026Q2 §2.4：试验新鲜度健康度视图（W4 前端消费）
router.get('/admin/trials/health', authMiddleware, requireAdmin, logAdmin('view_trials_health'), adminController.getTrialsHealth);
router.post('/admin/applications/:id/notes', authMiddleware, requireAdmin, logAdmin('add_application_note', (req) => ({ targetType: 'application', targetId: req.params.id })), adminController.addApplicationNote);
router.get('/admin/exports/users', authMiddleware, requireAdmin, logAdmin('export_users'), adminController.exportUsers);
router.get('/admin/exports/records', authMiddleware, requireAdmin, logAdmin('export_records'), adminController.exportRecords);
router.get('/admin/exports/applications', authMiddleware, requireAdmin, logAdmin('export_applications'), adminController.exportApplications);
router.get('/admin/cro', authMiddleware, requireAdmin, logAdmin('view_cro'), adminController.getCroList);
router.post('/admin/cro', authMiddleware, requireAdmin, logAdmin('create_cro'), adminController.createCro);
router.put('/admin/cro/:id', authMiddleware, requireAdmin, logAdmin('update_cro', (req) => ({ targetType: 'cro', targetId: req.params.id })), adminController.updateCro);
// PRD-2026Q2 §2.3：单字段明文揭示入口（后续加 requireMfa）
router.get('/admin/users/:id/reveal', authMiddleware, requireAdmin, logAdmin('reveal_field', (req) => ({ targetType: 'user', targetId: req.params.id })), adminController.revealField);

// PRD-2026Q2 §3.2：OCR 队列 DLQ 列表 + 手动重试
router.get('/admin/ocr-failures', authMiddleware, requireAdmin, logAdmin('view_ocr_failures'), adminController.listOcrFailures);
router.post('/admin/ocr-failures/:id/retry', authMiddleware, requireAdmin, logAdmin('retry_ocr_failure', (req) => ({ targetType: 'ocr_failure', targetId: req.params.id })), adminController.retryOcrFailure);

// ===== CRO API（CRO 账号认证）=====
router.post('/cro/login', strictLimiter, croController.croLogin);
router.get('/cro/profile', croAuthMiddleware, croController.getCroProfile);
router.get('/cro/trials', croAuthMiddleware, croController.getCroTrials);
router.get('/cro/applications', croAuthMiddleware, croController.getCroApplications);
router.put('/cro/applications/:id/status', croAuthMiddleware, croController.updateCroApplicationStatus);
router.post('/cro/applications/:id/notes', croAuthMiddleware, croController.addCroNote);
router.get('/cro/exports/applications', croAuthMiddleware, croController.exportCroApplications);

module.exports = router;
