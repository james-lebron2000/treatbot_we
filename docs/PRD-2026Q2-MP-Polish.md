# Treatbot 2026 Q2 PRD — 小程序 UI 抛光冲刺

> 产出时间：2026-05-05
> 撰写依据：`docs/PRD-2026Q2.md` 闭环后，对刚合并到 main 的小程序 5 页 UI 重做（commit `97d9ab5`，Plan §web-h5-cozy-gizmo V2）做了一轮**双视角审阅**——
> - 资深产品设计师（Apple HIG / Material 3 视觉语言出身）
> - 资深医疗 B2C 产品经理（病人侧产品 / 信任建立 / 漏斗转化）
> 两边各自独立审阅、给意见、再相互讨论。本 PRD 是**讨论后的共识方案**。
> 范围：**仅微信小程序**（5 个 user-facing 页 + 共享组件 + token / copy）。Web / H5 / Admin / 后端不在本轮。
> 关联文档：
> - `docs/PRD-2026Q2.md` — Q2 安全与体验 PRD
> - `docs/PRD-2026Q3.md` — Q3 后端冲刺 PRD（明确"前端 / 小程序 / 设计另行排期"）
> - `docs/design-system.md` — 跨端视觉语言 SSoT
> - `docs/TASKS-2026Q2-MP-Polish.md` — 本 PRD 对应的可执行任务清单
>
> **每项规则**：每条任务包含 6 段——**修改项 · 目的 · 产品视角 · 用户视角 · 设计视角 · 完成后获益**。

---

## 0. 摘要

5 页小程序 UI 重做（97d9ab5）已落地 Apple-cozy 视觉语言，token 体系跑通，硬编码色清零。但**两位审阅人**独立指出 21 项可改进项，按对**信任 / 转化 / 视觉精致度**的影响分三档：

| 档位 | 数量 | 主题 | 谁会受影响 |
|---|---|---|---|
| **P0**（必修） | 8 | 信任崩盘风险 + 视觉硬伤 + 可访问性 | 所有进入小程序的家属用户 |
| **P1**（建议修） | 7 | 一致性 + 留存钩子 + 文案温度 | 已上传过病历的回访用户 |
| **P2**（可选） | 6 | 锦上添花 | 边缘场景 / 内部协作 |

**预期 ROI**：
- 减少首屏跳出：`stats 区重做 + 机构背书` → 解决"凭什么信你"的第一道质疑
- 提升上传完成率：`隐私页兑现 + 取消 1.2s 自动跳转 + 假入口下线` → 减少"系统又自作主张"的不信任感
- 降低罕见癌种沉默卸载：`matches 空状态三步兜底` → 把"AI 不行"翻译成"边界明确 + 有人接住"

**冲刺时长**：1 周（5/5 – 5/12，5 个工作日）。

---

## 1. 背景与依据

### 1.1 上一轮做对的事（不动）
| 项 | 文件 |
|---|---|
| Token 化彻底，5 页 0 硬编码色 | `pages/*/`、`app.wxss` |
| `.hero-shell` radial 浅光统一 index + profile 入口感 | `app.wxss:162-201` |
| `match-score-badge` 实色 brand 圆，比旧 dark gradient 克制 | `pages/matches/matches.wxss:215-226` |
| 病历卡 `record-status` 用 `*-soft + *-text` companion 配对 | `pages/records/records.wxss:110-135` |
| profile 菜单 5 色徽章语义分配（brand=主、mint=正向、lilac=药、red=危险） | `pages/profile/profile.wxss:215-233` |
| 长等待防御机制（90/180/300s 三档同理心 + 拉慢轮询，无客户端硬超时） | `pages/upload/upload.js:872-903` |
| 上传错误三类分级 + 共情语气 | `shared/copy/upload.js:14-25` |
| matches 卡片"为什么适合"用 glossary 把 ECOG/HER2 翻成人话 | `pages/matches/matches.wxml:65-69` + `shared/copy/glossary.js` |

### 1.2 这一轮要解决的核心问题
1. **信任锚点缺失** — 大字数字承诺无机构背书；隐私页空 modal 自拆台
2. **关键转化点的"系统感"** — 1.2s 自动跳走打断核对；"正在联络的"假入口
3. **视觉一致性破口** — `:root` bug 已修但仍有 emoji 残留 + `<text>` 装 `inline-flex`
4. **可访问性硬伤** — 文本链接点击区 < 88rpx（44pt），35-55 岁用户老花镜+粗手指点不中
5. **罕见癌种沉默卸载** — matches 0 结果只有"再找一次"，无兜底

