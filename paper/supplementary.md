# Supplementary Information

**An explainable, privacy-preserving system for matching cancer patients to clinical trials from real-world Chinese medical records**

All values below are read from the committed snapshot `paper/figures/data/metrics.json`
(provenance recorded in its `_provenance` block) and the underlying repository artifacts.
The gold-standard evaluation set is **curated and semi-synthetic** and small; it is not a
prospective cohort. See `paper/README.md` for the full evidence-provenance table and
reproduction commands.

---

## Supplementary Note 1 — Metric definitions

**Decision rule (both engines).** A trial is predicted to *match* a patient when the engine
does **not** exclude it and its score is at or above the threshold `SCORE_MIN` = 42. This rule
is identical for the weighted scorer and the criterion-level matcher, so differences in their
results are attributable to the matching logic, not to thresholding.

**Binary classification.** Over patient–trial pairs, *eligible* pairs are positives and
*ineligible* pairs are negatives. *Uncertain* pairs are excluded from precision/recall and
tracked separately (Supplementary Note 2). With TP, FP, FN, TN the usual counts:

- Precision = TP / (TP + FP)
- Recall = TP / (TP + FN)
- F1 = 2·Precision·Recall / (Precision + Recall)
- Accuracy = (TP + TN) / (TP + FP + FN + TN)

**Ranking (nDCG@10).** For each patient, trials are ranked by engine score and compared to an
ideal ranking under graded relevance (eligible = 2, uncertain = 1, ineligible = 0), using the
standard DCG with gain 2^rel − 1 and log₂ discount; nDCG is the mean over patients. Because the
criterion-level gate is a classifier rather than a ranker, nDCG is reported for the weighted
scorer only.

**Reproduction.** `node server/scripts/evalMatchEngine.js` and
`node server/scripts/evalCriterionMatcher.js` (raw outputs in `paper/figures/data/*.txt`).

---

## Supplementary Note 2 — Uncertain-class calibration

The gold set contains 14 *uncertain* pairs that are excluded from precision/recall. As a coarse
calibration proxy we record how many fall in a moderate score band (not excluded, score strictly
between 20 and 80): the weighted scorer placed 10/14 in this band, whereas the criterion-level
matcher placed 0/14 there (it is a hard classifier and does not emit calibrated mid-range scores).
This metric is heuristic and is reported only to characterise behaviour on ambiguous pairs; it is
not used to claim calibration quality.

---

## Supplementary Table S1 — Full per-document extraction benchmark

Six de-identified real-world records, 2026-05-01. All PDFs fell back to the page-rendered vision
path in this run (the native-text path was unavailable), so costs are a vision-path upper bound.
Cost is computed from each provider's published per-token pricing (Supplementary Table S4). The
text-only MiniMax model is omitted from per-document rows because it produced no usable OCR output
(it fabricated content unrelated to the images; see Supplementary Note 3).

| Document | Provider | Mode | Latency (s) | Tokens | Cost (CNY) |
|---|---|---|---|---|---|
| A-Yu-Li-mixed | doubao | vision_pdf | 27.9 | 5716 | 0.0167 |
| A-Yu-Li-mixed | kimi | vision_pdf | 7.0 | 3642 | 0.0343 |
| Huang-gene | doubao | vision_pdf | 91.8 | 9623 | 0.0491 |
| Huang-gene | kimi | vision_pdf | 25.1 | 4672 | 0.0640 |
| LSLI-pancreatic | doubao | vision_pdf | 92.4 | 8926 | 0.0433 |
| LSLI-pancreatic | kimi | vision_pdf | 35.6 | 4510 | 0.0593 |
| MSHU-urothelial | doubao | vision_pdf | 149.0 | 11443 | 0.0642 |
| MSHU-urothelial | kimi | vision_pdf | 37.8 | 4444 | 0.0574 |
| t1.png | doubao | vision_image | 117.1 | 6979 | 0.0467 |
| t1.png | kimi | vision_image | 67.6 | 5159 | 0.1231 |
| t4.png | doubao | vision_image | 33.0 | 3312 | 0.0163 |
| t4.png | kimi | vision_image | 5.4 | 1421 | 0.0155 |
| **doubao — total cost / mean latency** | | | 85.2 | | 0.2364 |
| **kimi — total cost / mean latency** | | | 29.7 | | 0.3535 |

