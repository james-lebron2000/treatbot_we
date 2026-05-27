# 三家视觉 LLM 病历 OCR Benchmark 报告

> 数据采集日期: 2026-05-01
> 脚本: `server/scripts/benchVisionLlm.js`
> 数据集: `/Users/lijinming/Documents/Commerce/AItrial/data/dataset_patient/`（6 份代表性病历）
> 配置: `--max-pages 3`, `--concurrency 1`, 第二轮 timeout=180000ms
> 第一轮原始数据保留在 `bench-out-run1/`

## TL;DR

**生产推荐顺序**：**Doubao（豆包） ≫ Kimi（月之暗面） ≫ MiniMax**

| Provider | 视觉可用 | 平均成本 | 平均耗时 | 输出质量 | 一句话结论 |
|---|---|---|---|---|---|
| **Doubao** `doubao-seed-1-6-vision-250815` | ✅ | **¥0.039 / 页** | 85.2s | **结构化最佳，[?] 占位规范** | 推荐主路径 |
| **Kimi** `moonshot-v1-128k-vision-preview` | ✅ | ¥0.059 / 页 | 29.7s | 平铺直叙，**有重复循环风险** | 推荐 fallback |
| **MiniMax** `MiniMax-M2`（Coding Plan key） | ❌ | — | — | **完全幻觉**，文本模型无视觉能力 | **不可用于 OCR** |

> 用户提供的 MiniMax key 属于 Coding Plan 凭证（前缀已隐藏且凭证已要求轮换），仅可访问 `MiniMax-M2`（纯文本推理模型）。M2 接收 image_url 但**完全忽略图像内容并编造文本**（详见 §3.3）。生产部署不应把它纳入视觉路径，需要切换到 **Standard Plan / Pay-as-you-go** key 才能用 `abab6.5s-chat`、`MiniMax-VL-01` 等真正的多模态模型。

---

## 1. 测试方案

- **数据集** (6 份)：
  - 文本 PDF：`LSLI-女-71y-胰腺Ca-G12V-MTAP-一线后.pdf` (5.9MB / 13页)
  - 大型扫描 PDF：`MSHU尿路上皮癌.pdf` (23MB / 22页)
  - 文本基因报告：`黄志直百适博plus基因检测报告P227035-2.pdf` (1.0MB / 41页)
  - 大型混合：`A于莉-ID30024070311-实体瘤TC209+MSI+PD-L1-20240712.pdf` (12MB / 76页)
  - 病历图：`t1.png` (2.7MB)、`t4.png` (495KB)

- **路径选择**：本次 markitdown 缺 `[pdf]` 依赖（pip install markitdown[pdf] 未装），所有 PDF 自动 fallback 到 **vision_pdf 路径**——即 `pdftoppm -r 150 -f 1 -l 3` 拆前 3 页 PNG → base64 → vision LLM；图片直接 base64。
  这样三家被对齐到**同一条视觉路径**进行对比，结论可比性高；但绝对成本数字仅代表「视觉路径上限」——上线后文本路径会显著降低。

- **prompt**：脚本头部 `VISION_SYSTEM_PROMPT` / `VISION_USER_PROMPT`，要求"按图片原始结构转写为整洁 Markdown，[?] 标注模糊文字，不解读不诊断"。

---

## 2. 量化指标（Run 2，6×2 = 12 任务全成功）

### 2.1 Per-file 详表

| 文件 | Provider | 模式 | 耗时 (ms) | prompt | completion | total tokens | 单文件成本 (¥) |
|---|---|---|---:|---:|---:|---:|---:|
| LSLI-女-71y-胰腺Ca | kimi | vision_pdf×3 | 35,579 | 3,215 | 1,295 | 4,510 | 0.0593 |
| LSLI-女-71y-胰腺Ca | doubao | vision_pdf×3 | 92,368 | 4,122 | 4,804 | 8,926 | 0.0433 |
| MSHU尿路上皮癌 | kimi | vision_pdf×3 | 37,825 | 3,215 | 1,229 | 4,444 | 0.0574 |
| MSHU尿路上皮癌 | doubao | vision_pdf×3 | 148,977 | 4,122 | 7,321 | 11,443 | 0.0642 |
| 黄志直基因报告 | kimi | vision_pdf×3 | 25,059 | 3,215 | 1,457 | 4,672 | 0.0640 |
| 黄志直基因报告 | doubao | vision_pdf×3 | 91,839 | 4,122 | 5,501 | 9,623 | 0.0491 |
| t1.png | kimi | vision_image | 67,617 | 1,159 | 4,000 ⚠️ | 5,159 | 0.1231 |
| t1.png | doubao | vision_image | 117,135 | 1,494 | 5,485 | 6,979 | 0.0467 |
| t4.png | kimi | vision_image | 5,396 | 1,159 | 262 | 1,421 | 0.0155 |
| t4.png | doubao | vision_image | 32,955 | 1,494 | 1,818 | 3,312 | 0.0163 |
| A于莉混合报告 | kimi | vision_pdf×3 | 6,963 | 3,215 | 427 | 3,642 | 0.0343 |
| A于莉混合报告 | doubao | vision_pdf×3 | 27,872 | 4,122 | 1,594 | 5,716 | 0.0167 |