---

## 2. P0 — 必须 1 周内闭环

### P0-1 · stats 区整块重做（首页 + Profile）

**修改项**
- `pages/index/index.wxml:39-52` — 三个数字 stats 颜色 + 「零」字优化 + 加 caption 出处
- `pages/profile/profile.wxss:146` — profile stats 同步改黑

**目的**
当前 stats 数字 `5,000+ / 10,000+ / 零` 都是大字 brand 蓝，跟旁边主 CTA 同色 → **主色失去克制**；同时这些数字**没有出处、没有机构背书、没有备案号**，对中老年家属第一反应是"凭什么信你"。

**产品视角（PM）**
- 隐私 / 信任承诺一旦像广告语，反而触发警觉用户的逆向心理。
- `shared/copy/help.js:42` 已写"和公立三甲医院 + 国内主流药企合作"但藏在 FAQ modal 里，**关键背书没出现在用户做"上传决定"那一刻**。

**用户视角（患者家属）**
- 35-55 岁、被癌症诊断击中的家属，决定上传敏感病历前会反复扫一眼"这家可信吗"。
- 想看到的是：数据出处（chinadrugtrials.org.cn）、机构对接（XX 三甲、XX 药企）、法律依据（个保法第 13 条）。

**设计视角**
- 数字字号大 + brand 蓝 = 视觉权重最高 → 但传达的是"广告吹嘘"。
- 改 `var(--text)` 黑体加重 + 数字下小字 caption 出处，权重不变但"客观感"上升。
- 「零」字破坏数字对齐节奏，改 icon `<icon name="lock" color="brand">` + "数据由您掌控" 文字。

**完成后获益**
- 首屏跳出率预期下降（暂无埋点支持，需 Q3 加 funnel 后量化）
- 商务签约时可截图自证"已声明监管依据 + 机构对接"

---

### P0-2 · 隐私承诺兑现（Profile）

**修改项**
- `pages/profile/profile.js:122-128` — `showPrivacyPolicy` 不再弹空 modal，跳到独立页
- `app.json` — 注册 `pages/profile/privacy/privacy`（目录已存在但未注册）
- `pages/profile/privacy/privacy.wxml` — 写 5 条具体承诺（存什么 / 存多久 / 谁能看 / 怎么删 / 客服 400）

**目的**
profile.wxml 大书特书"不存储 / 您保管 / 随时带走"，点进去却只一句话："我们仅在您授权范围内使用病历数据用于临床试验匹配。"——**承诺重 / 兑现轻 = 自拆台**，警觉用户秒杀。

**产品视角（PM）**
- 法律层面是合规底线（个保法第 17 条要求"以显著方式 / 清晰易懂的语言告知"），不是 nice-to-have。
- 注销 / 导出入口必须可见，否则 `pages/profile/profile.wxml:140` 的"删除全部数据"承诺无处兑现。

**用户视角**
- 家属在做"上传 / 不上传"决策时会反复进 profile 翻隐私 → 看到一句空话立刻退出。
- 5 条具体承诺 + 客服电话 = "看得见摸得着"。

**设计视角**
- 隐私页用 `.card` baseline + `.pill-mint` 标"已生效"，每条独立卡片，避免长文。
- 顶部加 1 个 `<icon name="shield-check" color="brand" size="120">` 作信任锚。

**完成后获益**
- 法务 / 监管自查可直接出示该页 URL
- 首次用户上传转化率预期 +5-10%（行业经验值）

---

### P0-3 · 取消 upload 完成态 1.2s 自动跳转

**修改项**
- `pages/upload/upload.js:1244-1258` — 删 `shouldAutoRedirect` 1.2s `wx.redirectTo`
- 完成态保留 + sticky 底部 CTA 让用户主动决定何时跳
- 即使要跳也用 `wx.navigateTo` 不用 `wx.redirectTo`（保留返回栈）

**目的**
当前用户刚看到"好了" + structured summary 想认真核对，1.2 秒后页面被换走 + 历史记录回不去 → 心理反应是"系统又自作主张"。况且 missingFields=0 但解析准确率不一定高，**这一刻恰恰是用户最该核对的**。

**产品视角（PM）**
- 一次解析错误的关键字段（诊断 / 基因），用户不会跟你纠正，会直接觉得"AI 不行"走人。
- 自动跳转 = 强制剥夺核对窗口 = 信任崩盘加速器。

