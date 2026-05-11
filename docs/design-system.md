# 数愈健康 · 设计系统（Design System）

> 跨端共享的视觉语言。**Landing 是 source of truth**，小程序 / Web / Admin / Demo 都向它对齐。
> 本文为日常维护手册：改 token、加组件、做新页时翻这一份。

## 0. 文档地图

| 你想做的事 | 看哪一节 |
|---|---|
| 改一个颜色 / 字号 / 圆角 / 阴影 | §1 Token 工作流 |
| 接入新端 / 在新文件用 token | §2 引入路径 |
| 翻设计稿要选什么颜色、字号、圆角 | §3 Token 清单 |
| 写一个新组件，按钮 / 输入 / Toast | §4 组件目录 |
| 处理"页面看起来不对" | §5 反模式 & 检查清单 |
| 上线前自动校验 | §6 端到端验证 |

## 1. Token 工作流（核心约定）

唯一可改源：[shared/tokens/tokens.json](../shared/tokens/tokens.json)。

```bash
# 改完 tokens.json 后执行（约 0.1s）
node shared/tokens/build.mjs
# 或在 web 子项目里
pnpm -C web tokens:build
```

构建脚本 [shared/tokens/build.mjs](../shared/tokens/build.mjs) 会从一份 JSON 同步生成 5 份 CSS：

| 输出 | 给谁用 |
|---|---|
| `web/src/styles/tokens.css` | Vue Web（在 [web/src/main.ts](../web/src/main.ts) 第一行 import） |
| `styles/tokens.wxss` | 微信小程序（在 [app.wxss](../app.wxss) 顶部 `@import '/styles/tokens.wxss'`） |
| `server/public/landing/tokens.css` | Landing H5（`<link>` 引入） |
| `server/public/admin/tokens.css` | Admin H5（`<link>` 引入） |
| `server/public/demo/tokens.css` | Demo H5（`<link>` 引入） |

**禁止手改任何 `tokens.css/wxss`**——它们头部都有 `AUTO-GENERATED` 警告。CI 会校验 hash。

## 2. 引入路径

### Vue Web
```ts
// web/src/main.ts
import './styles/tokens.css'   // 必须在 style.css 之前
import './style.css'
```
然后在任何 `<style scoped>` 里直接用 `var(--brand)` `var(--s-4)` 等。

### 微信小程序
```css
/* app.wxss 顶部 */
@import '/styles/tokens.wxss';
```
WeChat 基础库 ≥ 2.16 支持 CSS 变量；当前 [project.config.json:84](../project.config.json) `libVersion: 3.14.2`，安全。

### Landing / Admin / Demo
```html
<link rel="stylesheet" href="./tokens.css">
<link rel="stylesheet" href="./_shared.css">  <!-- demo 专属 -->
```

## 3. Token 清单

### 3.1 颜色（24 个）

**品牌 / 语义色**

| Token | 值 | 用法 |
|---|---|---|
| `--brand` | `#2563eb` | 主 CTA / 链接 / 焦点环 / 当前态 |
| `--brand-hover` | `#1d4ed8` | hover/active 加深；同时作为 brand-soft 底上的深色文字 |
| `--brand-soft` | `#dbeafe` | Tag / Eyebrow / 选中底 |
| `--mint` / `--mint-soft` / `--mint-text` | `#10b981` / `#d1fae5` / `#065f46` | 成功（实色 / 浅底 / 浅底上的深色文字） |
| `--amber` / `--amber-soft` / `--amber-text` | `#b45309` / `#fef3c7` / `#92400e` | 警告 / 待补 |
| `--red` / `--red-soft` / `--red-text` | `#dc2626` / `#fee2e2` / `#991b1b` | 危险（删除 / 注销 / 不符合） |
| `--lilac` / `--lilac-soft` / `--lilac-text` | `#8b5cf6` / `#ede9fe` / `#5b21b6` | 中性提示 |

> **`*-text` 命名约定**：每组语义色都有「实色 / 浅底 / 浅底上的深色文字」三件套。Pill / Badge / Banner 用 `background: var(--xx-soft); color: var(--xx-text)` 即可获得正确对比度；不要再写 `#065f46` 这类裸值。

