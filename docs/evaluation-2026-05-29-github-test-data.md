# GitHub Test Data Evaluation 2026-05-29

本报告基于仓库内 GitHub 测试数据和最近 GitHub Actions 运行记录，评估 Treatbot 当前结构化抽取、试验匹配与 CI 测评链路的有效性。

## Data Sources

| Source | Scope | Notes |
|---|---:|---|
| `server/tests/fixtures/golden-matches.json` | 12 patients, 50 patient-trial pairs | 匹配引擎 gold standard，含 `eligible / ineligible / uncertain` 标签 |
| `server/fixtures/demoSamples.json` | 3 anonymized demo cases | 线上 `/api/demo/*` 的展示与 smoke fixture |
| `server/tests/promptEval.test.js` | 6 golden patients | Prompt contract + mock OCR extraction hit-rate |
| `bench-out/bench-summary.json` | 12 historical vision tasks | 2026-05-01 视觉 LLM benchmark baseline |
| GitHub Actions | latest 10 scheduled runs | `Schema Diff (daily)` 与 `Nightly Routine (auto-iterate)` |

当前本地评估 commit：`0c55948`。最近 GitHub scheduled runs 基于 `main` 的 `0a9771c`，因此 CI 结果用于判断测评链路健康，不代表本分支最新业务代码。

## Commands

```bash
node server/scripts/evalMatchEngine.js --verbose
node server/scripts/evalCriterionMatcher.js --verbose
PROMPT_EVAL_REPORT_PATH=/tmp/treatbot-prompt-eval-report-$(date +%Y%m%d%H%M%S).json \
  npx jest tests/promptEval.test.js --runInBand --forceExit
gh run list --limit 10 --json databaseId,workflowName,conclusion,headBranch,headSha,createdAt
gh run view 26600520771 --log-failed
gh run view 26599622405 --job 78379596997 --log
```

## Results

### Match Engine

| Metric | Current `matchEngine` |
|---|---:|
| Dataset | 50 pairs, 12 patients |
| Threshold | 42 |
| TP / FP / FN / TN | 13 / 12 / 0 / 11 |
| Precision | 52.0% |
| Recall | 100.0% |
| F1 | 68.4% |
| Accuracy | 66.7% |
| Mean nDCG@10 | 80.1% |
| Uncertain moderate scores | 10 / 14 |

结论：现有 `matchEngine` 是高召回候选生成器，能避免漏掉明确 eligible 试验，但误报偏高。12 个 false positive 主要来自硬排除条件未被强约束，包括癌种不匹配、基因/分子要求不满足、ECOG 边界和治疗线数条件。

### Criterion-Level Matcher

| Metric | `criterionMatcher` |
|---|---:|
| Dataset | 50 pairs evaluated |
| TP / FP / FN / TN | 13 / 0 / 0 / 23 |
| Precision | 100.0% |
| Recall | 100.0% |
| F1 | 100.0% |
| Accuracy | 100.0% |
| Uncertain moderate scores | 0 / 14 |

结论：criterion-level matcher 在明确 eligible/ineligible 上显著优于旧 matchEngine，可作为二阶段精排和硬排除门禁。但 uncertain 样本全部被推向极高分或 excluded，缺少“信息不足但可能可入组”的中间态评分，应补独立 uncertain calibration 指标。

### Prompt Eval

| Metric | Value |
|---|---:|
| Jest suites/tests | 1 suite / 4 tests passed |
| Simulated OCR cases | 6 |
| Extraction hit rate | 75.0% |
| Missing field rate | 25.0% |
| Risk word occurrence | 2 |

结论：prompt contract 仍有效，`ocr-pdf / ocr-text / match-explain` 均无模板占位符残留。该测评是 mock extraction，不代表真实 OCR/LLM 精度，只能作为 prompt 合约和字段口径的轻量回归。

### Historical OCR Benchmark Baseline

`bench-out/bench-summary.json` 显示 2026-05-01 的旧视觉链路基线：

| Provider | Success | Avg Latency | Total Cost |
|---|---:|---:|---:|
| Kimi vision | 6 / 6 | 29.7s | ¥0.3535 |
| Doubao vision | 6 / 6 | 85.2s | ¥0.2364 |

结论：这份 baseline 是视觉 LLM 旧链路，不覆盖当前 Volcengine OCRNormal + Doubao-Seed-2.0-lite 文本结构化的新链路。下一轮应新增同一 6 份 fixture 的新链路 benchmark。

## GitHub Actions Findings

最近 10 次 scheduled runs 中，`Schema Diff (daily)` 与 `Nightly Routine (auto-iterate)` 多次显示 failure。日志显示：

| Workflow | Failing Step | Root Cause |
|---|---|---|
| Schema Diff | `Run migrations against test schema` | workflow 只设置 `DB_PASS=rootpw`，后端 `server/config/database.js` 读取 `DB_PASSWORD`，迁移连接显示 `using password: NO` |
| Nightly Routine e2e | `Wait for services` | service readiness 依赖 `mysqladmin -prootpw`，但后续迁移同样缺 `DB_PASSWORD`，且当前 wait loop 没打印 MySQL/Redis 单项诊断 |
| Nightly Routine auto-iterate | lint/test gate | 通过 |

已在当前分支修复 CI env：`schema-diff.yml` 与 `nightly-routine.yml` 同时设置 `DB_PASSWORD=rootpw`，保留 `DB_PASS=rootpw` 供 `scripts/db/schema-dump.sh` 使用。

## Recommendations

1. 生产匹配排序采用两阶段：`matchEngine` 保留为高召回候选召回，`criterionMatcher` 作为精排和硬排除门禁。
2. 把 `criterionMatcher` 加入正式 GitHub Action 测评门禁，输出 precision / recall / F1 / uncertain calibration。
3. 对旧 `matchEngine` 的 FP 做硬规则补强：癌种不匹配、明确基因要求不满足、ECOG 超限、治疗线数不满足时直接 excluded 或强降分。
4. 新增真实 OCR 链路 benchmark：Volcengine OCRNormal 文本抽取、Doubao-Seed-2.0-lite 结构化首字段耗时、总耗时、字段完整率、成本。
5. 扩充 `golden-matches.json` 的 uncertain 标注口径，区分“缺信息待补充”和“高风险但不可直接排除”，避免模型把 uncertain 全部二值化。