**用户视角**
- "我刚要看清楚就跳走了" → "这系统不让我控制" → 沉默卸载。
- 主动点 CTA = "我决定看新药" = 心理 ownership。

**设计视角**
- sticky CTA 已在 upload.wxml:263 实现，移除 auto-redirect 后无视觉损失。
- 可加一个 toast "信息已保存，您可以继续核对" 软提示。

**完成后获益**
- 用户对解析结果的信任度提升 → 减少"AI 不靠谱"差评
- 错填字段被用户自己改正 → 后端入组匹配准确率上升

---

### P0-4 · matches 空状态三步兜底（罕见癌种）

**修改项**
- `pages/matches/matches.wxml:155-158` — 0 结果时除了"再找一次"，加：
  - (a) 留联系方式钩子（不强制，可勾选"新药出现立刻通知您"）
  - (b) 高亮 help-fab 客服 400 电话："找真人帮看看"
  - (c) 显式覆盖范围："目前我们覆盖 N 个癌种，您家人的诊断 X 暂未在库"
- `shared/copy/matches.js`（新建或追加）— 上述三段文案集中管理

**目的**
罕见癌种家属点"再找一次"还是 0 结果，下一秒走人。"每周更新新药库"是开发口吻，**对绝望家属没有任何实际意义**。

**产品视角（PM）**
- 这是用户漏斗最后一公里 —— 上传都做了 90s 等待了，结果 0 个匹配 = 整个旅程价值归零。
- 留联系方式 = 把"沉默卸载"转成"延迟转化机会"。
- 显式说覆盖范围 = "AI 不行" 翻译成"边界清晰但有兜底"。

**用户视角**
- 罕见癌种本身已是绝望状态，再来个"AI 也找不到" = 双重打击。
- 看到"客服真人 400 电话" = "至少还有人接住我"。

**设计视角**
- 三个兜底用 `.card` 横排 grid 而非 stacked list，视觉重量平衡。
- "留联系方式"用 `.btn-ghost`，"客服电话"用 `.btn-primary`，"覆盖范围说明"用纯文字行。

**完成后获益**
- 罕见癌种用户流失率下降 → 长尾留存
- 客服线索增加 → 高质量转化（家属愿意打电话的都是真意向）

---

### P0-5 · upload `✓` Unicode → Lucide check icon

**修改项**
- `pages/upload/upload.wxml:124` — `<text>✓</text>` 换成 `<icon name="check" color="white" size="28" strokeWidth="3" />`

**目的**
parse-step-badge 的勾号是 Unicode 字符，**不同安卓厂商（vivo OriginOS / oppo ColorOS / 小米 MIUI）字符勾的笔画粗细差异极大**，破坏整页视觉一致性。

**产品视角（PM）**
- 这是上一轮"emoji 全替 Lucide"清扫的漏网之鱼。

**用户视角**
- 一致的视觉语言 = "这家公司认真"。

**设计视角**
- Lucide check 在 `components/icon/icon.js:24` 已有 path，零新增成本。

**完成后获益**
- 跨厂商安卓视觉一致性回归 100%

---

### P0-6 · hero-eyebrow `<text>` → `<view>`

**修改项**
- `pages/index/index.wxml:31` — `<text class="hero-eyebrow">数愈健康 · 用药全程免费</text>` 改 `<view class="hero-eyebrow"><text>...</text></view>`

**目的**
baseline `app.wxss:174-184` 给 `.hero-eyebrow` 设了 `display: inline-flex`，但 index 把它套在 `<text>` 节点上 ——**WXSS 里 `inline-flex` 在 `<text>` 节点上行为不可预测**，多机型实测会塌成 inline，padding 高度被吞。

**产品视角（PM）**
- 用户看到 hero eyebrow 高度抖动 → "页面没做完"印象。

**用户视角**
- 不是直接感知项，但累计形成"做工粗糙"印象。

**设计视角**
- baseline 的 utility 期待 block-level 元素，`<text>` 在 WXSS 是 inline-only。

**完成后获益**
- 跨机型 hero 区域稳定显示

---

### P0-7 · 文本链接点击区 < 44pt 修复（可访问性）

**修改项**
- `pages/index/index.wxss:242-247` — `.processing-card-link`、`.view-all` 加透明 padding：`padding: 16rpx 24rpx; margin: -16rpx -24rpx;`
- 同类位扫一遍：profile menu-item 内嵌链接、records 卡片内辅助操作

