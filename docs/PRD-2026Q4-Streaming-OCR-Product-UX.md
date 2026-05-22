# PRD: Treatbot Streaming OCR Product UX

Date: 2026-05-22
Owner: Treatbot product + engineering
Status: P0 implementation in progress

## Background

Treatbot 的核心闭环是：用户上传病历 -> OCR 结构化 -> 用户确认病历卡片 -> 进入匹配。当前后端已具备 OCR SSE、轮询兜底和结构化保存能力，但产品体验仍需要确保用户能明确知道“正在解析”和“可以下一步”的边界。

本次本地产品巡检使用 Web 移动视口和 mock 后端验证上传页。发现的问题集中在上传解析页：流式字段一出现，Web 端就提前展示“好了”和下一步按钮；同时全局帮助浮层会遮挡上传中的字段卡。另一个工程可用性问题是 Vite dev 环境无法直接加载仓库内 CommonJS shared 文案模块，导致上传页在本地开发/验收时空白，但生产 build 不受影响。

## Goals

- 用户在上传后 1 秒内看到可信状态反馈。
- OCR 运行中只展示“实时字段卡”，不展示最终结果 CTA。
- 只有服务端终态经过 `/parse-status-batch` 或读档确认后，才进入“好了”结果确认区。
- 上传页关键路径不被固定底栏或全局帮助按钮遮挡。
- 本地开发、预览、e2e 都能稳定打开 Treatbot Web 上传页，便于持续验收。

## Non-Goals

- 本 PRD 不做新的医学字段 schema 设计。
- 本 PRD 不做 LLM token 级原文 streaming。
- 本 PRD 不移除轮询接口；轮询仍是终态确认和兼容兜底。
- 本 PRD 不改变小程序上传协议，只同步产品验收标准。

## Current Product Findings

1. Web 上传页在 dev 模式空白：`@shared/copy/help.js`、`@shared/copy/glossary.js` 等仓库内 CommonJS 模块没有 default export，Vite dev 未走 build 阶段 commonjs 转换。
2. 解析中状态混淆：`parsedRecord` 收到任意 `fieldGroup` 后，模板直接渲染最终“好了”卡片和“看看为家人找到的可能性”按钮。
3. 终态确认不够显性：SSE 是快通知，但最终结果应该以 `/parse-status-batch` 或读档接口为准，避免 partial patch 被当成完整结果。
4. 上传页浮层遮挡：全局 HelpFab 固定在右下角，会覆盖 streaming 字段卡和用户下一步判断区域。
5. 固定底部 tabbar 需要更多安全区：长页面最后一个 CTA 在移动端容易被底部导航压住。

## Product Requirements

### P0: “真能用”上传解析闭环

- `StreamingRecordCard` 在 `running/uploading/parsing` 期间持续展示阶段、进度、字段组和 skeleton。
- 最终结果区只在 `parseStatus === completed` 且已有确认后的 `parsedRecord` 时展示。
- SSE 收到 `completed/done` 后必须立即触发一次 `/parse-status-batch`；只有 batch 确认 `done=true` 后才允许显示最终结果 CTA。
- 上传页不展示全局 HelpFab，避免遮挡文件选择、streaming 卡片和结果确认。
- 页面底部必须给 fixed tabbar 留出滚动安全区；toast 也应出现在 tabbar 上方。
- Web dev 模式必须能直接打开 `/treatbot/upload`，不能因 shared CommonJS 模块互操作失败空白。

### P1: 丝滑感与可解释性

- Streaming 字段按组逐步出现，字段出现后不回退。
- 进度条只单调递增，不能从 80% 回跳 30%。
- 非敏感状态可展示，例如“正在取文”“正在提取诊断信息”“第 N 份正在排队”；不展示 provider 内部错误和原始病历全文。
- `textLength/pageCount/providerWait` 必须转成用户可理解的状态提示，例如“已识别约 N 字”“已读取 N 页”“模型资源排队中”，不展示 provider 名称、内部错误或原始病历文本。
- 多图/长图场景继续展示整体完成数，最终卡片来自所有 completed 记录的合并结果。

### P2: 可观测与回归

- 记录首帧耗时、首字段耗时、终态帧到结果卡耗时、SSE fallback 率。
- e2e 覆盖“partial streaming 不触发最终结果”和“terminal SSE 必须经 batch 确认”。
- 产品巡检保留移动端截图作为人工验收材料。

## Acceptance Criteria

- 上传 1 份 mock 病历后，partial 字段可见，但“好了”和下一步 CTA 不可见。
- SSE terminal 到达后，至少发生 1 次 `/parse-status-batch` 请求，完成后才显示“好了”和下一步 CTA。
- `/treatbot/upload` 无 HelpFab 遮挡；`/treatbot/matches` 和 `/treatbot/records` 仍保留 HelpFab。
- 移动端页面底部最后一个 CTA 可以滚动到 tabbar 上方。
- `npm run build` 和新增 Playwright e2e 通过。

## Implementation Notes

- Web 使用 `reviewReady = parseStatus === 'completed' && hasParsedRecord` 作为最终结果唯一门控。
- `isParsingVisible` 替代直接判断 `parseStatus !== completed`，确保 partial fields 和 final review 不会同时显示。
- App shell 在上传路由隐藏 HelpFab；帮助入口后续可以用上传页内联轻入口替代。
- Vite dev 增加 shared CommonJS interop 插件，只处理仓库 `shared/**/*.js` 且包含 `module.exports` 的模块。
- Web 与小程序都把 streaming 非敏感元信息映射成同一类等待文案，让长 OCR 阶段有真实反馈。
