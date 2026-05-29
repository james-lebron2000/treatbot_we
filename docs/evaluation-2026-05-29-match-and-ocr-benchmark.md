# Treatbot Matching and OCR Benchmark

Date: 2026-05-29

## Scope

This report records the iteration that moves production matching to a two-stage ranking contract:

- Stage 1: `matchEngine` remains the high-recall candidate recall and heuristic scorer.
- Stage 2: `criterionMatcher` acts as refined ranking, review gating, and hard exclusion where decomposed criteria are available.

It also adds a real OCR benchmark path for:

- Volcengine `OCRNormal` text extraction.
- Doubao Seed 2.0 Lite structured streaming.

## Golden Match Evaluation

Dataset: `server/tests/fixtures/golden-matches.json`

Legacy `matchEngine` after hard-rule reinforcement:

- Precision: 100.0%
- Recall: 100.0%
- F1: 100.0%
- nDCG@10: 93.5%
- Threshold: 42

`criterionMatcher` CI gate:

- Precision: 100.0%
- Recall: 100.0%
- F1: 100.0%
- Accuracy: 100.0%
- Uncertain calibration: 8/14, 57.1%
- `missing_data`: 5/8, 62.5%
- `borderline_risk`: 3/6, 50.0%

Gate command:

```bash
cd server
node scripts/evalCriterionMatcher.js --ci
```

## OCR Benchmark

Command:

```bash
cd server
set -a; source /Users/lijinming/Documents/MDT/.env; set +a
OCR_BENCH_STRUCTURED_TIMEOUT_MS=120000 \
  node scripts/benchOcrStructured.js \
  --files public/demo/sample-2-nsclc.jpg \
  --out /tmp/treatbot-ocr-structured-real-1780065937
```

Result summary:

- OCR provider: Volcengine `OCRNormal`
- Structuring model: Doubao Seed 2.0 Lite
- OCR latency: 3.377s
- First structured field latency: 61.921s
- Structured latency: 93.049s
- Total latency: 96.428s
- OCR text length: 1,213 chars
- OCR line count: 44
- Field completeness: 0.667
- Estimated LLM cost: 0.007195 CNY
- Estimated OCR cost: 0.005 CNY/call default
- Estimated total: 0.012195 CNY

No raw OCR text is included in the benchmark report.

## Production Notes

- `parse-status` and match APIs should skip `scored.excluded` results.
- `criterionMatcher` now reports `requiresReview` for critical missing inclusion data instead of treating it as eligible.
- OCR schema now safely coerces numeric fields like `第2线` and lab/blood-count scalar values, preventing unnecessary full fallback retries.
- Uncertain labels are split into `missing_data` and `borderline_risk` so the evaluator does not collapse all uncertain cases into binary eligible/ineligible.