**目的**
"看全部 / 看新药 / 看病历"等裸文本链接 `font-size: 28rpx; color: var(--brand)`，无 padding，点击区只有文字本身（远 < 44pt = 88rpx）。**35-55 岁用户 + 老花镜 + 粗手指**，命中率会显著下降。

**产品视角（PM）**
- 命中失败 = 用户重复点 = 烦躁 = 跳出。
- WCAG 2.1 AA 要求点击区 ≥ 44×44pt（小程序场景按 88rpx）。

**用户视角**
- "我点了它怎么没反应" → 反复戳 → 觉得"小程序卡" → 关掉。

**设计视角**
- 透明 padding（`margin: -16rpx -24rpx`）扩展命中区但视觉无感，零 visual cost。

**完成后获益**
- 老年用户操作流畅度提升
- 可访问性 AA 合规

---

### P0-8 · "正在联络的"假入口处理

**修改项**
- `pages/profile/profile.js:98-104` — `showOngoingTrials` 不再弹"将在后续版本开放"
- 二选一：
  - (a) 直接隐藏 menu-item 直到功能上线
  - (b) modal 文案改"我们会在 X 工作日内电话联系您 · 客服 400-666-8899"，给可控预期

**目的**
用户已经做了申请动作（trial_apply 埋点已写入），此时最关心进度。告诉他"以后再说" = **信任崩盘**。

**产品视角（PM）**
- 用户从 matches 申请到这里是漏斗最深的一步，绝对不能在这里掉链子。
- 优先方案 (a)：先藏起来；功能上线再露。

**用户视角**
- "我都申请了你说以后再说？" → 觉得被忽悠 → 卸载。

**设计视角**
- 隐藏 menu-item 后 profile 菜单从 6 项变 5 项，视觉无破口。

**完成后获益**
- 已申请用户留存率提升
- 避免负面口碑（"申请完就不管了"）

---

## 3. P1 — 建议本轮顺手修

### P1-1 · gap-section amber 大底色拆细

**修改项**
- `pages/upload/upload.wxss:781-786` — 外层改 `background: var(--bg); border: 2rpx solid var(--amber-soft);`，amber 底只留给单字段 `.is-missing`

**目的**
当前整块 amber 底色 + 内嵌白卡，"待补字段"区像贴张警告告示，与同页其它"细描边卡片不带阴影"风格冲突。

**完成后获益**
全页风格一致；amber 留给真正缺失字段做高亮。

---

### P1-2 · upload-area dashed 边对比度

**修改项**
- `pages/upload/upload.wxss:97` — `border: 4rpx dashed var(--brand-soft)` → `border: 4rpx dashed var(--brand)`

**目的**
浅蓝虚线在浅蓝背景上对比度不够，弱化了"这是首屏关键 CTA"的视觉权重。

**完成后获益**
上传区域视觉权重回升 → 上传 CTA 命中率提升。

---

### P1-3 · 抽 `<parse-progress-banner>` 共用组件

**修改项**
- `components/parse-progress-banner/`（新建）— 抽 matches 顶部 + index 同位的进度条
- 替换 `pages/matches/matches.wxml` + `pages/index/index.wxml` 两处

**目的**
matches 用细边纯白卡，index 用 `.card` baseline，但 progress bar 高度（10rpx vs 12rpx）、字号（30rpx vs 30rpx 但数字字号微差）有偏差。

**完成后获益**
两端视觉完全统一；后续改进只改一处。

---

### P1-4 · hero title 行间撑开

**修改项**
- `pages/index/index.wxss:26-33` — `line-height: 1.18` → `1.3`；`margin-bottom: 4rpx` → `8rpx`

**目的**
粗体 + 1.18 LH → 中文字在小屏（375pt 以下）顶部碰底部，焦虑用户读起来像被压。

**完成后获益**
首屏 hero 呼吸感回归。

---

### P1-5 · matches 三个统计文案模糊

**修改项**
- `pages/matches/matches.wxml:12-25` — 每个数字下加 8 字内说明：`高度匹配 = 诊断+基因都对得上`、`值得优先申请 = 入组评估通过`

**目的**
家属看不懂"高度匹配 vs 值得优先申请"的区别（逻辑藏在 matches.js:191-193 readyMatches 判断里）。

**完成后获益**
数据可读性提升 → 家属决策信心增强。

---

### P1-6 · records 复购钩子

**修改项**
- `pages/records/records.wxml` — 每条卡片底加 1 行钩子：
  - "上次更新于 N 天前，传一份复查报告，匹配会更准"
  - "补 N 项基因信息，可能多解锁 X 种新药"

