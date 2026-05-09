# Treatbot 2026 Q2 — 任务清单（小程序 UI 抛光·细化版）

> 与 [docs/PRD-2026Q2-MP-Polish.md](PRD-2026Q2-MP-Polish.md) 一一对应。
> 每条任务包含：**修改项 · 目的 · 产品视角 · 用户视角 · 设计视角 · 完成后获益 · 实施步骤 · 验收标准 · 工时**。
> 状态：⬜ 未开始 / 🔄 进行中 / ✅ 已完成 / 🚫 阻塞
> 工时：S ≤ 0.5d / M = 0.5-1d / L ≥ 1d
> 依赖标记：`← 依赖 Tx-y`

---

## P0 — Sprint Day 1-2（5/5 – 5/6）

### T0-1 · stats 区整块重做（PRD P0-1）

**状态**：⬜ | **工时**：M（0.8d）| **负责模块**：index + profile

**修改项**
- `pages/index/index.wxml:39-52` — 三个数字色 + 「零」字 + 加 caption
- `pages/index/index.wxss` — `.stat-number` 颜色 token 切换
- `pages/profile/profile.wxml` — profile stats 同步
- `pages/profile/profile.wxss:146` — 颜色 token 同步

**实施步骤**
1. 改 `.stat-number` 的 `color: var(--brand)` → `color: var(--text)`，字重保持 700。
2. 第三个 stat「零隐私数据留存」整块替换：
   ```xml
   <view class="stat-item">
     <icon name="lock" color="brand" size="64" />
     <view class="stat-text">数据由您掌控</view>
     <view class="stat-caption">个保法第 13 条第二款（二）项</view>
   </view>
   ```
3. 前两个 stat 加 caption：
   - `5,000+ 在研新药` 下：`<view class="stat-caption">来自 chinadrugtrials.org.cn</view>`
   - `10,000+ 已找到免费用药` 下：`<view class="stat-caption">含三甲合作渠道</view>`
4. 新增 `.stat-caption` 样式：`font-size: 22rpx; color: var(--text-muted); margin-top: 4rpx;`
5. profile stats 同步颜色调整（不加 caption，避免重复信息）。

**验收标准**
- [ ] 首页 stats 数字 visually weighted 不抢主 CTA
- [ ] 第三 stat 不再用「零」字，改 icon + 文字
- [ ] 三 stat 都有 caption 出处
- [ ] profile stats 颜色统一

---

### T0-2 · 隐私承诺兑现（PRD P0-2）

**状态**：⬜ | **工时**：M（1d）| **负责模块**：profile/privacy（新页）

**修改项**
- `app.json` — 注册 `pages/profile/privacy/privacy`
- `pages/profile/privacy/privacy.{wxml,wxss,js,json}` — 新页或重写
- `pages/profile/profile.js:122-128` — `showPrivacyPolicy` 改 `wx.navigateTo`

**实施步骤**
1. 检查 `pages/profile/privacy/` 目录现状（已存在但未注册）。
2. `app.json` `pages` 数组追加 `pages/profile/privacy/privacy`。
3. 隐私页 wxml 结构：
   - 顶部 `<icon name="shield-check" color="brand" size="120">` + 标题 "您的数据由您掌控"
   - 5 张 `.card` 横排：
     - **存什么**：仅病历影像 + 解析后的结构化字段（不存身份证）
     - **存多久**：默认 30 天，可一键删除
     - **谁能看**：仅本账号 + AI 模型，不分享给第三方
     - **怎么删**：profile → 注销账户，30 秒生效
     - **找客服**：400-666-8899（工作日 9:00-18:00）
   - 每张 card 用 `<icon name="check-circle" color="mint">` 前缀
4. `showPrivacyPolicy` 改：`wx.navigateTo({ url: '/pages/profile/privacy/privacy' })`

**验收标准**
- [ ] profile 隐私 menu-item 跳转到独立页
- [ ] 5 条具体承诺可见，每条独立卡
- [ ] 客服电话直接可拨（`<button open-type="contact">` 或 `wx.makePhoneCall`）