⚠️ Kimi 在 t1.png 上达到 4000 completion token 上限（即 max_tokens 截断）→ **进入重复循环**（同一段话被复述 30+ 次）。完整证据见 `bench-out/kimi/t1.md`。

### 2.2 Aggregate

```
provider | success | fail | total_cny | avg_latency_ms | avg_prompt | avg_completion
--------------------------------------------------------------------------------------
kimi     |     6   |   0  |  ¥0.3535  |     29,740     |    2,530   |    1,445
doubao   |     6   |   0  |  ¥0.2364  |     85,191     |    3,246   |    4,421
```

- **总成本**: Doubao **¥0.2364 < Kimi ¥0.3535** → Doubao **省 33%**
- **平均耗时**: Kimi **29.7s，Doubao 85.2s** → Doubao 比 Kimi **慢 2.9×**
- **平均输出 token**: Doubao 4,421 ≫ Kimi 1,445 → Doubao 更详细，约 3×

### 2.3 单价表（CNY / 1M tokens, rates last verified 2026-05-01）

| Provider | Model | Input | Output |
|---|---|---:|---:|
| Doubao | `doubao-seed-1-6-vision-250815` | ¥0.86 | ¥8.28 |
| Kimi | `moonshot-v1-128k-vision-preview` | ¥6.84 | ¥28.80 |
| MiniMax | `MiniMax-M2` (text-only, can't OCR) | ¥1.20 | ¥6.00 |

> Doubao 输入便宜 8×，输出便宜 3.5×。Kimi 看似快但单价显著更贵。

---

## 3. 质量定性对比

### 3.1 Doubao 优点

- **proper Markdown 层级**: 自动用 `#` `##` `###` 而非把整段 dump 进代码块
- **表格化呈现**: 患者基本信息自动转成 `| 项目 | 内容 |` 表格（见 `bench-out/doubao/t4.md`）
- **`[?]` 占位规范**: 严格遵循 prompt，模糊/缺失字段全部用 `[?]`
- **Unicode 上下标保留**: 写 `×10⁹/L` 而不是 `*10^9/L`
- **数字编号入院诊断**: 自动把 "肾盂恶性肿瘤... 肾上腺继发... 肝继发..." 拆成 `1.` `2.` `3.` `4.`

### 3.2 Kimi 优点 + 风险

✅ 优点:
- **快**：t4.png 仅 5.4s，A于莉 12MB 仅 7.0s
- **输出忠实于原文**：包括重复字段 "无皮疹、无皮疹、无皮疹" 都原样保留

⚠️ 风险:
- **包码块习惯**：把整个输出包在 ```...``` 里，下游 markdown 渲染需要剥皮（见 `bench-out/kimi/t4.md` 全文都被 ``` 包裹）
- **重复循环 / max_tokens 截断**：t1.png 在生成途中陷入复述循环，生成了 4000 个 completion token（达到上限），文本里同一段直肠癌病史被复述 30+ 次。生产环境若 max_tokens=4000，碰到这类长病程记录会**不仅烧钱还截断**
- **模糊字段不规范**：用 `__________` 或 `黄洁玉` 这样实读，不按 prompt 用 `[?]`

### 3.3 MiniMax-M2 失败模式（来自 Run 1）

5/6 任务"成功返回 200"，但实际输出全是垃圾：

| 文件 | M2 实际输出 |
|---|---|
| `t4.png` | "抱歉，我没有看到您提到的病历图片。请您上传需要转写的病历图片..." |
| `MSHU尿路上皮癌.pdf` | "您好！我目前没有看到您提供的病历图片..." |
| `黄志直基因报告.pdf` | `(empty)` — reasoning_token 全部用完，没产生 content |
| `t1.png` | **3KB 完全编造的内容**：编造了 "陈某 49 岁妇科二病区 卵巢囊肿" 病例（真实 t1.png 是 71 岁直肠癌患者） |
| `LSLI-胰腺Ca` | timeout 45s — 大文件上传 + 推理 |

**根因**: 测试使用的 MiniMax **Coding Plan** 凭证（前缀已隐藏且凭证已要求轮换）整个 plan 仅授权 `MiniMax-M2`（纯文本推理模型）。M2 不支持 image_url，但接口不报错而是静默忽略图像 → 模型基于 system prompt 凭空生成内容。

**对生产的影响**:
1. 当前 key **绝对不能**进 `recognizeGeneral` / `processMedicalImage` 视觉路径
2. 升级到 Standard Plan key 后才能开启 `abab6.5s-chat` 等真视觉模型
3. 若坚持使用本 key，可让它走纯文本路径（`requestMinimaxText`）做 markitdown 输出的二次润色——但这场景下 Kimi/Doubao 也都能做且更便宜

---

## 4. 推荐生产配置（Track B 落地建议）

### 4.1 主路径

```env
# 主推 Doubao（成本/质量/中文医学最佳）
ARK_API_KEY=<rotate-key>
ARK_VISION_MODEL=doubao-seed-1-6-vision-250815
ARK_TIMEOUT_MS=180000   # 大型扫描 PDF 需要 90s+ 推理

# Fallback Kimi（快速兜底）
KIMI_API_KEY=<rotate-key>
KIMI_VISION_MODEL=moonshot-v1-128k-vision-preview
KIMI_TIMEOUT_MS=60000

# OCR 路由策略
OCR_PROVIDER=auto       # auto = doubao → kimi → tencent → rule

# MiniMax 暂时不投入视觉路径（Coding Plan 限制）
MINIMAX_API_KEY=<rotate-key>
MINIMAX_MODEL=MiniMax-M2   # 仅供文本润色 / fallback
MINIMAX_VISION_MODEL=      # 留空 → 自动跳过视觉调用
```

### 4.2 max_tokens 边界

| 任务类型 | 建议 max_tokens | 备注 |
|---|---|---|
| 单页图片 OCR | 2500 | t4.png 实际 1818 已足够 |
| 多页扫描 PDF（≤3 页） | 6000 | MSHU 用了 7321，避开截断 |
| 长病历转写 | 8000 | t1.png 复杂版面需要 5485+ |

> Kimi 必须 max_tokens ≥ 5000 以避免 t1 类长病程的重复截断，否则下游 schema 校验会拿到截断文本。

### 4.3 markitdown 文本路径

本轮 benchmark 因为 markitdown 缺 `[pdf]` extras 全部走视觉路径。生产环境**强烈建议**:

```bash
# 生产服务器
pip install 'markitdown[pdf]'
# 或在 Dockerfile：
RUN pip install --no-cache-dir 'markitdown[pdf]' 'markitdown[xlsx]' 'markitdown[docx]'
```

文本 PDF（`LSLI`、`黄志直基因报告`）走 markitdown 抽取 → LLM 润色，成本会从 ¥0.04-0.06 降到 ¥0.005-0.01（输入 token 直接砍 80%）。

---

## 5. 已修复 / 已落地

- ✅ `server/utils/llmPricing.js`: 新增 `RATE_TABLE`，含三家 + MiniMax-M2 + Doubao 250815 行
- ✅ `server/services/llmClient.js`: PROVIDER_REGISTRY 新增 `doubao` 条目
- ✅ `server/services/ocr.js`: 新增 ARK_* 常量 + `requestDoubao{,Text,Pdf}` 三函数 + module.exports 扩展（**未改 recognizeGeneral 路由——保持向后兼容，留给 Track B**）
- ✅ `server/.env.example`: 新增 ARK 配置块
- ✅ `server/scripts/benchVisionLlm.js`: CLI runner，三家 18 行 CSV + summary.json + per-file markdown
- ✅ Doubao 默认模型从 `doubao-seed-1.6-vision`（短名 → 404）修正为 `doubao-seed-1-6-vision-250815`（带版本后缀，Ark 控制台返回 200）

---

## 6. 待办（Track B）

- [ ] `server/Dockerfile`: `pip install markitdown[pdf]`
- [ ] `server/services/ocr.js`: `recognizeGeneral` 加 Doubao 分支（在 MiniMax/Kimi 前）
- [ ] `server/services/queue.js`: 多文件类型路由（文本 PDF → markitdown，扫描/图片 → Doubao）
- [ ] `server/services/llmObservability.js`: 末尾追加 `recordCost(provider, model, usage)` → 写新 prom counter `llm_cost_cny_total{provider,model}`
- [ ] 客户端 `pages/upload/upload.js`: 多文件 `wx.chooseMessageFile({count: 5-10})`
- [ ] 用户：升级 MiniMax key 到 Standard Plan，或永久从视觉链路移除

---

## 7. 安全提醒

⚠️ **请在测试结束后立即轮换以下三把 key**（已在本次 chat 文本中泄露；此处不展示任何可识别前缀或片段）：
- `KIMI_API_KEY=<redacted-rotated-key>`
- `MINIMAX_API_KEY=<redacted-rotated-key>`
- `ARK_API_KEY=<redacted-rotated-key>`

轮换路径：
- Kimi: https://platform.moonshot.cn/console/api-keys
- MiniMax: https://platform.minimaxi.com/user-center/basic-information/interface-key
- Ark: https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey
