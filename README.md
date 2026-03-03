# Treatbot 微信小程序版

## 项目简介

Treatbot 微信小程序是原 Treatbot 临床试验匹配平台的移动端版本，为患者提供便捷的病历上传、AI解析和临床试验匹配服务。

## 核心功能

### 患者端功能
1. **病历上传** - 支持拍照/相册选择，多图片上传
2. **AI智能解析** - OCR识别 + 医疗NLP抽取关键信息
3. **病历管理** - 查看历史病历，更新病历状态
4. **试验匹配** - 基于结构化病历匹配适合的临床试验
5. **匹配报告** - 详细的匹配度评分和推荐理由

## 技术栈

- **框架**: 微信小程序原生框架
- **样式**: WXSS + 自定义CSS变量
- **图表**: 微信原生组件 + 自定义组件
- **后端**: 复用原 Treatbot Node.js API

## 项目结构

```
treatbot-weapp/
├── app.js                 # 小程序入口
├── app.json               # 全局配置
├── app.wxss               # 全局样式
├── pages/                 # 页面目录
│   ├── index/            # 首页
│   ├── upload/           # 上传病历
│   ├── records/          # 病历管理
│   ├── matches/          # 匹配结果
│   └── profile/          # 个人中心
├── components/           # 公共组件
├── utils/               # 工具函数
├── images/              # 图片资源
└── docs/                # 项目文档
```

## 页面说明

### 首页 (pages/index)
- 展示核心数据统计
- 功能快捷入口
- 最近匹配记录
- 使用流程说明

### 上传病历 (pages/upload)
- 三步上传流程：选择 → 解析 → 完成
- 支持多图片上传
- 病历类型选择
- AI解析进度展示
- 解析结果预览

### 病历管理 (pages/records)
- 病历列表展示
- 病历详情查看
- 病历状态管理
- 重新解析功能

### 匹配结果 (pages/matches)
- 匹配试验列表
- 匹配度评分
- 试验详情
- 一键报名

### 个人中心 (pages/profile)
- 用户信息
- 我的病历
- 我的匹配
- 设置

## 开发指南

### 1. 环境准备
- 微信开发者工具
- Node.js (用于后端联调)
- MongoDB (数据存储)

### 2. 配置修改
修改 `app.js` 中的 API 地址：
```javascript
globalData: {
  apiBaseUrl: 'https://your-api-domain.com', // 生产环境
  mockMode: false // 关闭模拟模式
}
```

### 3. 编译运行
1. 使用微信开发者工具打开项目
2. 填写 AppID（测试可使用测试号）
3. 点击编译运行

### 4. H5 患者端（新增）
项目新增 `web/` 子工程（Vue3 + Vite + TypeScript）：

```bash
cd web
npm install
npm run dev
```

生产构建：

```bash
cd web
npm run build
```

### 5. 真机调试
1. 点击预览获取二维码
2. 使用微信扫描二维码
3. 在真机上测试功能

## 后端接口对接

复用原 Treatbot 后端 API：

| 功能 | 接口 | 方法 |
|:---|:---|:---|
| 微信登录 | /api/auth/weapp-login | POST |
| 文件上传 | /api/medical/upload | POST |
| 解析状态 | /api/medical/parse-status | GET |
| 获取病历 | /api/medical/records | GET |
| 试验匹配 | /api/medical/match | POST |
| 匹配结果 | /api/matches | GET |

## 上线 checklist

- [ ] 配置合法域名（request、uploadFile、downloadFile）
- [ ] 配置服务器域名和业务域名
- [ ] 用户隐私保护指引设置
- [ ] 小程序备案（如需要）
- [ ] 提交审核并发布

## 与原 Web 版的区别

| 特性 | Web版 | 小程序版 |
|:---|:---|:---|
| 入口 | 浏览器/URL | 微信内 |
| 拍照上传 | 调用摄像头 | 微信原生API |
| 消息通知 | 邮件/短信 | 微信订阅消息 |
| 分享传播 | 链接分享 | 微信好友/朋友圈 |
| 开发成本 | 较高 | 较低 |

## 联系方式

如有问题，请参考原 Treatbot 项目文档或联系开发团队。

---

*基于 Treatbot 项目改造，保留原有业务逻辑，适配微信小程序生态。*
