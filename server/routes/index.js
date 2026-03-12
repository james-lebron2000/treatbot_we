const express = require('express');
const router = express.Router();

const { authMiddleware } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/adminAuth');
const { idempotencyMiddleware } = require('../middleware/idempotency');
const { strictLimiter, uploadLimiter } = require('../middleware/rateLimit');

// 控制器
const authController = require('../controllers/auth');
const userController = require('../controllers/user');
const medicalController = require('../controllers/medical');
const matchController = require('../controllers/match');
const applicationController = require('../controllers/application');
const adminController = require('../controllers/admin');

// ===== 认证相关 =====
router.post('/auth/weapp-login', strictLimiter, authController.weappLogin);
router.post('/auth/h5-login', strictLimiter, authController.h5Login);
router.post('/auth/refresh', authController.refreshToken);
router.post('/auth/bind-phone', authMiddleware, strictLimiter, authController.bindPhone);
router.get('/auth/profile', authMiddleware, userController.getProfile);

// ===== 用户相关（需要认证） =====
router.get('/user/profile', authMiddleware, userController.getProfile);
router.get('/user/stats', authMiddleware, userController.getStats);
router.put('/user/profile', authMiddleware, userController.updateProfile);

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
router.patch('/medical/records/:id/enrich', authMiddleware, medicalController.enrichRecord);
router.delete('/medical/records/:id', authMiddleware, medicalController.deleteRecord);

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
router.get('/admin/dashboard', authMiddleware, requireAdmin, adminController.getDashboardStats);
router.get('/admin/users', authMiddleware, requireAdmin, adminController.getUserList);
router.get('/admin/records', authMiddleware, requireAdmin, adminController.getRecordList);
router.get('/admin/applications', authMiddleware, requireAdmin, adminController.getApplicationList);
router.put('/admin/applications/:id/status', authMiddleware, requireAdmin, adminController.updateApplicationStatus);
router.get('/admin/logs', authMiddleware, requireAdmin, adminController.getSystemLogs);
router.get('/admin/exports/users', authMiddleware, requireAdmin, adminController.exportUsers);
router.get('/admin/exports/records', authMiddleware, requireAdmin, adminController.exportRecords);

module.exports = router;
