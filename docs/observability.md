# 可观测性运维手册（Q3-红线 §A.3）

本文件涵盖 Treatbot 后端 `/metrics` 端点暴露的 Prometheus 指标、Sentry 接入方式以及推荐告警阈值。任何新增指标都应同步更新本表。

## 一、Prometheus 指标清单

| metric 名 | 类型 | labels | 说明 | 来源 |
| --- | --- | --- | --- | --- |
| `http_request_duration_seconds` | Histogram | `method`, `route`, `status` | HTTP 请求延迟 | `middleware/metrics.js` |
| `ocr_queue_jobs` | Gauge | `state` (waiting/active/failed/completed) | OCR Bull 队列深度 | `middleware/metrics.js` |
| `match_score` | Summary | `bucket` (<0.3/0.3-0.6/0.6-0.8/>=0.8) | matchEngine 评分分布（10% 抽样） | `services/matchEngine.js` |
| `llm_call_duration_seconds` | Histogram | `provider`, `model`, `operation`, `status` | LLM 调用耗时；buckets `0.5/1/3/5/10/30/60` | `services/llmObservability.js` |
| `llm_call_total` | Counter | `provider`, `model`, `operation`, `status` | LLM 调用次数；status ∈ `success/schema_invalid/rate_limit/timeout/server_error/other` | `services/llmObservability.js` |
| `llm_tokens_total` | Counter | `provider`, `model`, `direction` (prompt/completion) | LLM token 累计消耗 | `services/llmObservability.js` |
| `llm_fallback_triggered_total` | Counter | `from_provider`, `to_provider`, `reason` | provider fallback 链触发次数 | `services/llmObservability.js` |
| 默认 `treatbot_*` 指标 | 多种 | - | 进程 CPU/MEM/event-loop/gc | `prom-client` |

抓取地址：`GET /metrics`，返回 `text/plain; version=0.0.4`。

## 二、`/metrics` 访问限制

- 默认仅放行内网网段：`10/8`、`172.16/12`、`192.168/16`、`127.0.0.1`、`::1`。
- 测试或本地 Prometheus 抓取可设置 `METRICS_ALLOW_ALL=true` 临时打开白名单。
- 端点不走 `/api` 前缀，Prometheus 配置 `scrape_config` 时直接指向 `/metrics`。

## 三、Sentry 接入

### 后端 (`server/`)

- 依赖：`@sentry/node@7`、`@sentry/profiling-node@7`（pin 7.x 以兼容 Node 18）。
- 入口：`server/observability/sentry.js`，在 `app.js` 顶部 require，`Sentry.requestHandler` 放最前、`Sentry.errorHandler` 放自定义 errorHandler 之前。
- 初始化字段：
  - `dsn`：`process.env.SENTRY_DSN`（**留空则关闭整个 SDK**，dev/CI 不会报错）。
  - `tracesSampleRate` / `profilesSampleRate`：默认 0.05，可由 `SENTRY_TRACES_SAMPLE_RATE` / `SENTRY_PROFILES_SAMPLE_RATE` 覆盖。
  - `beforeSend = scrubPii`：复用 `utils/piiScrubber`（软依赖），对 `event.request.data` / `event.extra` / `event.message` 中的手机号、身份证、邮箱、姓名等做 `[redacted]` 替换；并丢弃 `event.user.email` / `username`，仅保留 `id`。
- 显式上报点：`middleware/errorHandler.js`、`services/queue.js`（OCR failed）、`services/matchEngine.js`（criteria 加载失败）、`services/llmObservability.js`（LLM 错误）。

### 前端 (`web/`)

- 依赖：`@sentry/vue`。
- 入口：`web/src/main.ts`，`VITE_SENTRY_DSN` 未配置时 `Sentry.init` 不会被调用，bundle 增量约 ~25KB gzip。
- 集成：`browserTracingIntegration({ router })` 自动拾取路由切换为 transaction。

## 四、推荐告警阈值（参考 §4.1 报告）

| 告警 | 表达式（PromQL） | 阈值 | 严重度 |
| --- | --- | --- | --- |
| HTTP 5xx 异常 | `sum(rate(http_request_duration_seconds_count{status=~"5.."}[5m])) / sum(rate(http_request_duration_seconds_count[5m]))` | >1% 连续 10 分钟 | P1 |
| 接口 P99 慢 | `histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, route))` | >2s | P2 |
| OCR 队列堆积 | `ocr_queue_jobs{state="waiting"}` | >50 持续 10 分钟 | P2 |
| OCR DLQ 增长 | `increase(ocr_queue_jobs{state="failed"}[1h])` | >5/h | P1 |
| LLM rate_limit 占比 | `sum(rate(llm_call_total{status="rate_limit"}[5m])) / sum(rate(llm_call_total[5m]))` | >5% | P1 |
| LLM schema_invalid 异常 | `sum(rate(llm_call_total{status="schema_invalid"}[15m]))` | >0.1/s | P2 |
| LLM 平均时延 | `histogram_quantile(0.9, sum(rate(llm_call_duration_seconds_bucket[5m])) by (le, model))` | >10s | P2 |
| LLM fallback 飙升 | `rate(llm_fallback_triggered_total[10m])` | >0.05/s | P2 |
| LLM token 成本 | `sum(rate(llm_tokens_total[1h])) by (provider, model)` | 周环比 +50% | P3 |
| 匹配评分异常偏低 | `match_score{quantile="0.5"}` | <0.3 持续 1h | P3 |

## 五、本地验证速查

```bash
# 后端单测（含 metrics + Sentry scrubber + LLM 可观测性）
cd server && npm test

# 启动后用 curl 抓取 metrics（METRICS_ALLOW_ALL=true 仅本机调试用）
METRICS_ALLOW_ALL=true npm run dev
curl -s http://localhost:3000/metrics | grep -E '^llm_(call|tokens|fallback)'
```

## 六、与 A1 (LLM 调用统一封装) 的关系

- A1 引入 `services/llmClient.js`：所有 LLM 调用 → `chatJson(provider, messages, schema)`。
- A3 把 instrumentLlmCall 包在 `ocr.js` 内**对 chatJson 的调用处**（而非 llmClient 内部），原因：
  1. `operation` label（`ocr_pdf` / `ocr_image` / `ocr_text`）在 ocr.js 这一层最自然。
  2. 避免 llmClient 内部的重试也被独立计数，单次业务调用 = 单次 metric 样本。
  3. 未来若有非 OCR 的 LLM 用法（治疗推荐、试验摘要），同样在调用方包一层即可。