---

### T0-3 · 取消 upload 完成态自动跳转（PRD P0-3）

**状态**：⬜ | **工时**：S（0.3d）| **负责模块**：upload

**修改项**
- `pages/upload/upload.js:1244-1258` — 删 `shouldAutoRedirect` 1.2s 跳转
- 完成态保留 + sticky CTA 维持

**实施步骤**
1. 定位 `shouldAutoRedirect` 相关代码块（搜 `setTimeout` + `wx.redirectTo`）。
2. 移除 `setTimeout` block；保留 `setData({ currentStep: 3 })` 让用户停在 step 3。
3. 验证 `pages/upload/upload.wxml:263` 的 sticky CTA "看看为家人找到的新药" 仍正常工作。
4. 加一行 toast：完成时 `wx.showToast({ title: '信息已保存', icon: 'success', duration: 1500 })`。

**验收标准**
- [ ] 上传完成后页面停在 step 3，不自动跳走
- [ ] 用户主动点 sticky CTA 才跳转
- [ ] 跳转用 `wx.navigateTo`（保留返回栈）

---

### T0-4 · matches 空状态三步兜底（PRD P0-4）

**状态**：⬜ | **工时**：M（0.7d）| **负责模块**：matches

**修改项**
- `pages/matches/matches.wxml:155-158` — empty 区重做
- `pages/matches/matches.wxss` — empty 区样式
- `pages/matches/matches.js` — `notifyOnNewMatch` handler（新增）
- `shared/copy/matches.js`（新建）— 文案集中

**实施步骤**
1. 在 `shared/copy/matches.js` 新建文案：
   ```js
   module.exports = {
     empty: {
       title: '目前没找到完全贴合的新药',
       coverage: '我们目前覆盖 {n} 个癌种，您家人的诊断暂未在库',
       notifyHook: '新药出现立刻通知您',
       contactHook: '找真人帮看看',
       contactPhone: '400-666-8899'
     }
   }
   ```
2. matches.wxml empty 区改三 card grid：
   - card 1：`<icon name="bell">` + "新药出现立刻通知您" + `.btn-ghost` "留个联系方式"
   - card 2：`<icon name="phone-call">` + "找真人帮看看" + `.btn-primary` "拨打客服"
   - card 3：纯文本说明覆盖范围
3. js 加 `notifyOnNewMatch` handler，调后端 `/api/medical/notify-subscribe`（如已有）或先存 local + 提示"已记录"。
4. 客服电话用 `wx.makePhoneCall({ phoneNumber: '400-666-8899' })`。

**验收标准**
- [ ] 0 结果页面三 card grid 显示
- [ ] "留联系方式"按钮点击有反馈（toast 或弹层）
- [ ] "拨打客服"按钮真能拉起拨号
- [ ] 覆盖范围文字正确显示当前癌种数（占位 `{n}` 替换）

---

### T0-5 · upload `✓` Unicode → Lucide（PRD P0-5）

**状态**：⬜ | **工时**：S（0.1d）| **负责模块**：upload

**修改项**
- `pages/upload/upload.wxml:124`

**实施步骤**
1. 找到 `<text wx:if="{{parseStep > index}}" class="parse-step-badge-text">✓</text>`
2. 替换为：`<icon name="check" color="white" size="28" strokeWidth="3" />`
3. 验证 `.parse-step-badge` 的 width/height 兼容 icon（如需调整则调）

**验收标准**
- [ ] 跨厂商安卓（OPPO + vivo + 小米）勾号视觉一致
- [ ] grep `pages/*/wxml` 无 Unicode 装饰符（除 `×` 删除按钮可保留）

---

### T0-6 · hero-eyebrow `<text>` → `<view>`（PRD P0-6）

**状态**：⬜ | **工时**：S（0.1d）| **负责模块**：index

**修改项**
- `pages/index/index.wxml:31`

**实施步骤**
1. 找到 `<text class="hero-eyebrow">数愈健康 · 用药全程免费</text>`
2. 替换为：
   ```xml
   <view class="hero-eyebrow">
     <text>数愈健康 · 用药全程免费</text>
   </view>
   ```
3. 验证 baseline `.hero-eyebrow` 的 `inline-flex` 在 view 节点上正常生效。

**验收标准**
- [ ] iOS + 安卓 hero eyebrow 高度稳定
- [ ] padding 不被吞

---

### T0-7 · 文本链接点击区扩大（PRD P0-7）

**状态**：⬜ | **工时**：S（0.4d）| **负责模块**：跨 5 页

**修改项**
- `pages/index/index.wxss:242-247` — `.processing-card-link`、`.view-all`
- `pages/profile/profile.wxss` — menu-item 内嵌链接
- `pages/records/records.wxss` — 卡片内辅助操作
- `pages/matches/matches.wxss` — 同类位

**实施步骤**
1. grep 全工程找 "view-all|card-link|action-link" 等 className，逐个查 padding。
2. 凡 padding 不足的（裸文字 + `font-size: 28rpx`）加：
   ```css
   .xxx-link {
     padding: 16rpx 24rpx;
     margin: -16rpx -24rpx;  /* 视觉无感 */
   }
   ```
3. 必要时给父容器 `display: flex; align-items: center;` 防止扩大后挤压。

**验收标准**
- [ ] 5 页所有交互元素命中区 ≥ 88rpx × 88rpx
- [ ] 视觉布局无变化（padding 是负 margin 抵消的）
- [ ] 真机老花镜场景测试通过

---

### T0-8 · "正在联络的"假入口处理（PRD P0-8）

**状态**：⬜ | **工时**：S（0.2d）| **负责模块**：profile

**修改项**
- `pages/profile/profile.js:98-104` — `showOngoingTrials` 行为
- `pages/profile/profile.wxml:80-89`（如选 a 方案）— 隐藏 menu-item

**实施步骤**
- **方案 (a)**（推荐）：
  1. 在 profile.wxml 注释掉 "正在联络的" menu-item block
  2. 加 TODO 注释：`<!-- TODO: 后续版本上线后恢复，关联 PRD-2026Q3 H4 -->`
- **方案 (b)**：
  1. 改 `showOngoingTrials` 函数 modal 内容：
     ```js
     wx.showModal({
       title: '我们正在联络中',
       content: '我们会在 1-3 个工作日内电话联系您。\n如需立即咨询，请拨打客服 400-666-8899',
       confirmText: '拨打客服',
       success: (res) => res.confirm && wx.makePhoneCall({ phoneNumber: '400-666-8899' })
     })
     ```

**验收标准**
- [ ] 用户已申请试验后再进 profile 不会看到"将在后续版本开放"
- [ ] 如选 (b)，可一键拨打客服

---

## P1 — Sprint Day 3-4（5/7 – 5/8）

### T1-1 · gap-section amber 大底色拆细（PRD P1-1）

**状态**：⬜ | **工时**：S（0.2d）| **负责模块**：upload

**修改项**
- `pages/upload/upload.wxss:781-786`

**实施步骤**
1. `.gap-section` 改：
   ```css
   .gap-section {
     background: var(--bg);
     border: 2rpx solid var(--amber-soft);
     border-radius: 32rpx;
     padding: 48rpx;
   }
   ```
2. `.gap-header` 加 amber 顶条暗示：`background: var(--amber-soft); padding: 16rpx 24rpx; border-radius: 24rpx;`
3. `.is-missing` 单字段保持 amber 背景高亮。

**验收标准**
- [ ] gap-section 外观与同页其它 `.card` 风格一致（白底 + 描边）
- [ ] amber 仅在缺失字段处出现

---

### T1-2 · upload-area dashed 边对比度（PRD P1-2）

**状态**：⬜ | **工时**：S（0.05d）| **负责模块**：upload

**修改项**
- `pages/upload/upload.wxss:97`