**中性 / 文本**

| Token | 值 | 用法 |
|---|---|---|
| `--text` | `#0f172a` | 标题 / 正文主色 |
| `--text-dim` | `#475569` | 副标题 / 次要正文 |
| `--text-muted` | `#94a3b8` | 占位 / 辅助说明 |
| `--line` | `#e2e8f0` | 分隔 / 输入边框 |

**背景**

| Token | 值 | 用法 |
|---|---|---|
| `--bg` | `#ffffff` | 主底 / 卡片 |
| `--bg-soft` | `#f0f7ff` | 页面外层 / 表头条 / 卡内卡 |
| `--bg-cream` / `--bg-mint` / `--bg-lilac` | 见 tokens.json | 内容卡片色彩变化 |

### 3.2 字号 / 行高（10 个）

| Token | 值 | 用法 |
|---|---|---|
| `--font-sans` | `-apple-system, BlinkMacSystemFont, "PingFang SC", ...` | 三端唯一字体栈 |
| `--fs-display` | `34px` | Hero / 页面主标题 |
| `--fs-title` | `22px` | section 标题 / 顶栏 h2 |
| `--fs-subtitle` | `17px` | 卡片标题 |
| `--fs-body` | `15px` | 正文 |
| `--fs-callout` | `14px` | 按钮 / 标签 / 表格单元 |
| `--fs-caption` | `12px` | 时间戳 / 法务 / 提示 |
| `--lh-tight` / `--lh-normal` / `--lh-relaxed` | `1.25` / `1.5` / `1.65` | 标题 / 按钮 / 正文 |

### 3.3 圆角（4 个）

`--r-sm` 8 / `--r-md` 12 / `--r-lg` 16 / `--r-pill` 999

### 3.4 阴影（3 个）

| Token | 用法 |
|---|---|
| `--shadow-1` | 卡片静态 |
| `--shadow-2` | hover / Modal / Drawer |
| `--shadow-focus` | 输入聚焦环（替代 outline） |

**禁止彩色染透阴影**（如 `rgba(37, 99, 235, 0.25)`）——医疗品牌强调克制感，单色低透阴影即可。

### 3.5 间距（7 个）

`--s-1` 4 / `--s-2` 8 / `--s-3` 12 / `--s-4` 16 / `--s-6` 24 / `--s-8` 32 / `--s-12` 48

**只能用这 7 个值**，禁止 6/10/14/18/20/26/28 等中间值。

## 4. 组件目录

### 4.1 Vue Web 基础组件

| 组件 | 路径 | 何时用 |
|---|---|---|
| `<AppButton variant="primary\|secondary\|ghost\|danger" :loading>` | [web/src/components/AppButton.vue](../web/src/components/AppButton.vue) | 所有按钮，**不要再写 `<button class="btn-primary">`** |
| `<AppDialogHost />` | [web/src/components/AppDialogHost.vue](../web/src/components/AppDialogHost.vue) | App.vue 已挂载，全站可用 |
| `<AppToast />` | [web/src/components/AppToast.vue](../web/src/components/AppToast.vue) | App.vue 已挂载 |
| `<AppCard>` `<AppInput>` `<AppEmpty>` | 同目录 | 卡片 / 输入 / 空态 |

**Composable**

```ts
import { useConfirm, usePrompt, useAlert } from '@/composables/useDialog'
import { useToast } from '@/composables/useToast'

const confirm = useConfirm()
const toast = useToast()

if (await confirm({ title: '确认删除？', danger: true })) { ... }
toast.success('已保存')
toast.error('提交失败，请重试')
```

**禁用** `window.alert/confirm/prompt`——CI grep 已加 0 命中校验。

### 4.2 Admin H5（[server/public/admin/](../server/public/admin/)）

| API | 用途 |
|---|---|
| `AdminUI.toast(msg, {tone, action})` | 顶部居中 toast，tone: success/info/warning/danger |
| `AdminUI.confirm({title, content, danger})` | Promise<boolean> 二次确认 |
| `AdminUI.banner(msg, {tone, action})` | 顶部横幅，常用于 token 失效引导重新登录 |

实现见 [server/public/admin/dialog.js](../server/public/admin/dialog.js)。

