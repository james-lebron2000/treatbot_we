# 数愈健康 · 小程序前端开发指南

> 这是给「下一个动小程序代码的人」看的入门 + 沉淀手册。
> 来这里以前先翻一眼 [`docs/design-system.md`](design-system.md)（跨端 token 工作流）和 [`docs/brand-voice-guidelines.md`](brand-voice-guidelines.md)（文案纪律）——本文不重复那两份，只补「**小程序专属**」的部分：设计思想落地路径、当前工程结构、已落地的两轮重做、以及还没动的事。
>
> 受众：写 wxml/wxss/js 的工程师、写文案的设计 / PM、做下一轮视觉抛光的设计师。
>
> 关联文档：
> - [`docs/design-system.md`](design-system.md) — 跨端视觉语言 SSoT（颜色 / 字号 / 圆角 / 阴影 token）
> - [`docs/brand-voice-guidelines.md`](brand-voice-guidelines.md) — 中文文案纪律（6 条铁律、禁用词、错误提示模板）
> - [`docs/PRD-2026Q2-MP-Polish.md`](PRD-2026Q2-MP-Polish.md) — 第二轮抛光的 21 项设计 / PM 双视角 review
> - [`docs/TASKS-2026Q2-MP-Polish.md`](TASKS-2026Q2-MP-Polish.md) — 抛光任务清单（21 项 ✅）

---

## 0. 文档地图

