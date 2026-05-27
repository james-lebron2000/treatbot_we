# OCR Provider Strategy

更新时间：2026-05-27

本文是 Treatbot OCR 供应商选择的项目记忆。后续修改 OCR 链路、部署密钥、成本估算时，以这里的口径为准，避免再次把火山通用 OCR、火山方舟 Doubao Vision、腾讯云 OCR 混用。

## 1. 当前决策

Treatbot 后续 OCR 默认采用两段式：

```text
图片 / 扫描件
  -> Volcengine OCRNormal 提取 line_texts / line_probs / chars / line_rects
  -> Doubao 或 Kimi 文本 LLM 结构化成病历字段
  -> MedicalRecord.structured.entities / case 档案

复杂版式 / 低文本 / OCR 失败
  -> Doubao Vision 或 Kimi Vision fallback
  -> 结构化病历
```

核心原因：

- `OCRNormal` 是专用文字识别，按图片次数计费，成本低、延迟稳定。
- 病历结构化仍需要 LLM 理解上下文，不能只依赖纯 OCR。
- Doubao Vision 适合做复杂版式兜底，但不适合作为所有图片的第一跳，成本和耗时都更高。
- `VOLCENGINE_AK` / `VOLCENGINE_SK` 是火山引擎 AK/SK，用于 `visual.volcengineapi.com` 的 `OCRNormal`；它们不是 `ARK_API_KEY`。
- `ARK_API_KEY` / `DOUBAO_API_KEY` 是火山方舟 OpenAI-compatible API Key，用于 Doubao 文本/视觉模型。

## 2. 已验证结果

本地使用 `/Users/lijinming/Documents/MDT/.env` 中的 `VOLCENGINE_AK` / `VOLCENGINE_SK` 测试：

- 接口：`OCRNormal`
- Host：`visual.volcengineapi.com`
- Version：`2020-08-26`
- Body：`image_base64`
- 测试图：`server/public/demo/sample-2-nsclc.jpg`

结果：

```json
{
  "ok": true,
  "ms": 2251,
  "lineCount": 44,
  "avgLineConfidence": 0.9887
}
```

返回结构包含：

- `data.line_texts`
- `data.line_probs`
- `data.chars`
- `data.line_rects`
- `data.polygons`

示例识别片段：

```text
病历记录
科别:放疗科门诊
日期:2024-05-31
主诉:肝癌术后,腹膜后淋巴结转移,放疗后,肺转移
```

## 3. 成本口径

Volcengine 通用文字识别公开价格：

| 月调用量 | 单价 |
|---|---:|
| 免费额度 | 5000 次，免费 QPS 1 |
| 0-5 万次/月 | ¥0.005 / 次 |
| 5-10 万次/月 | ¥0.0045 / 次 |
| 10-50 万次/月 | ¥0.0035 / 次 |
| 50-100 万次/月 | ¥0.003 / 次 |
| >100 万次/月 | ¥0.002 / 次 |

资源包可进一步降低到约 ¥0.001-0.001875 / 次。

Treatbot 成本估算规则：

- 单张图片：1 次 `OCRNormal` + 1 次文本结构化 LLM。
- 多图病历：每张图 1 次 `OCRNormal`，最后合并 `line_texts` 做结构化。
- PDF 文本层：优先本地文本提取，不调用 `OCRNormal`。
- 扫描 PDF：按渲染页数调用 `OCRNormal`，控制最大页数和超时。
- 复杂版式 fallback：另按 Doubao/Kimi Vision token 计费。

## 4. 接口差异

| 能力 | 凭证 | 入口 | 用途 | Treatbot 角色 |
|---|---|---|---|---|
| Volcengine OCRNormal | `VOLCENGINE_AK` / `VOLCENGINE_SK` | `visual.volcengineapi.com`, `Action=OCRNormal`, `Version=2020-08-26` | 专用文字识别，输出行文本和置信度 | 第一跳 OCR |
| Doubao Ark | `ARK_API_KEY` / `DOUBAO_API_KEY` | `https://ark.cn-beijing.volces.com/api/v3/chat/completions` | 文本/视觉 LLM，输出结构化 JSON | 结构化与 vision fallback |
| 腾讯云 OCR | `OCR_SECRET_ID` / `OCR_SECRET_KEY` | 腾讯云 OCR SDK | 旧备用链路 | 暂不作为主路径 |

用户提到的 `docs/6444/69729` 是 AI 中台快速接入/签名文档，用于说明 SDK、AK/SK、HTTP 签名接入方式；它不是另一个替代 `OCRNormal` 的业务 OCR 接口。

## 5. 部署与密钥

生产推荐变量：

```bash
VOLCENGINE_AK=<redacted>
VOLCENGINE_SK=<redacted>
ARK_API_KEY=<redacted>       # 或 DOUBAO_API_KEY
KIMI_API_KEY=<redacted>      # fallback，可选
```

不要做这些事：

- 不要把 `VOLCENGINE_AK` / `VOLCENGINE_SK` 写进 `OCR_SECRET_ID` / `OCR_SECRET_KEY`，后者是腾讯云 OCR。
- 不要把 `VOLCENGINE_AK` / `VOLCENGINE_SK` 当作 `ARK_API_KEY`，Ark 使用独立 API Key。
- 不要在命令行里传明文 key；手动部署用生产机 `~/treatbot-deploy-secrets/ocr.env`。

## 6. 当前落地状态

已完成：

1. `volcengine_ocr` provider 已接入 `OCRNormal`，统一返回 `text` / `confidence` / `detections` / `providerMeta`。
2. `recognizeGeneral` 主路径已改为：Volcengine OCRNormal -> Doubao/Kimi 文本结构化。
3. 扫描 PDF 可拆页后逐页调用 OCRNormal，再合并文本进入结构化。
4. OCRNormal 失败、空文本、文本过短或凭证缺失时，继续 fallback 到 Doubao/Kimi Vision、Tencent 或规则抽取。
5. 成本监控已按 provider 分开统计：`volcengine_ocr_calls_total`、`volcengine_ocr_call_duration_seconds`、`volcengine_ocr_lines_total`，LLM 结构化继续走既有 `llm_tokens_total` / `llm_call_total`。

后续优化：

- SSE 阶段事件增加 `ocr_text_extracted`，只发送 `lineCount` / `avgConfidence` / `textLength`，默认不下发 OCR 原文。
- 文本结构化 LLM 仍是主要耗时来源，后续需要做字段级渐进输出与更快的结构化模型灰度。

## 7. 官方文档

- 通用文字识别能力介绍：https://www.volcengine.com/docs/86081/1660260?lang=zh
- 通用文字识别调用说明：https://www.volcengine.com/docs/86081/1660261?lang=zh
- AI 中台快速接入/签名说明：https://www.volcengine.com/docs/6444/69729?lang=zh