**目的**
当前 records 页是 dump，没有"再传一份新的"理由。"待补 N 项"是任务感不是利益感。

**完成后获益**
回访用户复购率提升 → 留存指标改善。

---

### P1-7 · upload step 3 双按钮简化

**修改项**
- `pages/upload/upload.wxml:262-264` — 删"信息已补好"按钮（点了只 toast 无视觉效果）
- 主按钮按 missingFields 数量动态切：
  - `> 0` → "再补 N 项更准 · 直接看新药"
  - `=== 0` → "信息已齐 · 看找到的新药"

**目的**
"信息已补好"按钮点了无明显反馈，用户疑惑"我点它干嘛"。

**完成后获益**
按钮意图清晰；减少误点。

---

## 4. P2 — 余力时再做

| # | 项 | 文件 | 工时 |
|---|---|---|---|
| P2-1 | matches 卡片"看详情/收起"提到右上 | `matches.wxml:90` | S |
| P2-2 | step-icon / step-number / step-dot 尺寸统一 56rpx，抽 utility `.step-num` | `app.wxss` | S |
| P2-3 | profile version-info 拆 2 行 | `profile.wxml:162` | S |
| P2-4 | tabBar "匹配" → "新药" | `app.json:23-53` | S |
| P2-5 | upload remark placeholder 多举一例 | `upload.wxml:62` | S |
| P2-6 | records 删除 modal 直接带客服电话 | `records.js:123` | S |

---

## 5. 暂不动 · 需要进一步决策

| 议题 | 拥有方 | 后续动作 |
|---|---|---|
| matches `trialName` → `drugName`（"找到的新药"） | PM + 法务 | **本轮不做**。需要法务确认免责声明 + 加底部小字"临床研究阶段，免费用药 = 加入研究" |
| 导出数据 → 改生成 PDF / 图片 | PM + 后端 | **本轮不做**。是产品功能改造，需要后端配合（cos.js + medical/export 接口） |
| 完成后"截图发家庭群"钩子 | PM + 法务 | **本轮不做**。隐私雷区，需要单独评估 |
| score badge `box-shadow` 是否保留 | 设计 | **本轮做**：减弱 `24rpx → 16rpx`，保留 anchor 重量感 |

---

## 6. 验收口径（汇总）

| 维度 | 指标 | 来源 |
|---|---|---|
| 视觉一致性 | 5 页 0 emoji / 0 中文字符 icon / 0 Unicode 装饰符 | grep 自动化 |
| 可访问性 | 所有交互元素命中区 ≥ 88rpx | 设计 review |
| 信任锚点 | 首页 + 上传页 + Profile 三处出现机构背书 / 法律依据 | PM review |
| 文案温度 | "您家人" / "为家人" 称呼一致；无"任务/队列/参数"等系统语言 | 文案 review |
| 跨机型 | iOS 真机 + 安卓真机（OPPO / vivo / 小米至少一台）跑 5 屏无塌陷 | QA 真机走查 |

---

## 7. 工时与排期

| 天 | 任务 | 工时 |
|---|---|---|
| **D1**（5/5） | P0-1（stats）+ P0-5（✓）+ P0-6（eyebrow）+ P0-7（点击区） | M（4 项约 1d） |
| **D2**（5/6） | P0-2（隐私页）+ P0-3（auto-redirect）+ P0-4（空状态）+ P0-8（假入口） | M（4 项约 1d） |
| **D3**（5/7） | P1-1（gap-section）+ P1-2（dashed）+ P1-3（共用组件）+ P1-4（hero title） | M（约 1d） |
| **D4**（5/8） | P1-5（matches 文案）+ P1-6（records 钩子）+ P1-7（按钮简化） | S（约 0.5d） |
| **D5**（5/12） | P2 全部（6 项 S）+ 真机走查 + 截图对比 Landing | M（约 1d） |

**冲刺总工时**：4-5 工程日（含 QA）。

---

## 8. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 隐私页文案需法务过 | 中 | 阻塞 P0-2 | 先用占位文案上线，法务终稿后 hot-fix |
| `trial → drug` 文案改造法务未拍板 | 高 | 不阻塞本轮（已标暂不动） | 单独拉法务会议 |
| stats 区机构背书数字不实 | 中 | 法律风险 | 用"已与三甲医院 + 主流药企对接"模糊表述，避免具体数字直到合作可公开 |
| 真机走查暴露未发现的塌陷 | 中 | 阻塞上线 | D5 留 0.5d buffer 处理紧急修复 |
