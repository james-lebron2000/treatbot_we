# Contributing to Treatbot

首先，感谢您抽出宝贵时间来为 Treatbot 做出贡献！🎉

## 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
  - [报告 Bug](#报告-bug)
  - [提出新功能](#提出新功能)
  - [提交代码](#提交代码)
- [开发环境搭建](#开发环境搭建)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [版本发布](#版本发布)

---

## 行为准则

本项目采用 [Contributor Covenant](https://www.contributor-covenant.org/) 行为准则。

### 我们的承诺

为了营造一个开放和友好的环境，我们作为贡献者和维护者承诺：

- 无论年龄、体型、可见或不可见的残疾、种族、性别特征、性别认同和表达、经验水平、教育程度、社会经济地位、国籍、个人外貌、种族、宗教或性取向，都欢迎每个人参与
- 以建设性的方式提出批评，接受建设性的批评
- 关注对社区最有利的事情
- 对其他社区成员表示同理心

---

## 如何贡献

### 报告 Bug

在提交 Bug 报告之前，请先：

1. 搜索现有 [Issues](https://github.com/your-repo/treatbot/issues)，确保该问题未被报告
2. 使用最新版本的代码进行测试
3. 确认问题可以在干净的环境中复现

如果确认是新 Bug，请提交 Issue 并包含以下信息：

- **标题**：简明扼要地描述问题
- **环境信息**：
  - 操作系统及版本
  - Node.js 版本
  - 数据库版本
  - 相关依赖版本
- **问题描述**：详细描述问题的表现
- **复现步骤**：
  1. 步骤一
  2. 步骤二
  3. ...
- **预期结果**：描述应该发生什么
- **实际结果**：描述实际发生了什么
- **截图/日志**：如果适用，添加截图或错误日志
- **可能的解决方案**：如果您有想法，请分享

### 提出新功能

在提出新功能之前，请先：

1. 搜索现有 Issues，确保该功能未被提议
2. 确认该功能符合项目目标
3. 考虑该功能对其他用户是否有价值

提交功能请求时，请包含：

- **标题**：简明地描述功能
- **功能描述**：详细描述这个功能应该做什么
- **使用场景**：描述这个功能将如何使用
- **可能的实现**：如果您有实现思路，请分享
- **替代方案**：是否有其他实现方式

### 提交代码

#### 工作流程

1. **Fork 仓库**
   ```bash
   # 点击 GitHub 上的 Fork 按钮
   ```

2. **克隆您的 Fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/treatbot.git
   cd treatbot
   ```

3. **添加上游仓库**
   ```bash
   git remote add upstream https://github.com/original/treatbot.git
   ```

4. **创建分支**
   ```bash
   git checkout -b feature/your-feature-name
   # 或
   git checkout -b fix/issue-number
   ```

5. **进行更改**
   - 编写代码
   - 添加测试
   - 更新文档

6. **提交更改**
   ```bash
   git add .
   git commit -m "feat: 添加新功能"
   ```

7. **推送到您的 Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

8. **创建 Pull Request**
   - 访问原始仓库
   - 点击 "New Pull Request"
   - 选择您的分支
   - 填写 PR 描述

---

## 开发环境搭建

### 前提条件

- Node.js >= 18.0.0
- MySQL >= 8.0
- Redis >= 6.0
- Git

### 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/your-repo/treatbot.git
cd treatbot

# 2. 安装依赖
cd server
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 4. 初始化数据库
npm run db:migrate

# 5. 导入种子数据
npm run db:seed

# 6. 启动开发服务器
npm run dev
```

### 前端开发

```bash
# 使用微信开发者工具打开 treatbot-weapp 目录
# 配置项目设置
# 开始开发
```

---

## 代码规范

### JavaScript/Node.js

我们使用 ESLint 进行代码检查：

```bash
# 检查代码
npm run lint

# 自动修复
npm run lint:fix
```

#### 规范要点

- 使用 2 个空格缩进
- 使用单引号
- 行尾不使用分号
- 最大行长度 100 字符
- 使用驼峰命名法

### 小程序开发

- 使用 ES6+ 语法
- 组件化开发
- 避免使用过多的 `setData`
- 图片懒加载
- 合理使用缓存

---

## 提交规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

### 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 类型 (Type)

- **feat**: 新功能
- **fix**: Bug 修复
- **docs**: 文档更新
- **style**: 代码格式（不影响功能的修改）
- **refactor**: 重构
- **perf**: 性能优化
- **test**: 测试相关
- **chore**: 构建过程或辅助工具的变动
- **ci**: CI/CD 相关

### 示例

```bash
# 新功能
feat(api): 添加用户搜索功能

# Bug 修复
fix(auth): 修复 Token 过期问题

# 文档
docs(readme): 更新部署指南

# 性能优化
perf(db): 优化查询性能

# 测试
test(api): 添加用户接口测试
```

---

## Pull Request 规范

### PR 标题格式

```
<type>: <简短描述>
```

例如：
- `feat: 添加用户搜索功能`
- `fix: 修复数据库连接池泄漏`
- `docs: 更新 API 文档`

### PR 描述模板

```markdown
## 描述
简要描述这个 PR 做了什么

## 类型
- [ ] Bug 修复
- [ ] 新功能
- [ ] 性能优化
- [ ] 文档更新
- [ ] 代码重构

## 检查清单
- [ ] 代码遵循项目规范
- [ ] 添加了必要的测试
- [ ] 更新了相关文档
- [ ] 所有测试通过
- [ ] 在本地测试通过

## 相关 Issue
修复 #123

## 截图（如果适用）
```

### 代码审查

维护者会审查您的 PR，可能会要求：
- 修改代码
- 添加测试
- 更新文档
- 解释实现思路

请保持耐心并及时响应反馈。

---

## 版本发布

我们使用 [Semantic Versioning](https://semver.org/) 进行版本管理：

- **MAJOR**: 不兼容的 API 修改
- **MINOR**: 向下兼容的功能新增
- **PATCH**: 向下兼容的问题修复

### 发布流程

1. 更新版本号
2. 更新 CHANGELOG.md
3. 创建 Git Tag
4. 发布 Release
5. 部署到生产环境

---

## 开发资源

### 文档
- [项目文档](../docs/README.md)
- [API 文档](../docs/api-spec.md)
- [架构设计](../docs/production-plan.md)

### 工具
- [Postman 集合](../docs/Treatbot-API.postman_collection.json)
- [Swagger 文档](../docs/openapi.json)

### 社区
- [GitHub Discussions](https://github.com/your-repo/treatbot/discussions)
- [邮件列表](mailto:dev@treatbot.example.com)

---

## 许可证

通过贡献代码，您同意您的贡献将在 [MIT 许可证](../LICENSE) 下发布。

---

## 致谢

感谢所有为 Treatbot 做出贡献的人！❤️

---

**如有疑问，请随时联系维护团队！**