**实施步骤**
1. `border: 4rpx dashed var(--brand-soft)` → `border: 4rpx dashed var(--brand)`

**验收标准**
- [ ] 上传区虚线边在浅蓝背景上清晰可见

---

### T1-3 · 抽 `<parse-progress-banner>` 共用组件（PRD P1-3）

**状态**：⬜ | **工时**：M（0.7d）| **负责模块**：components + matches + index

**修改项**
- `components/parse-progress-banner/{parse-progress-banner.{wxml,wxss,js,json}}`（新建）
- `pages/matches/matches.wxml` — 替换内嵌进度条
- `pages/index/index.wxml` — 替换内嵌进度条
- `pages/matches/matches.json` + `pages/index/index.json` — 注册组件

**实施步骤**
1. 新建组件，properties：`progress`（Number）、`statusText`（String）、`etaText`（String，optional）
2. 抽出现有较完善版本的 wxml/wxss 作为 baseline
3. matches + index 替换为 `<parse-progress-banner ... />`
4. 删除两处冗余样式

**验收标准**
- [ ] matches 顶部 + index 同位进度条视觉完全一致
- [ ] 修改一处生效两处

---

### T1-4 · hero title 行间撑开（PRD P1-4）

**状态**：⬜ | **工时**：S（0.05d）| **负责模块**：index

**修改项**
- `pages/index/index.wxss:26-33`

**实施步骤**
1. `.hero-title` `line-height: 1.18` → `1.3`
2. `.hero-title-line` `margin-bottom: 4rpx` → `8rpx`

**验收标准**
- [ ] 小屏（iPhone SE / 360pt 安卓）hero 三行不再视觉拥挤

---

### T1-5 · matches 三个统计文案补说明（PRD P1-5）

**状态**：⬜ | **工时**：S（0.2d）| **负责模块**：matches

**修改项**
- `pages/matches/matches.wxml:12-25`
- `pages/matches/matches.wxss` — 加 `.match-stat-caption` 样式

**实施步骤**
1. 每个 stat 数字下加：
   - "找到的新药"：`<view class="match-stat-caption">含已申请 X 种</view>`
   - "高度匹配"：`<view class="match-stat-caption">诊断+基因都对得上</view>`
   - "值得优先申请"：`<view class="match-stat-caption">入组评估通过</view>`
2. caption 样式：`font-size: 22rpx; color: var(--text-muted); margin-top: 4rpx;`

**验收标准**
- [ ] 三 stat 都有 8 字内说明
- [ ] 家属一眼就能看懂区别

---

### T1-6 · records 复购钩子（PRD P1-6）

**状态**：⬜ | **工时**：S（0.4d）| **负责模块**：records

**修改项**
- `pages/records/records.wxml` — 卡片底加钩子
- `pages/records/records.js` — 计算 `daysSinceUpdate` / `unlockableTrials`
- `shared/copy/records.js`（新建或追加）— 钩子文案

**实施步骤**
1. records.js 加 computed：
   ```js
   daysSinceUpdate(record) { return Math.floor((Date.now() - record.updatedAt) / 86400000) }
   ```
2. 钩子文案模板：
   - 30 天内：不显示
   - 30-90 天：`上次更新于 {n} 天前，传一份复查报告，匹配会更准`
   - > 90 天：`上次更新于 {n} 天前，建议传新一份检查报告`
   - 缺基因：`补一份基因报告，可能多解锁 N+ 种新药`
3. wxml 卡片底部加：`<view wx:if="{{record.hookText}}" class="record-hook">{{record.hookText}}</view>`
4. 样式：`color: var(--brand); font-size: 24rpx; margin-top: 12rpx;`

**验收标准**
- [ ] 30 天前的病历卡显示复购钩子
- [ ] 缺基因的卡显示"传基因报告"钩子
- [ ] 新上传的卡（< 30 天）不显示钩子，避免噪音

---

### T1-7 · upload step 3 双按钮简化（PRD P1-7）

**状态**：⬜ | **工时**：S（0.2d）| **负责模块**：upload

