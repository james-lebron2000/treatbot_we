# Treatbot 更新日志

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
