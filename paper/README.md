# Treatbot manuscript — reproduction & evidence provenance

This directory contains a Nature Communications–style manuscript for the Treatbot system,
its figures, and everything needed to reproduce them.

> **Integrity policy.** Every quantitative value in the manuscript and figures is traceable to
> a real run of a repository script or a committed repository artifact. No value is hand-entered
> or model-estimated. The gold-standard evaluation set is **curated and semi-synthetic** and
> **small** (12 patients, 50 pairs); it is described as such everywhere. We make **no** claims of
> prospective/clinical validation, enrolment outcomes, or a prompt-injection defense.

## Contents

```
paper/
├── manuscript.md         # Main Article (English, Nature Communications structure)
├── supplementary.md      # Supplementary notes + tables (S1–S4)
├── references.bib         # Real BibTeX; entries marked "VERIFY" need final metadata check
├── README.md              # this file
└── figures/
    ├── figstyle.py        # shared style + single data loader (reads data/metrics.json)
    ├── fig1_architecture.py
    ├── fig2_ocr_benchmark.py
    ├── fig3_matching.py
    ├── fig4_eval.py
    ├── fig5_privacy.py
    ├── fig1_architecture.png … fig5_privacy.png   # rendered figures (300 dpi)
    └── data/
        ├── metrics.json                  # the SINGLE source every figure/number reads from
        ├── eval_matchengine.txt          # raw evalMatchEngine.js output
        ├── eval_matchengine_verbose.txt  # raw verbose output (per-pair scores, incl. trial 22615)
        └── eval_criterionmatcher.txt     # raw evalCriterionMatcher.js output
```

## Reproduce the figures

Requires Python 3.11+, matplotlib, numpy.

```bash
cd paper/figures
for f in fig1_architecture fig2_ocr_benchmark fig3_matching fig4_eval fig5_privacy; do
  python3 "$f.py"
done
```

Every figure reads **only** from `figures/data/metrics.json` (schematic labels aside), so figures
cannot silently diverge from the numbers in the text.

## Regenerate the underlying numbers

The matching results come from two standalone scripts that need no database (they run against
committed fixtures and data files). Run from the repository root after `npm install --prefix server`:

```bash
node server/scripts/evalMatchEngine.js        --verbose   # > paper/figures/data/eval_matchengine_verbose.txt
node server/scripts/evalCriterionMatcher.js               # > paper/figures/data/eval_criterionmatcher.txt
```

The OCR benchmark is a committed artifact (`docs/bench-vision-llm-2026-05-01.md`); regenerating it
requires live provider API keys and is run via `node server/scripts/benchVisionLlm.js`.

After regenerating, update `figures/data/metrics.json` (keep its `_provenance` block accurate) and
re-render the figures.

## Render the manuscript to Word/PDF/LaTeX

Citations use pandoc `[@key]` syntax keyed to `references.bib`:

```bash
pandoc manuscript.md --citeproc --bibliography=references.bib -o manuscript.docx
pandoc manuscript.md --citeproc --bibliography=references.bib -o manuscript.pdf
```

## Evidence-provenance table

Every headline number → exactly where it comes from. Commands are run from the repository root.

| Claim / value | Value | Source (command or file) |
|---|---|---|
| Trial corpus (recruiting) | 496 | key count of `server/data/decomposed_criteria.json` and `server/data/structured_inclusion.json`; `README.md` |
| Gold set size | 12 patients, 50 pairs | `server/tests/fixtures/golden-matches.json`; header of `evalMatchEngine.js` run |
| Gold label counts | 13 eligible / 23 ineligible / 14 uncertain | `server/tests/fixtures/golden-matches.json` |
| Gold cancer types | NSCLC, SCLC, liver, breast, colorectal, gastric | `server/tests/fixtures/golden-matches.json` |
| **Weighted scorer** P / R / F1 / Acc | 52.0 / 100 / 68.4 / 66.7 | `node server/scripts/evalMatchEngine.js` → `eval_matchengine.txt` |
| Weighted scorer nDCG@10 | 80.1 | same |
| Weighted scorer confusion | TP 13 / FP 12 / FN 0 / TN 11 | same |
| **Criterion matcher** P / R / F1 / Acc | 100 / 100 / 100 / 100 | `node server/scripts/evalCriterionMatcher.js` → `eval_criterionmatcher.txt` |
| Criterion matcher confusion | TP 13 / FP 0 / FN 0 / TN 23 | same |
| HER2 false positives (trial 22615) | P01=63, P02=78, P03=60, P04=53 (all FP) | `eval_matchengine_verbose.txt` (lines flagged `[FP]`); reason in `golden-matches.json` |
| Match threshold | 42 (`SCORE_MIN`) | `server/services/matchEngine.js`; `evalMatchEngine.js` |
| Scoring weights (Table 2) | disease 34/26, gene 20, … (max 99) | `server/services/matchEngine.js`; `README.md` |
| OCR — Doubao | 6/6, ¥0.2364, 85.2 s mean | `docs/bench-vision-llm-2026-05-01.md` |
| OCR — Kimi | 6/6, ¥0.3535, 29.7 s mean | same |
| OCR — MiniMax | unusable (fabricates content) | same |
| Token pricing (CNY/1M) | Doubao 0.86/8.28; Kimi 6.84/28.80; MiniMax 1.20/6.00 | same |
| Reversible PII scrub | `scrubForLlm` / `restoreFromLlm` | `server/utils/piiScrubber.js` |
| One-way log mask | `scrubForLog` (phone keeps last 4) | `server/utils/piiScrubber.js` |
| CSV formula-injection escape | CWE-1236, prefix `'` on `= + - @ \t \r` | `server/utils/csvSafe.js` |
| RBAC | 401 unauth / 403 wrong role | `server/middleware/adminAuth.js` |
| Audit logging | `AdminAuditLog.create({action,…})` | `server/middleware/auditLog.js` |
| Zod schema validation | every LLM output validated | `server/services/llmSchemas.js` |
| Versioned prompt registry | version `v1` | `server/services/promptRegistry.js` |
| Observability | Prometheus registry `treatbot_*` | `server/middleware/metrics.js` |

## What this manuscript does NOT claim

- No prospective or clinical validation; no enrolment or screening outcomes.
- No real patient data is included; the gold set is curated/semi-synthetic.
- The OCR benchmark is 6 documents, vision-path only — costs are an upper bound.
- No explicit prompt-injection fence is implemented (verified by code search); schema validation
  bounds output *structure* only.
- Absolute matching scores (esp. the criterion matcher's 100%) index internal consistency on a
  small checkable set, not field-level accuracy.