### 4.3 Demo H5（[server/public/demo/](../server/public/demo/)）

5 屏路演演示，用 `setTimeout` 模拟解析过程，无后端依赖：
1. [01-home.html](../server/public/demo/01-home.html) — 首屏 hero
2. [02-upload.html](../server/public/demo/02-upload.html) — 病历上传
3. [03-parsing.html](../server/public/demo/03-parsing.html) — AI 解析进度
4. [04-report.html](../server/public/demo/04-report.html) — 病历摘要
5. [05-match.html](../server/public/demo/05-match.html) — 试验匹配

共用 [_shared.css](../server/public/demo/_shared.css)（demo-shell / demo-topbar / demo-steps / demo-btn 等）。
**投屏适配**：`?fullscreen=1` 隐藏 topbar；`@media (min-width: 1920px)` 整体放大 1.2×。

### 4.4 微交互规范

所有按钮 active 态：
```css
transition: background 150ms ease, transform 100ms cubic-bezier(0.4, 0, 0.2, 1);
:active:not(:disabled) { transform: scale(0.98); }
```

已应用于：
- Vue `<AppButton>`、`web/src/style.css` `.btn`
- Demo `_shared.css` `.demo-btn`
- Admin H5 `.btn`
- 小程序 `.btn-primary` `.btn-default`

## 5. 反模式 & 检查清单

写完一个页面后自查：

- [ ] 没有十六进制色值（除 `tokens.json`）—— `grep -E "#[0-9a-fA-F]{6}" your-file.vue`
- [ ] 没有 `window.confirm/alert/prompt`
- [ ] 字号只用 `var(--fs-*)`，没出现 `font-size: 13px` 这种裸值
- [ ] padding/margin/gap 只用 `var(--s-*)`，没有 6/10/14/18/20 这类
- [ ] 按钮有 hover + active + focus-visible 三态
- [ ] 阴影是 `--shadow-1/2/focus`，不是手写 rgba
- [ ] 危险操作（删除 / 注销 / 拒绝）必有二次确认
- [ ] 错误处理用 toast/banner，不是 alert
- [ ] Loading 期按钮 `:disabled` + `opacity 0.5`
- [ ] 输入框 focus 用 `box-shadow: var(--shadow-focus)`，不是 `outline`

## 6. 端到端验证

### 自动化（CI）
```bash
# Token 同步
node shared/tokens/build.mjs && git diff --exit-code shared/ web/src/styles/tokens.css styles/tokens.wxss server/public/{landing,admin,demo}/tokens.css

# 0 硬编码色（除 tokens 文件）
grep -rE "#[0-9a-fA-F]{6}" --include="*.css" --include="*.vue" --include="*.wxss" \
  shared web/src styles app.wxss server/public/{admin,demo} \
  | grep -v "tokens\." | grep -v "AUTO-GENERATED"

# 0 浏览器原生对话框
grep -rE "window\.(confirm|alert|prompt)" web/src

# 构建通过
cd web && pnpm build
```

### 人工走查（每次大改后）
按用户旅程截 8 张图并排对比：Landing 首屏 → 小程序首页 → 小程序上传 → Web 上传 → 小程序匹配列表 → Web 匹配列表 → Admin Dashboard → Demo 第 5 屏。

每张走查项：色板 / 字号梯度 / 圆角阴影 / 间距节奏 / 按钮形态 / 空态 / 错误态 / 文案语气。

## 7. 范围边界（明确不做）

- ❌ 暗色模式 —— token 体系预留 `data-theme="dark"` 钩子，未实施
- ❌ 完整无障碍审计 —— 仅做基础 focus ring（已含在 `--shadow-focus`）
- ❌ i18n —— 中文 only

## 8. 改造履历

| 阶段 | 时间 | 内容 |
|---|---|---|
| Week 1 | 2026-05-02 | shared/tokens 体系 + 5 端 build target |
| Week 2 | 2026-05-02 | Web 基础组件 + composables + style.css token 化 |
| Week 3 | 2026-05-02 | Admin H5 全量重写 + Demo 5 屏新建 |
| Week 4 | 2026-05-03 | Vue admin 4 页 token 化 + 全站微交互 + 本文 |