Document key: LSLI = pancreatic carcinoma gene report (5.9 MB, 13 p); MSHU = urothelial
carcinoma scanned PDF (23 MB, 22 p); Huang = gene report (1.0 MB, 41 p); A-Yu-Li = mixed report
(12 MB, 76 p); t1.png = colorectal-carcinoma record image (2.7 MB); t4.png = record image (495 KB).
Source: `docs/bench-vision-llm-2026-05-01.md`.

---

## Supplementary Table S2 — Gold-standard composition

Curated/semi-synthetic; constructed from de-identified clinical patterns. Source:
`server/tests/fixtures/golden-matches.json` (v1.0, 2026-04-15).

| Property | Value |
|---|---|
| Patients | 12 |
| Patient–trial pairs | 50 |
| Eligible pairs | 13 |
| Ineligible pairs | 23 |
| Uncertain pairs | 14 |
| Cancer types | NSCLC, SCLC, liver, breast, colorectal, gastric (6) |
| nDCG relevance mapping | eligible = 2, uncertain = 1, ineligible = 0 |

---

## Supplementary Table S3 — PII types covered by the LLM-path scrubber

`scrubForLlm` (`server/utils/piiScrubber.js`) replaces each detected value with a stable typed
placeholder `<TYPE_N>`; the placeholder→value mapping is held only in memory for one call and is
never logged or persisted. `restoreFromLlm` re-inserts originals into human-readable output fields.

| PII type | Placeholder | Detection |
|---|---|---|
| Mobile phone | `<PHONE_N>` | 11-digit `1[3-9]…` pattern |
| National ID | `<ID_N>` | 18-digit (17 digits + check digit/X) |
| Bank card | `<BANKCARD_N>` | 16–19 consecutive digits (after ID removal) |
| E-mail | `<EMAIL_N>` | standard address pattern |
| Name | `<NAME_N>` | label-anchored (姓名/患者: …) heuristic |
| Address | `<ADDR_N>` | province/city + road/number structure |

The log-side `scrubForLog` is **irreversible** (no mapping): phone numbers keep only their last
four digits (`***1234`); ID, bank-card and e-mail are redacted.

---

## Supplementary Table S4 — Provider pricing used for cost computation

Published list pricing, CNY per 1M tokens. Source: `metrics.json.ocr_benchmark.pricing_cny_per_1m_tokens`.

| Provider | Input (CNY/1M) | Output (CNY/1M) | Vision-capable | Usable for OCR |
|---|---|---|---|---|
| Doubao (`doubao-seed-1-6-vision`) | 0.86 | 8.28 | yes | yes |
| Kimi (`moonshot-v1-128k-vision`) | 6.84 | 28.80 | yes | yes (truncation risk on long records) |
| MiniMax (`MiniMax-M2`, text-only key) | 1.20 | 6.00 | no | **no — fabricates content** |

---

## Supplementary Note 3 — The false-positive case (trial 22615) and the fabrication failure mode

**Additive-scoring false positives.** Trial 22615 requires an activating HER2 tyrosine-kinase-
domain mutation. The weighted scorer placed four ineligible patients above threshold — P01 (score
63), P02 (78), P03 (60), P04 (53) — because high agreement on disease, stage and other dimensions
outweighed the unmet, disqualifying gene requirement; a fifth patient (P05) correctly scored 0.
These exact scores are reproduced in the committed verbose artifact
`paper/figures/data/eval_matchengine_verbose.txt` (lines flagged `[FP]`). The criterion-level
matcher assigns the HER2 gene criterion a *not-met* verdict and excludes the trial for all four,
removing the false positives.

**Fabrication failure mode.** The text-only MiniMax model, reached through a coding-plan key,
returns HTTP 200 with fluent text but ignores the supplied image, fabricating clinical content —
in one case inventing an ovarian-cyst presentation for a colorectal-cancer record image. It is
therefore categorically unusable as a medical-extraction front-end despite favourable nominal
pricing and latency. Only a faithfulness check (verifying that returned text corresponds to the
document's actual content) distinguishes it from the usable vision providers; nominal accuracy or
cost metrics do not. Source: `docs/bench-vision-llm-2026-05-01.md`.