| 你想做什么 | 看这一节 |
|---|---|
| 弄懂为什么这个项目长这样 | [§1 设计思想](#1-设计思想) |
| 找到要改的文件 | [§2 工程结构](#2-工程结构) |
| 写新页 / 加新组件不破规矩 | [§3 baseline & 食谱](#3-baseline--食谱) |
| 看清楚已经做过哪两轮 | [§4 已完成的工作](#4-已完成的工作) |
| 知道哪些坑还没填 | [§5 已知未做与未来优化](#5-已知未做与未来优化) |
| 上线前自查 | [§6 自动化与人工走查](#6-自动化与人工走查) |
| 避免 WeChat 坑 | [§7 微信小程序专属注意事项](#7-微信小程序专属注意事项) |

---

## 1. 设计思想

### 1.1 一句话

**Apple-cozy 视觉语言 + 陪伴型情感语气**——克制的颜色、留白、轻阴影，加上"陪您一起"的称呼，给焦虑中的家属用户一个「既专业又温度」的工具。

### 1.2 谁是 source of truth

视觉跨端对齐：**Landing H5 是 SSoT**。`server/public/landing/` 的颜色 / 字号 / 圆角 / 阴影是基准，小程序、Vue Web、Admin、Demo 都向它对齐。

具体落地路径：所有视觉值从 [`shared/tokens/tokens.json`](../shared/tokens/tokens.json) 出发，[`shared/tokens/build.mjs`](../shared/tokens/build.mjs) 把它编译成 5 份 CSS（含 `styles/tokens.wxss`）。**不允许手改任何 `tokens.css/wxss`**——文件头部有 `AUTO-GENERATED` 警告，CI 会校验 hash。

### 1.3 6 条原则（从抛光复盘蒸馏）

1. **一种主色** — `var(--brand)` 蓝只用于 CTA、eyebrow pill、链接、当前态、focus 环。其它信息一律中性。
2. **中性优先的层次** — `--text` (主) / `--text-dim` (副) / `--text-muted` (占位)。配色 80% 是这三个值。
3. **留白 > 装饰** — section 间 48-64rpx，卡内 24-32rpx，icon-text 间 8-12rpx。Apple 式呼吸。
4. **元素轻量** — `.card` 默认 `2rpx solid var(--line)` + **无静态阴影**，只有 `:active` 才 `translateY(-2rpx) + shadow-1`。
5. **状态用色克制 + 高对比** — `*-soft` 浅底 + `*-text` 深色文字配对（companion token），不要 8% 透明 tint。
6. **渐变只用于 hero（且仅 1 次）** — 其它一律实色。Hero 用 Landing 同款 radial 软光晕（`brand-soft + mint-soft + bg`）。

### 1.4 信任锚点哲学（医疗 B2C 特有）

家属用户 35-55 岁、刚被癌症诊断击中、决定上传敏感病历前会反复扫一眼"这家可信吗"。所以：

- **数字承诺必须有出处** — `5,000+ 在研新药` 下挂 `<view class="stat-caption">来自 chinadrugtrials.org.cn</view>`。
- **隐私承诺必须有兑现页** — profile 写"不存储 / 您保管 / 随时带走"，点进去**必须**有 [`pages/profile/privacy/`](../pages/profile/privacy/) 5 张具体卡片。
- **错误提示必须有"接住的人"** — 找不到匹配 → 不只是"再找一次"，必须有客服 400 + 通知订阅兜底（[`pages/matches/matches.wxml` 空状态](../pages/matches/matches.wxml)）。
- **不能自作主张** — 上传完成不要 1.2s 自动跳走（`PRD §P0-3`），让用户自己决定何时离开核对界面。

### 1.5 文案温度（参考 [`brand-voice-guidelines.md`](brand-voice-guidelines.md)）

- **称呼一致**：永远「您」+「您家人」，不混「你/患者/病人」。
- **禁用词**：结构化、智能化、AI 驱动、赋能、一站式、合规、精准、毫秒级 …… 全屏蔽，参考 brand-voice §禁用词。
- **错误提示模板**：`[共情一句] + [可行动作一句]`。
- **每屏强制词汇池最多 1 次**：陪您 / 别担心 / 您做主 / 不着急 …… 别煽情过头。

---

## 2. 工程结构

### 2.1 顶层目录速读

```
treatbot_we/
├── app.js / app.json / app.wxss              # 框架入口（重点：app.wxss baseline）
├── project.config.json                       # libVersion: 3.14.2（CSS 变量安全）
├── pages/                                    # 9 个一级 / 二级页面
│   ├── index/                                # 首页 hero + stats + 上传 CTA
│   ├── upload/                               # 上传 / 解析 / 字段补全（核心漏斗页）
│   │   └── status/                           # 异步解析结果跳转页
│   ├── manualEntry/                          # 手动录入兜底
│   ├── matches/                              # 试验/新药匹配列表
│   │   ├── apply/                            # 申请详情
│   │   └── detail/                           # 试验详情
│   ├── records/                              # 病历管理
│   │   └── detail/                           # 单条病历详情
│   ├── profile/                              # 用户中心
│   │   ├── consent/                          # 同意记录（合规自助）
│   │   └── privacy/                          # 隐私承诺独立页（PRD §P0-2）
│   ├── search/                               # 搜索（暂未在 tabBar）
│   ├── guide/                                # 引导页
│   └── demo/                                 # 路演演示页（独立视觉栈，不动）
│       └── matches/                          # demo 子页
├── components/                               # 6 个共用组件
│   ├── icon/                                 # Lucide SVG 全套 21 个图标
│   ├── card/ empty/ help-fab/ loading/       # baseline 已 token 化
│   └── parse-progress-banner/                # PRD §P1-3 抽离的解析进度条
├── shared/                                   # 跨端逻辑 / 文案 / token
│   ├── copy/                                 # 文案集中（重要！）
│   │   ├── upload.js  matches.js  records.js
│   │   ├── glossary.js                       # 医学词典：把 ECOG/HER2 翻成人话
│   │   └── help.js                           # FAQ / 客服文案
│   ├── schemas/upload.js                     # 字段校验
│   └── tokens/                               # tokens.json + build.mjs（不要手改输出！）
├── styles/                                   # auto-generated tokens.wxss + common.wxss
└── docs/                                     # 你正在看的这本
```

### 2.2 三个文件你必须知道

| 文件 | 作用 | 改它的时候要 |
|---|---|---|
| [`app.wxss`](../app.wxss) | 全局 baseline（page / .card / .btn / .text-* / .pill-* / .hero-shell / .step-num） | 慎重——会 cascade 到所有页面 |
| [`shared/tokens/tokens.json`](../shared/tokens/tokens.json) | 跨端 token 唯一可改源 | 改完跑 `node shared/tokens/build.mjs` 回填 5 份输出 |
| [`components/icon/icon.js`](../components/icon/icon.js) | 21 个 Lucide SVG path 字典 + 颜色字典 | 加新图标只在 `PATHS` 追加一条；颜色与 tokens.json 同步 |

### 2.3 page / component 文件四件套

每个 wxml 页 / 组件都是 `xxx.wxml` + `xxx.wxss` + `xxx.js` + `xxx.json`：

- `.json` 里记得在 `usingComponents` 注册组件，例如 `"icon": "/components/icon/icon"`。
- `.wxss` 颜色 / 字号 / 圆角 / 间距 / 阴影**一律 token**，不要硬编码 hex。
- 共用样式提到 `app.wxss` 或 `components/`，不要跨页复制。

---

## 3. baseline & 食谱

### 3.1 baseline 速查（[`app.wxss`](../app.wxss)）

| 类名 | 用途 | 关键样式 |
|---|---|---|
| `.container` | 页面外框 | `padding: 32rpx 32rpx 96rpx` |
| `.card` | 通用卡片 | 实白底 + `2rpx solid var(--line)` + `r-lg` + 无静态阴影；`:active` 才浮起 |
| `.btn .btn-primary` | 主 CTA | 88rpx 高 + brand 实色 + brand 染透阴影；`:active` scale(0.98) + brand-hover |
| `.btn .btn-ghost` | 次 CTA | 白底 + brand 字 + brand-soft 边 |
| `.btn .btn-danger` | 删除 / 注销 | `var(--red)` 实色 |
| `.text-display .text-title .text-subtitle .text-body .text-callout .text-caption` | 6 阶字号 | 68 / 44 / 34 / 30 / 28 / 24rpx |
| `.text-brand .text-mint .text-amber .text-red .text-dim .text-muted` | 6 色文本 | `*-text` companion 自动正确对比度 |
| `.pill-brand .pill-mint .pill-amber .pill-red .pill-lilac` | 状态徽章 | `*-soft` 底 + `*-text` 字（companion） |
| `.hero-shell` | 大入口 hero（仅 index / profile 用） | 双 radial 软光晕 + `r-lg` |
| `.hero-eyebrow` | hero 顶 pill | brand-soft 底 + brand 字（**注意**：用 `<view>` 不要 `<text>`，PRD §P0-6） |
| `.step-num` `.step-num.active` | 步骤指示器 | 56rpx 圆，待办 = bg-soft，进行中 = brand 实色 |

### 3.2 加一个 Lucide 图标

1. 去 [lucide.dev](https://lucide.dev) 找图标，复制 24×24 SVG inner（不含 `<svg>` 外壳）。
2. 在 [`components/icon/icon.js`](../components/icon/icon.js) `PATHS` 字典加一条：
   ```js
   'my-icon':
     '<path d="..."/>' +
     '<circle cx="..." cy="..." r="..."/>',
   ```
3. wxml 用法：`<icon name="my-icon" color="brand" size="36" strokeWidth="2" />`
4. `color` 接受 `brand|mint|amber|red|lilac|text|text-dim|text-muted|white` 这 9 个 token；新加色记得在 `COLORS` 字典里也加一条。
5. 不要直接 emoji（📷 💊 🔒）或中文字符（「档」「药」「报」）——上一轮抛光把它们全清掉了。

> 已有 21 个：file-text / pill / shield-check / clipboard-list / phone-call / search / building-2 / map-pin / lightbulb / camera / upload-cloud / check / check-circle / x-circle / alert-circle / chevron-right / arrow-right / trash-2 / plus / user / lock / bell

### 3.3 加一个状态徽章

```xml
<!-- 已申请 -->
<view class="pill pill-mint">已申请</view>
<!-- 新匹配 -->
<view class="pill pill-brand">新</view>
<!-- 待补字段 -->
<view class="pill pill-amber">待补</view>
<!-- 不匹配 / 已删除 -->
<view class="pill pill-red">不符合</view>
```

不要写 `rgba(217,119,6,0.08)` 这种 8% 透明 tint——对比度过低，35-55 岁老花镜用户看不到。`*-soft + *-text` companion 已经过对比度校准。

### 3.4 加一个新页

1. 建目录 `pages/foo/foo.{wxml,wxss,js,json}`。
2. 在 [`app.json`](../app.json) `pages` 数组里追加 `"pages/foo/foo"`（不带后缀）。
3. wxml 顶层用 `<view class="container">`（外框 padding）。
4. 引用图标：在 `foo.json` 的 `usingComponents` 加 `"icon": "/components/icon/icon"`。
5. 颜色 / 字号 / 圆角不要硬编码——直接用 `app.wxss` 的 utility（`.text-body` `.pill-brand` `.btn-primary` 等）。
6. 自查 `grep -E "#[0-9a-fA-F]{6}" foo.wxss`：应该 0 命中。

### 3.5 写一段错误提示

参考 [`brand-voice-guidelines.md` §4](brand-voice-guidelines.md) 模板：`[共情一句] + [可行动作一句]`。

文案集中放 [`shared/copy/upload.js`](../shared/copy/upload.js) 等模块——不要直接在 js 里写中文字符串字面量，方便文案 / 法务 / 设计统一过审。

```js
// shared/copy/upload.js（已有的样式）
module.exports = {
  errors: {
    network: {
      title: '网络好像不太给力',
      action: '检查一下连接，再传一次试试'
    },
    parseFailed: {
      title: '这份病历我们没看清',
      action: '可以拍清楚再传，或者直接手填关键信息'
    }
  }
}
```

### 3.6 使用 `<parse-progress-banner>`

抽离自 PRD §P1-3，统一了 matches + index 的解析进度条。

```xml
<!-- pages/xxx/xxx.json -->
"usingComponents": {
  "parse-progress-banner": "/components/parse-progress-banner/parse-progress-banner"
}

<!-- pages/xxx/xxx.wxml -->
<parse-progress-banner
  title="病历还在帮您看懂中"
  progress="{{progress}}"
  statusText="{{etaText}}"
  showActions="{{true}}"
>
  <view slot="actions">
    <text bindtap="goToRecords">看病历</text>
    <text bindtap="goToMatches">看新药</text>
  </view>
</parse-progress-banner>
```

---

## 4. 已完成的工作

### 4.1 Phase F — 跨端视觉对齐（W1-W4，2026-05-02 ~ 05-03）

| Week | 范围 | 关键 commit |
|---|---|---|
| W1 | shared/tokens 体系 + 5 端 build target | `6fd27e1` |
| W2 | Vue Web 基础组件 + composables；小程序 SVG icon 组件 + wx 反馈包装 | `1bfe1b7` `a986fa7` |
| W3 | Admin H5 全量重写 + Demo 5 屏新建 | `929a47d` |
| W4 | Vue admin 4 页 token 化 + 全站微交互 + `docs/design-system.md` | `e65f6b1` |

详见 [`docs/design-system.md` §8 改造履历](design-system.md#8-改造履历)。

### 4.2 Plan §web-h5-cozy-gizmo V2 — 5 页 Apple-cozy 重做（2026-05-04）

> commit `0aec68c` · 一键合并：`97d9ab5`

把 5 个 user-facing 页面（index / upload / matches / records / profile）+ 4 个共用组件 + `app.wxss` baseline 全部重做，把"10+ 种蓝色并存"「emoji + 中文字符 div 假图标」「glass morphism + 重阴影」整治成 Landing 同款 A 级语言。

落地物：

- `app.wxss` 重写（B.1-B.7）：page / .container / .card / .btn × 4 / 6 阶字号 utility / 6 色文本 utility / 5 色 pill / `.hero-shell`
- `app.json` tabBar 三色 token 对齐
- `components/icon/` 扩到 21 个 Lucide path（覆盖 emoji / 中文字符 / Unicode 装饰符全部替换需求）
- `components/card/ empty/ loading/ help-fab/` 全部 token 化
- 5 页 wxml + wxss 重做：hero / stats / 上传 CTA / 匹配卡片 / 病历列表 / profile 菜单全部 baseline 化

视觉评级目标（写在 plan §I）：从 D（10+ 蓝、emoji、glass、重阴影）升到 A（1 brand + 4 语义、100% Lucide、实白 + 1px 边、6 阶语义 token、Landing 同款 radial 浅光）。

### 4.3 PRD-2026Q2-MP-Polish — 21 项打磨（2026-05-05）

> commit `4ed8974` · 详见 [`docs/PRD-2026Q2-MP-Polish.md`](PRD-2026Q2-MP-Polish.md) + [`docs/TASKS-2026Q2-MP-Polish.md`](TASKS-2026Q2-MP-Polish.md)

5-page 重做后由「资深产品设计师 + 资深医疗 B2C PM」双视角 review，发现 21 项可改进项，按对**信任 / 转化 / 视觉精致度**的影响分三档落地：

**P0（8 项 · 必修）—— 信任 & 可访问性硬伤**

| ID | 内容 | 影响 |
|---|---|---|
| T0-1 | stats 数字色 brand → text，加 caption 出处 | 主色失去克制问题；首页"凭什么信你"得到机构背书 |
| T0-2 | 隐私承诺 modal → 独立页 [`pages/profile/privacy/`](../pages/profile/privacy/) 5 张卡 | 兑现首页"不存储 / 您保管"承诺 |
| T0-3 | 取消 upload 完成态 1.2s 自动跳转 | 让用户自己决定何时离开核对界面 |
| T0-4 | matches 空状态三步兜底（订阅 / 客服 / 覆盖说明） | 罕见癌种用户漏斗最后一公里救回 |
| T0-5 | upload `✓` Unicode → `<icon name="check">` | 跨厂商安卓视觉一致性 |
| T0-6 | hero-eyebrow `<text>` → `<view>` | `inline-flex` 在 `<text>` 节点上不可预测 |
| T0-7 | 文本链接点击区扩到 88rpx（WCAG AA） | 老花镜 + 粗手指命中率 |
| T0-8 | profile「正在联络的」假入口注释下线 | 漏斗最深处不能掉链子 |

**P1（7 项 · 一致性 + 留存）**

| ID | 内容 |
|---|---|
| T1-1 | gap-section amber 拆细：外框中性 + 头部 amber pill |
| T1-2 | upload-area dashed 边 brand-soft → brand（对比度 → AA） |
| T1-3 | 抽 [`components/parse-progress-banner/`](../components/parse-progress-banner/) 共用组件 |
| T1-4 | hero title `line-height` 1.18 → 1.3（避免下一行剃顶） |
| T1-5 | matches 三个统计文案补 8 字内说明 |
| T1-6 | records 复购钩子 + 删除 modal 带客服两段流程 |
| T1-7 | upload step 3 双按钮简化为单 primary CTA |

**P2（5 项 · 锦上添花）**

| ID | 内容 |
|---|---|
| T2-1 | matches「看详情/收起」从 score-badge 下方移到右上角 chevron |
| T2-2 | step 数字圆 56rpx + `.step-num` utility（统一 index 3-step / onboarding / upload step） |
| T2-3 | profile version-info 拆 2 行（价值 tagline + 版本号） |
| T2-4 | tabBar「匹配」→「新药」（与全站口径对齐） |
| T2-5 | upload remark placeholder 给 3 个具体场景 |

**新增产物**：
- [`components/parse-progress-banner/`](../components/parse-progress-banner/) — 共用组件
- [`pages/profile/privacy/`](../pages/profile/privacy/) — 独立页 5 张卡
- [`shared/copy/matches.js`](../shared/copy/matches.js) — 匹配文案集中
- [`shared/copy/records.js`](../shared/copy/records.js) — 病历钩子文案集中

---

## 5. 已知未做与未来优化

### 5.1 暂不动 · 等其它团队拍板

| 议题 | 卡点 | 跟踪 |
|---|---|---|
| matches `trialName` → `drugName`（"找到的新药"） | 法务需确认免责声明 + 加底部小字"临床研究阶段，免费用药 = 加入研究" | PM + 法务 |
| 导出数据 → 改生成 PDF / 图片 | 是产品功能改造，需后端配合 (cos.js + medical/export 接口) | PM + 后端 |
| 完成后"截图发家庭群"钩子 | 隐私雷区，单独评估 | PM + 法务 |
| stats 区机构背书具体数字 | 商务侧合作可公开范围 | PM + 商务 |

### 5.2 已下线 · 等功能就绪再恢复

| 项 | 文件 | 恢复条件 |
|---|---|---|
| profile「正在联络的新药」menu-item | [`pages/profile/profile.wxml:80-94` 注释段](../pages/profile/profile.wxml) | PRD-2026Q3 H4「申请追踪」上线后改 `wx.navigateTo('/pages/applications/applications')` |

### 5.3 视觉栈分叉 · 路演侧

[`pages/demo/`](../pages/demo/)（含 [`pages/demo/matches/`](../pages/demo/matches/)）保留独立视觉栈——路演投屏需要的彩色卡片是有意为之，**不要 cascade baseline**。如果路演风格统一了再考虑合并。

### 5.4 框架预留 · 还没接

- **暗色模式** — token 体系预留 `data-theme="dark"` 钩子，未实施。Web / Admin 也未实施，跨端一起做。
- **完整无障碍审计** — 仅做了基础 focus ring（`--shadow-focus`）和点击区 88rpx（WCAG AA）。屏幕阅读器适配 / 大字号 / 高对比度模式未做。
- **i18n** — 中文 only。
- **tabBar PNG icon Lucide 化** — `images/home.png` 等 PNG 还没替换成 Lucide 出图（white@2x + brand@2x），优先级 low。

### 5.5 抛光复盘后留下的小尾巴

| 项 | 现状 | 优化方向 |
|---|---|---|
| `.step-num` utility 已建（T2-2） | index 三处 + onboarding + upload step 已替换 | 还有 manualEntry / search 等次要页面未扫，下次顺手 |
| `<parse-progress-banner>` 已抽（T1-3） | matches + index 替换 | 如果 records 详情页未来也要 progress，记得复用 |
| matches 卡片 chevron 移到右上（T2-1） | 56rpx 圆形 indicator 替代下方文字 | 仍可能与 score-badge 视觉重量打架，需真机走查 |
| upload remark placeholder 多行（T2-5） | 用 `data.remarkPlaceholder` 字符串带真 `\n` | WeChat WXML 不会解码 `&#10;` 实体——这是上一次踩到的坑，留意 |

### 5.6 没有埋点 · 没法量化

- 所有"预期 +X% 转化提升"目前**没有客户端埋点漏斗**支持，PRD 里写的数字是行业经验值。
- 等 PRD-2026Q3 加 funnel 埋点后才能 A/B / 前后对比量化。

### 5.7 没动业务逻辑 · 但是已识别

- upload 解析进度（Track C-3 v2 线性 60s + Track D ETA）已稳定，**不要再动模拟逻辑**。如果发现 60s 不够，先改服务端真进度上报，再前端跟进。
- parseTask 状态机 / 字段校验 / shared/copy 文案 全部不动——上一轮抛光严格保持业务逻辑零改动。

---

## 6. 自动化与人工走查

### 6.1 自动化 grep 自查

```bash
# 1. 0 硬编码色（demo + tokens + AUTO-GENERATED 除外）
grep -rE "#[0-9a-fA-F]{3,6}\b" --include="*.wxss" pages/ components/ app.wxss \
  | grep -v tokens.wxss | grep -v pages/demo/ | grep -v AUTO-GENERATED
# 期望：0 命中

# 2. 0 emoji 装饰
grep -rE "📄|💊|🔒|📋|📷|🗑|❓|⚠️|✅|❌|🔍|💡" --include="*.wxml" pages/ components/ \
  | grep -v pages/demo/
# 期望：0 命中

# 3. 0 中文字符假 icon
grep -E '<view class="menu-icon">[^<]{1,2}</view>' pages/profile/profile.wxml
# 期望：0 命中

# 4. 0 Unicode 装饰符（✓/›/×）作为图标
grep -rE '<text[^>]*>[✓›‹×→←]</text>' --include="*.wxml" pages/ components/ \
  | grep -v pages/demo/
# 期望：0 命中（× 删除按钮可保留，需 case-by-case）

# 5. 0 浏览器原生对话框
grep -rE "wx\.showModal" pages/ | grep -v "\.confirm\|\.cancel\|action:" \
  | grep -E "alert|确认" | head
# 检查：每个 showModal 都应该是合理的二次确认，不是简单 alert

# 6. 字号不能裸 px
grep -rE "font-size:[[:space:]]*[0-9]+px" --include="*.wxss" pages/ components/ \
  | grep -v pages/demo/
# 期望：0 命中（小程序应该全 rpx）
```

### 6.2 token build 校验（CI 已加）

```bash
node shared/tokens/build.mjs
git diff --exit-code styles/tokens.wxss server/public/{landing,admin,demo}/tokens.css web/src/styles/tokens.css
# 期望：exit 0（输出与 tokens.json 同步）
```

### 6.3 人工走查 5 屏（每次大改后）

按从 Landing 进入小程序的真实路径：

1. Landing 首屏 → 小程序 index hero（截图并排对比色板 / 字号 / 阴影）
2. index → upload（拍照态 + 解析态 + 完成态）
3. matches 列表（≥ 1 试验卡 + 0 试验空状态三 card）
4. records 列表（含复购钩子）
5. profile（含 stats + menu + 隐私页跳转）

每屏检查：色板（brand + 4 语义） / 字号节奏（display→caption） / 卡片无静态阴影、按下浮起 / icon 全 Lucide / 命中区 ≥ 88rpx / 文案温度（"您家人"称呼一致）。

**机型至少要看**：iOS（iPhone 13+）+ OPPO（ColorOS）+ vivo（OriginOS）+ 小米（MIUI / HyperOS）。安卓字符差异是上一轮 P0-5 真实踩过的坑。

---

## 7. 微信小程序专属注意事项

> 这一节是历次踩坑的沉淀，第一次写小程序的人**必看**。

### 7.1 CSS 变量必须用 `page` 选择器，不能用 `:root`

WXSS 不识别 `:root`——`:root { --brand: #2563eb }` 会**静默失效**。token 文件里所有变量都挂在 `page` 选择器：

```css
/* styles/tokens.wxss */
page {
  --brand: #2563eb;
  --brand-soft: #dbeafe;
  ...
}
```

这是上一轮抛光踩到过的坑（commit `7c96232`），build script 已经处理；自己写新 token 也守这条规则。

### 7.2 `<text>` 是 inline-only

`<text>` 节点上设 `display: inline-flex / block / flex` 行为不可预测，多机型会塌成 inline。需要 flex 容器时用 `<view>`：

```xml
<!-- ❌ 错（PRD §P0-6 修过的坑） -->
<text class="hero-eyebrow">数愈健康</text>

<!-- ✅ 对 -->
<view class="hero-eyebrow">
  <text>数愈健康</text>
</view>
```

### 7.3 wxss `var()` 输出 px 时不随屏宽缩放

`tokens.wxss` 内 spacing / radii / font-size 用 `px`（跨端语义一致），但 WXSS 直接 `padding: var(--s-4)` 出来是 16px，**不随屏宽缩放**——小程序应当 rpx。

所以 `app.wxss` 里所有尺寸（padding / radius / font-size / shadow）写 rpx，颜色才用 `var(--*)`。换算：1px = 2rpx，`--s-4` = 16px → 32rpx，`--fs-body` = 15px → 30rpx。

### 7.4 placeholder 中的 `\n` 不要用 HTML 实体

WeChat WXML 不会解码 `&#10;` / `&#xa;` 等 HTML 实体。多行 placeholder 要么放 `data` 里用真 `\n`，要么用 `wxs`：

```js
// ✅ 对（PRD §T2-5 留下的最佳实践）
data: {
  remarkPlaceholder: '例如：\n· 上周刚做完第 3 周期化疗\n· 想找口服的方案'
}
```

```xml
<textarea placeholder="{{remarkPlaceholder}}" />
```

### 7.5 危险操作必有二次确认 + 客服兜底

删除病历 / 注销账号 → `wx.showModal({ confirmText: '...', confirmColor: '#dc2626' })` 二次确认；同步给"找客服"路径（[`records.js:123` modal 带客服电话](../pages/records/records.js)）。

### 7.6 `wx.navigateTo` vs `wx.redirectTo`

- 默认 `navigateTo`（保留返回栈）。
- `redirectTo` 只在「关闭当前页"再也不要回来"」时用（如 logout）。
- **绝对不要** 自动 `redirectTo`——上一轮 PRD §P0-3 把 upload 完成态 1.2s `redirectTo` 删了。

### 7.7 `<button>` 默认有微信原生样式

baseline 里 `.btn-primary` 用 view 重写效果好。如果用 `<button>`，记得：

```xml
<!-- 取消默认蓝边 + 默认 padding -->
<button class="btn btn-primary" hover-class="none" plain="{{false}}" />
```

### 7.8 lazyCodeLoading 已开

`app.json` 里 `"lazyCodeLoading": "requiredComponents"`——只编译被引用的组件 js，加载更快。新组件记得在用它的页面 `.json` 里 `usingComponents` 注册才会被加载。

### 7.9 `requiredBackgroundModes: ["audio"]` 是为了什么

为「上传后台不被掐」预留——目前业务没用到 audio，但拿掉前先确认 upload 长流程不被微信后台杀掉。

---

## 8. 写完这一段你应该能做到的事

- 给一个新需求（"加一个分享卡片页"），你能：
  - 知道在 `pages/share/` 建文件 + `app.json` 注册
  - 用 `.hero-shell` `.card` `.btn-primary` 直接拼出 baseline
  - 给图标加 icon 字典而不是放 emoji
  - 写文案过 [brand-voice §6 铁律](brand-voice-guidelines.md#6-条铁律) 自查
  - 自动化 grep 一遍硬编码色 + emoji + Unicode 装饰
  - 真机 4 机型走查

- 给一条 bug（"profile 隐私页对比度太弱"），你能：
  - 直接定位 [`pages/profile/privacy/privacy.wxss`](../pages/profile/privacy/privacy.wxss)
  - 不改 hex，改 `*-soft + *-text` companion
  - 知道 token 改源在 `tokens.json`，不要手改 `tokens.wxss`

- 给一个抛光机会（"下一轮设计要再升一档"），你能：
  - 在 [§5 已知未做](#5-已知未做与未来优化) 里挑一个开做
  - 知道哪些是法务卡点不能私自动（trial → drug 文案、家庭群分享钩子等）
  - 知道 demo 页保留独立栈不要 cascade

---

## 9. 改造履历

| 阶段 | 时间 | 关键 commit | 内容 |
|---|---|---|---|
| Phase F W1 | 2026-05-02 | `6fd27e1` | shared/tokens 体系 + 5 端 build target |
| Phase F W2 | 2026-05-02 | `1bfe1b7` `a986fa7` | Vue Web 基础组件 + 小程序 SVG icon 组件 |
| Phase F W3 | 2026-05-02 | `929a47d` | Admin H5 全量重写 + Demo 5 屏新建 |
| Phase F W4 | 2026-05-03 | `e65f6b1` | Vue admin 4 页 token 化 + 全站微交互 + design-system.md |
| 5-page 重做 | 2026-05-04 | `0aec68c` (一键合 `97d9ab5`) | 5 个 user-facing 页 + 4 个组件 + app.wxss baseline 全部 Apple-cozy |
| `:root` → `page` 修复 | 2026-05-04 | `7c96232` | WXSS 不认 `:root`，build.mjs 修正 |
| 抛光 21 项 | 2026-05-05 | `4ed8974` | PRD-2026Q2-MP-Polish T0×8 + T1×7 + T2×5（信任锚点 / 可访问性 / 文案温度 / 视觉一致性） |
| 前端指南 | 2026-05-05 | _本文_ | 沉淀给下一个动小程序代码的人 |