**修改项**
- `pages/upload/upload.wxml:262-264`
- `pages/upload/upload.js` — 加 computed `primaryCtaText`

**实施步骤**
1. 删 `<button>信息已补好</button>`
2. 主按钮加 wxs 或 js computed：
   ```js
   get primaryCtaText() {
     return this.data.missingFields.length > 0
       ? `再补 ${this.data.missingFields.length} 项更准 · 直接看新药`
       : '信息已齐 · 看找到的新药'
   }
   ```
3. wxml：`<button class="btn btn-primary" bindtap="startMatching">{{primaryCtaText}}</button>`

**验收标准**
- [ ] step 3 只有一个底部按钮
- [ ] 按钮文案随 missingFields 数量动态切换

---

## P2 — Sprint Day 5（5/12）

### T2-1 · matches 卡片"看详情/收起"提到右上

**状态**：⬜ | **工时**：S（0.2d）

**修改项**：`pages/matches/matches.wxml:90` + `pages/matches/matches.wxss:339-343`

**实施步骤**：把 `.match-expand-indicator` 移到 `.match-card-header` flex 末端，与 score badge 同 baseline。

---

### T2-2 · step 数字圆尺寸统一

**状态**：⬜ | **工时**：S（0.3d）

**修改项**：`app.wxss` 加 `.step-num` utility（56rpx 直径，brand soft 底，brand 字）；替换 `pages/index/index.wxss:464-475`、`372-384`、`pages/upload/upload.wxss:27-39` 三处 ad-hoc 实现。

---

### T2-3 · profile version-info 拆 2 行

**状态**：⬜ | **工时**：S（0.1d）

**修改项**：`pages/profile/profile.wxml:162` 拆两行 — 第一行情感文案 28rpx text-dim，第二行 `v1.1.0` 24rpx text-muted。

---

### T2-4 · tabBar "匹配" → "新药"

**状态**：⬜ | **工时**：S（0.05d）

**修改项**：`app.json:23-53` `text: "匹配"` → `text: "新药"`

**注意**：这是漏斗最关键的入口文字，改完跑全 tabBar 一遍真机视觉确认。

---

### T2-5 · upload remark placeholder 多举一例

**状态**：⬜ | **工时**：S（0.05d）

**修改项**：`pages/upload/upload.wxml:62` placeholder 加"或者您有想问的也可以写"

---

### T2-6 · records 删除 modal 直接带客服电话

**状态**：⬜ | **工时**：S（0.1d）

**修改项**：`pages/records/records.js:123` modal content 加客服电话 `400-666-8899`。

---

## ✅ 真机走查清单（D5 末尾）

按从 Landing 进入小程序的真实路径：

1. [ ] Landing 首屏 → 小程序 index hero（截图对比）
2. [ ] index → upload（拍照态 + 解析态 + 完成态）
3. [ ] matches 列表（≥ 1 试验卡 + 0 试验空状态）
4. [ ] records 列表（含复购钩子显示）
5. [ ] profile（含 stats + menu + 隐私页跳转）

每屏检查：
- [ ] 色板一致（brand + 4 辅助语义）
- [ ] 字号节奏（display/title/subtitle/body/callout/caption）
- [ ] 卡片无静态阴影、按下有 elevation
- [ ] icon 全 Lucide（无 emoji / 中文字符 / Unicode 装饰）
- [ ] 命中区 ≥ 88rpx
- [ ] 文案温度（"您家人" 称呼一致、无系统语言）

机型：
- [ ] iOS（iPhone 13+）
- [ ] OPPO（ColorOS）
- [ ] vivo（OriginOS）
- [ ] 小米（MIUI / HyperOS）

---

## 🚦 状态汇总（实时更新）

| 状态 | 数量 |
|---|---|
| ⬜ 未开始 | 21 |
| 🔄 进行中 | 0 |
| ✅ 已完成 | 0 |
| 🚫 阻塞 | 0 |

**冲刺总工时**：约 5 工程日（含 QA + 真机）。
