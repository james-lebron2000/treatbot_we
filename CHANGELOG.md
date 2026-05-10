# Treatbot 更新日志

## v1.2.0 (2026-05-09)

> 大版本聚合 2026 Q2/Q3/Q4 共 150+ commits 的成果。下方按主题分组列出关键变更。

### 安全 & 合规（May 2026 Security Sprint）
- 管理员登录关闭时序泄露，constant-time 比较走完整路径
- 启用 `trust proxy` —— 修复 nginx 后所有未认证路由共用一个 rate-limit bucket 的严重缺陷
- CSV 导出（admin / cro / billing）全部加上 OWASP CSV-Injection 前缀防御（CWE-1236）
- Sentry 上报扩展 PII 脱敏：breadcrumbs / exception / headers / url / query / cookies
- 刷新 token 的 jti claim 改为原子操作，关闭 TOCTOU 竞态
- 热路径日志中的手机号 / OTP / 身份证全脱敏
- 拆除 H5 fixed-code 后门、`oss.js` / `ocr.js` / `adminAuth` 的 init-time env capture
- JWT 秘钥强校验（生产 ≥32 字符 + 弱值黑名单 + fail-fast 启动）

### 后端基础设施
- PRD-2026Q3+Q4 后端基础设施 + 迁移安全网
- 三供应商 Vision-LLM benchmark；OCR 路由切到 **Doubao → Kimi → Tencent**（下线 MiniMax）
- 病历 LLM 解析增加 schema 校验 + 重试 + DLQ
- 多病历时间线 / 跨病历批量上传 / 软删除 / 激活流程
- CRO 多租户隔离 + RBAC（super / ops / cro_liaison）+ PII 导出审计
- 申请状态机 + 幂等

### 部署 & CI/CD
- 完成 nginx → Caddy 迁移，nginx 已归档 / 停止 / 禁用
- CI 三层降级：GHCR-first → 本地 cache → 源码 build；30/35min 超时 + skip-if-cached
- hot-fix emergency path 文档（CI 不可用时的应急方案）
- 脱离 Docker Hub：tarball + scp + `docker load`
- workflow 自动回写 server dump 到 main（需 `paths-ignore` 防循环）

### 前端 & 设计
- Cross-end design token foundation（Phase F·W1）
- 微信小程序 5 页 Apple-cozy UI 重做（V2）+ 第二轮 polish 20 tasks
- Vue admin 4 页 Apple 视觉重做 + `docs/design-system.md`
- H5 批量上传 + 时间线面板（Phase E.2/E.3）
- Demo 演示页"上传→解析→找药"端到端模拟

### 品牌
- 全站品牌 `Treatbot → 数愈健康`，Landing 明快配色重做

---

## v1.1.0 (2026-02-25)

### 新增功能

#### 1. 引导页面 (pages/guide)
- 新用户首次使用的引导流程
- 三步引导：上传病历 → 智能匹配 → 一键报名
- 支持滑动切换和指示器导航
- 可跳过引导直接进入首页

#### 2. 搜索页面 (pages/search)
- 试验搜索功能
- 关键词搜索（试验名称、疾病、医院）
- 多维度筛选（试验阶段、地区、招募状态）
- 搜索历史记录
- 支持下拉刷新和加载更多

#### 3. 首页优化
- 添加搜索入口
- 优化页面布局

### 新增文件
- `pages/guide/guide.js`
- `pages/guide/guide.wxml`
- `pages/guide/guide.wxss`
- `pages/guide/guide.json`
- `pages/search/search.js`
- `pages/search/search.wxml`
- `pages/search/search.wxss`
- `pages/search/search.json`

### 更新文件
- `app.json` - 添加新页面路径
- `pages/index/index.js` - 添加搜索跳转函数
- `pages/index/index.wxml` - 添加搜索入口
- `pages/index/index.wxss` - 添加搜索框样式

---

## v1.0.0 (2026-02-24)

### 初始版本

#### 核心功能
- 微信小程序前端
- Node.js 后端 API
- Docker 容器化部署
- CI/CD 自动部署
- Prometheus 监控告警
- 完整的文档体系

#### 页面功能
- 首页
- 病历上传
- AI 解析状态
- 病历管理
- 试验匹配
- 用户中心

---

## 版本规划

### v1.2.0 (计划中)
- [ ] 微信订阅消息
- [ ] 在线客服功能
- [ ] 试验收藏功能
- [ ] 分享功能

### v1.3.0 (计划中)
- [ ] OCR 多供应商支持
- [ ] 匹配算法优化
- [ ] 数据可视化
- [ ] 运营后台

### v2.0.0 (规划中)
- [ ] 医生端小程序
- [ ] 研究机构后台
- [ ] 智能推荐算法
- [ ] 大数据分析

---

**当前版本：v1.1.0**
