# An explainable, privacy-preserving system for matching cancer patients to clinical trials from real-world Chinese medical records

**Authors.** [Author names and affiliations to be completed]

**Corresponding author.** [name, email]

---

> **Manuscript status / provenance note (delete before submission).**
> This is a Nature Communications–style master manuscript for the Treatbot system.
> Every quantitative value is traceable to a real evaluation run or a committed
> repository artifact, indexed in `paper/README.md` (evidence-provenance table) and
> snapshotted in `paper/figures/data/metrics.json`. Citations use pandoc `[@key]`
> syntax keyed to `paper/references.bib`; render the final numbered bibliography with
> `pandoc --citeproc --bibliography=paper/references.bib`. Entries marked `VERIFY` in
> the `.bib` need a final metadata check. The gold-standard evaluation set is **curated
> and semi-synthetic** and is described as such throughout.

---

## Abstract

Matching cancer patients to clinical trials is a recognised oncology bottleneck, and is
hardest when the only available patient data are raw, photographed, Chinese-language
records rather than curated electronic health records. We present Treatbot, a deployed
system that ingests patient-uploaded record images and PDFs, performs vision–language OCR
with schema-constrained extraction, and matches patients against 496 actively-recruiting
trials with explainable, criterion-level reasoning. On a curated, semi-synthetic
gold-standard set (12 patients, 50 patient–trial pairs), a conventional weighted additive
scorer reached perfect recall but only 52.0% precision, generating systematic false
positives by failing to enforce hard eligibility constraints; decomposing eligibility into
per-criterion verdicts removed every false positive (100% precision and F1). A
multi-provider benchmark on six real records quantifies cost, latency and faithfulness
trade-offs, including silently fabricated output from a text-only model. Treatbot couples
these capabilities with reversible PII de-identification and end-to-end observability — a
transparent path from raw documents to trustworthy matches.

---

## Introduction

Patient recruitment is one of the most persistent obstacles in clinical research. A large
fraction of trials fail to reach their accrual targets on time, and slow or insufficient
enrolment is a leading cause of trial termination and of delay in bringing new therapies to
patients [@kadam2016recruitment; @bennette2016accrual]. In oncology the problem is acute:
eligibility criteria are numerous, molecularly specific, and change rapidly as biomarker-
directed therapies proliferate, so that identifying the few trials for which a given patient
qualifies is laborious even for specialists [@woo2019aiboost; @hutson2024accelerate]. The
matching task is fundamentally one of structured reasoning over heterogeneous, free-text
eligibility criteria and equally heterogeneous patient descriptions.

A substantial body of work has sought to automate parts of this pipeline. Rule- and
ontology-based systems translate eligibility criteria into structured database queries for
cohort definition [@yuan2019criteria2query; @stubbs2019n2c2], and dedicated test collections
have been built to study patient–trial retrieval [@koopman2016testcollection]. Deep-learning
matchers such as DeepEnroll and COMPOSE learn embeddings that align patient records with
criteria [@zhang2020deepenroll; @gao2020compose]. More recently, large language models (LLMs)
have been applied to eligibility extraction and to matching itself [@datta2024autocriteria;
@yuan2023augmentation; @wong2023oncology; @nievas2024distilling]. The most directly relevant
prior work, TrialGPT, established that decomposing a trial's eligibility into individual
criteria and predicting a per-criterion verdict — rather than scoring a patient against a
trial as a single unit — yields accurate, *explainable* matches and aggregates into strong
ranking performance [@trialgpt]. These advances rest on the broader observation that LLMs
encode substantial clinical knowledge and can follow multi-step reasoning instructions
[@singhal2023clinicalknowledge; @wei2022cot; @vaswani2017attention; @openai2023gpt4;
@tian2024chatgpt].

Yet a gap separates these results from deployment for the patients who would benefit most.
Existing matchers are typically evaluated on clean, English, already-structured inputs —
de-identified EHR notes or trial registry text — and are not deployed end-to-end. In much of
the world, and specifically for the Chinese oncology patients Treatbot serves, the *only*
data a patient can supply is a photograph or a scanned PDF of a paper record or a genetic-
test report, in Chinese, of variable quality. Turning such artefacts into a trustworthy,
explained shortlist of trials requires solving several coupled problems that the matching
literature largely brackets away: robust optical character recognition and structured
extraction from real-world documents; faithful handling that does not silently invent
clinical facts; protection of the personal and health information densely present in those
documents; and explanations a patient or clinician can check. TrialGPT itself names raw-
document ingestion, languages other than English, prospective deployment, and privacy as
open directions [@trialgpt].

Here we describe Treatbot, a system built to close that gap, and report an evaluation that
foregrounds scientific honesty about what such a system can and cannot yet claim. Our
contributions are four. First, we describe a deployed, end-to-end pipeline — upload, vision-
language OCR, schema-constrained extraction, two-stage matching, explained ranking — that
operates on raw patient-uploaded Chinese documents (Fig. 1). Second, we report a real multi-
provider benchmark of document extraction that quantifies the cost, latency and *faithfulness*
trade-offs between vision-capable models, and documents a concrete failure mode in which a
text-only model returns fluent but entirely fabricated output (Fig. 2). Third, on a curated,
semi-synthetic gold-standard set we show — independently of TrialGPT, in a different language
and input regime — that a weighted additive scorer achieves perfect recall but poor precision
because it cannot enforce hard constraints, and that decomposing eligibility into per-criterion
verdicts removes every false positive (Figs. 3, 4). Fourth, we detail the privacy- and
observability-engineering that makes the system deployable, including a reversible PII de-
identification scheme that protects patient data before any model call (Fig. 5). We are
deliberate about limitations: the gold set is small and semi-synthetic, the benchmark is
modest, and we make no claims about prospective enrolment outcomes.

---

## Results

### A deployed end-to-end system for trial matching from real-world records

Treatbot is organised as a five-stage pipeline (Fig. 1). A patient uploads one or more
medical-record images or PDFs through a web (H5) page or a WeChat mini-program. Each document
passes through a vision-language OCR stage that converts pixels to text, followed by a
schema-constrained extraction stage that produces a validated structured patient profile
(diagnosis, stage, biomarkers, treatment line, performance status and related fields). The
profile is matched against a corpus of 496 actively-recruiting trials in two stages — a SQL
coarse filter followed by in-memory scoring and a criterion-level eligibility gate — and the
patient receives a ranked shortlist in which every trial is accompanied by human-readable
reasons. The system is implemented as a Node.js/Express service with a Sequelize/MySQL data
layer and a Redis/Bull queue for asynchronous OCR, and is deployed in production (Table 1).

Three properties hold across the whole pipeline and are revisited below: personal and health
information is reversibly de-identified before any LLM call; extraction progress is streamed
to the client field-group by field-group via server-sent events (SSE) so that the interface
paints partial results quickly; and every match carries an explanation. These choices reflect
the system's purpose — to be used directly by patients on documents they hold — rather than to
post-process a clean institutional EHR.

### Structured extraction from raw documents: a multi-provider benchmark

Because Treatbot's input is raw documents, the OCR/extraction front-end determines whether the
rest of the pipeline ever sees correct facts. We benchmarked three LLM providers on the same
six de-identified real-world records — a mix of gene-panel reports and record images spanning
pancreatic, urothelial and colorectal cancers — measuring cost, latency and, critically,
faithfulness (Fig. 2; Methods; full per-document table in Supplementary Table S1).

Two vision-capable providers succeeded on all six documents but with a clear trade-off. Doubao
(`doubao-seed-1-6-vision`) completed the set for ¥0.2364 at a mean 85.2 s per document, whereas
Kimi (`moonshot-v1-128k-vision`) was roughly three times faster (29.7 s) but ~50% more
expensive (¥0.3535) and exhibited a repetition / `max_tokens` truncation failure on the longest
record image. The third provider, a text-only MiniMax model reached through a coding-plan key,
was *unusable for OCR*: it returns HTTP 200 and fluent text but ignores the image entirely,
fabricating clinical content — in one case inventing an ovarian-cyst case for a colorectal-
cancer image. This is the most important qualitative result of the benchmark: a model that is
fast, cheap and superficially plausible can be categorically unsafe for a medical-extraction
front-end, and only a faithfulness check distinguishes it from the usable providers. The cost
figures here reflect a vision-path upper bound, because all PDFs fell back to the vision path in
this run (the cheaper native-text path was unavailable); production text-path costs are lower.

### Explainable two-stage patient–trial matching

Matching proceeds in two stages (Fig. 3a). A SQL coarse filter first reduces the 496-trial
corpus to a candidate set using indexable constraints (disease, recruiting status, geography).
Candidates are then scored in memory along interpretable clinical dimensions whose weights are
fixed and inspectable (Fig. 3b; Table 2): disease match dominates (exact +34, directional +26),
followed by gene/mutation concordance (+20), then stage, treatment line, performance status
(ECOG) and PD-L1, with small contributions from disease tags and geography over a base score
(maximum attainable 99; match threshold 42). Crucially, the weighted score is paired with a
*criterion-level gate*: each trial's eligibility is decomposed into individual criteria, and a
deterministic-plus-semantic check assigns each a verdict (met, not met, or exclusion-triggering),
so that a single unmet hard constraint can veto a trial regardless of how high its additive
score is. Every surfaced match therefore carries both a score breakdown and per-criterion
reasons (Fig. 3c), which is what the patient-facing interface displays.

### Criterion-level matching eliminates the false positives that scoring cannot

To quantify the value of the criterion-level gate we evaluated both engines against the same
curated, semi-synthetic gold-standard set (12 patients, 50 patient–trial pairs labelled
eligible/ineligible/uncertain across six cancer types; Methods), using identical inputs and the
same decision rule (a trial matches when it is not excluded and scores at or above threshold).
The results are summarised in Fig. 4.

The weighted scorer achieved perfect recall (100%) but only 52.0% precision (F1 68.4%, accuracy
66.7%; mean nDCG@10 80.1%). Its errors were systematic rather than random: of 23 ineligible
pairs it misclassified 12 as matches (Fig. 4b). A representative case is trial 22615, which
requires an activating HER2 tyrosine-kinase-domain mutation; the scorer placed four patients
who carry EGFR, ALK or other non-HER2 drivers above threshold (scores 53–78), because strong
agreement on disease, stage and other dimensions outweighed the unmet — and disqualifying —
gene requirement (Fig. 4e). This is the additive-scoring failure mode in miniature: summation
cannot represent a hard constraint.

Replacing the additive decision with the criterion-level gate, on identical inputs, removed
*every* false positive: precision, recall, F1 and accuracy all reached 100% (confusion matrix
Fig. 4c), because the unmet HER2 criterion produces a not-met verdict that excludes the trial.
We emphasise the gold set is small and semi-synthetic, so these absolute values index internal
consistency rather than field performance; nonetheless the direction and mechanism reproduce,
in a Chinese, raw-document setting, the central finding of criterion-decomposition work on
English structured inputs [@trialgpt], strengthening the case that explainable per-criterion
reasoning is the right substrate for eligibility matching. (The criterion gate is a classifier,
not a ranker, so nDCG is reported for the scorer only.)

### Privacy- and observability-by-design

Operating on patient-held documents makes privacy a first-class requirement rather than an
afterthought. Treatbot applies two distinct de-identification policies chosen by destination
(Fig. 5a). On the path to any LLM, `scrubForLlm` replaces phone numbers, national ID numbers,
bank-card numbers, e-mail addresses, names and detailed addresses with typed placeholders
(`<NAME_1>`, `<PHONE_1>`, …); the placeholder-to-value mapping is held only in memory for the
duration of a single call and is never logged or persisted, and a complementary `restoreFromLlm`
step re-inserts the real values into the validated output the user sees. On the path to logs and
error monitoring, `scrubForLog` applies an *irreversible* one-way mask (phone numbers retain only
their last four digits; other identifiers are redacted), with no mapping retained. The same
sensitive field is thus handled differently depending on where it is going.

Around this core, several verified controls provide defence in depth (Fig. 5b): every LLM output
is validated against a Zod schema before use; CSV exports escape formula-injection triggers
(CWE-1236) so that patient-supplied free text cannot execute when an operator opens a spreadsheet
[@greshake2023indirect; @owasp2023llmtop10]; administrative and CRO actions pass through role-
based access control (returning 401/403) and an audit-log middleware; and extraction uses a
versioned prompt registry with multi-provider fallback. Finally, the system is observable: a
Prometheus registry (`treatbot_*`) exports HTTP-request latency, OCR-queue depth, a match-score
summary and per-provider/-model LLM-call latency, so that cost and quality can be tracked in
production (Fig. 5c).

---

## Discussion

We set out to determine whether a transparent, privacy-respecting system can carry a cancer
patient from a raw, Chinese-language record photograph to a trustworthy, explained shortlist of
clinical trials, and to measure honestly where such a system succeeds and where it does not. Three
findings stand out. First, the front-end matters as much as the matcher: a benchmark of real
documents showed not only a cost/latency/quality trade-off between usable providers but a
categorical safety distinction, in that a text-only model produced fluent, fabricated clinical
content that only a faithfulness check exposed. Any deployed medical-extraction system needs such
a check, not merely an accuracy metric. Second, on a curated gold set we reproduced — in a new
language and a far messier input regime — the now-recurring result that eligibility matching
should be framed as per-criterion reasoning rather than holistic scoring: weighted summation gave
perfect recall but only 52% precision and characteristic, explainable false positives (e.g. HER2-
required trial 22615), whereas a criterion-level gate eliminated them [@trialgpt;
@datta2024autocriteria]. Third, deployability is largely an engineering story about privacy and
observability, and we have shown that reversible, in-memory de-identification can protect dense
PII without preventing the user from seeing their own data.

Our work differs from prior LLM trial-matchers principally in setting rather than in matching
algorithm. TrialGPT and related systems were evaluated on clean English structured inputs and
were not deployed end-to-end [@trialgpt; @wong2023oncology; @nievas2024distilling]; Treatbot
targets raw patient-uploaded Chinese documents, is deployed, is privacy-engineered, and is cost-
profiled across providers — directions explicitly left open by that prior work. The convergence
of independent systems on the criterion-decomposition finding, across languages and input
regimes, is itself evidence for its robustness.

### Limitations

The limitations are substantial and we state them plainly. (i) The gold-standard set is **small
and semi-synthetic** — 12 patients and 50 patient–trial pairs, constructed from de-identified
clinical patterns rather than sampled prospectively — so the reported 100% precision/F1 of the
criterion-level matcher indexes internal consistency on checkable cases, not field-level accuracy;
larger, prospectively-collected gold sets are required. (ii) We report **no prospective or clinical
validation and no enrolment outcomes**: we do not show that Treatbot's matches lead to screening,
eligibility confirmation or accrual, which is the outcome that ultimately matters. (iii) The OCR
benchmark is **modest (six documents) and vision-path-only**, so its absolute costs are an upper
bound and its faithfulness findings, though striking, are not exhaustive. (iv) The system is
**single-region and single-language** (Chinese oncology), and the matching weights are hand-set
rather than learned. (v) Calibration of the *uncertain* class is imperfect and treated heuristically.
(vi) We **do not claim a prompt-injection defense**: no explicit fence was found in the prompt-
construction code, and schema validation bounds output structure but is not a complete safeguard
against adversarial document content [@perez2022ignore; @greshake2023indirect].

### Future work

These limitations define the roadmap: a prospective, multi-site evaluation with clinician
adjudication and, ultimately, enrolment outcomes; a larger and openly-described gold standard; an
expanded, adversarial OCR/faithfulness benchmark with a native-text path; learned rather than
hand-set criterion weights; fairness analysis across cancer types and document qualities; and a
documented regulatory and data-governance pathway. Treatbot establishes feasibility and a
transparent baseline; converting that into demonstrated clinical benefit is the work ahead.

---

## Methods

### Corpus construction and criteria decomposition

The trial corpus comprises 496 actively-recruiting trials. For each trial, eligibility text is
maintained in two complementary representations used by the two matching stages: a
*structured-inclusion* record (`server/data/structured_inclusion.json`) capturing indexable fields
(allowed cancer types, required genes, required stage, PD-L1 requirement, required/excluded prior
therapies, prior-line bounds and other key criteria), and a *decomposed-criteria* record
(`server/data/decomposed_criteria.json`) that lists individual criteria for per-criterion
evaluation. Both files key on the same 496 trial identifiers.

### Document ingestion and OCR

Patients upload images or PDFs through the web/H5 or WeChat mini-program client. Documents are
processed through a provider chain of vision-capable LLMs; OCR runs asynchronously on a Redis/Bull
queue, and progress is streamed to the client as server-sent events grouped by field. PDFs use a
native-text path when available and otherwise fall back to a page-rendered vision path (the regime
under which the benchmark below was run). The provider benchmark used the standalone harness
`server/scripts/benchVisionLlm.js`.

### Structured extraction

OCR text is converted to a structured patient profile by an LLM call whose output is validated
against a Zod schema (`server/services/llmSchemas.js`) before any downstream use; structurally
invalid responses are rejected. Extraction uses a versioned prompt registry
(`server/services/promptRegistry.js`, version `v1`) and a multi-provider client
(`server/services/llmClient.js`) that falls back across providers on failure.

### Two-stage matching

*Stage 1 (coarse filter).* An indexable SQL query restricts the corpus to candidates by disease,
recruiting status and geography.

*Stage 2a (weighted scoring).* The function `scoreRecordAgainstTrial`
(`server/services/matchEngine.js`) scores each candidate along interpretable dimensions with fixed
weights (Table 2): disease exact +34, disease directional +26, gene/mutation +20, stage +10,
treatment line +10, ECOG +6, PD-L1 +6, disease-tag bonus +5, city +3, over a base of +10 (maximum
99). Dedicated parsers normalise gene/mutation strings, stage, ECOG and PD-L1 expressions. A trial
is taken to "match" when it is not excluded and scores at or above the threshold `SCORE_MIN` = 42.

*Stage 2b (criterion-level gate).* The function `evaluateAllCriteria`
(`server/services/criterionMatcher.js`) evaluates each decomposed criterion against the patient
profile and assigns a verdict — met, not met, or exclusion-triggering — combining deterministic
checks with semantic matching. A not-met hard criterion or a triggered exclusion vetoes the trial
irrespective of its additive score; the surfaced result records each criterion's verdict and
evidence string, which the interface renders as the match explanation.

### Gold-standard construction and labelling

The evaluation set (`server/tests/fixtures/golden-matches.json`, version 1.0) is **curated and
semi-synthetic**: it was constructed from de-identified clinical patterns, not sampled from a
prospective cohort, and is deliberately small. It contains 12 patient profiles and 50 patient–trial
pairs spanning six cancer types (NSCLC, SCLC, liver, breast, colorectal, gastric). Each pair carries
a label — eligible (13), ineligible (23) or uncertain (14) — with a free-text rationale (for example,
pair P01×22615 is labelled ineligible because the trial requires a HER2 tyrosine-kinase-domain
activating mutation whereas the patient carries an EGFR L858R mutation). Labels were assigned from
the documented eligibility logic of each trial.

### Evaluation protocol and metrics

Both engines were evaluated with the standalone scripts `server/scripts/evalMatchEngine.js` and
`server/scripts/evalCriterionMatcher.js`, which load the gold set and the corpus criteria files and
require no database. For binary classification, eligible pairs are positives and ineligible pairs are
negatives; *uncertain* pairs are excluded from precision/recall and tracked separately (the fraction
falling in a moderate score band is reported as a calibration proxy). The decision rule is identical
for both engines: predict "match" when the engine does not exclude the trial and the score is at or
above 42. We report precision, recall, F1 and accuracy. For ranking, we compute mean nDCG@10 per
patient using graded relevance (eligible = 2, uncertain = 1, ineligible = 0); because the criterion-
level gate is a classifier rather than a ranker, nDCG is reported for the weighted scorer only. All
values in this manuscript and in every figure are read from a single committed snapshot of these runs
(`paper/figures/data/metrics.json`), whose provenance block records the exact command for each number.

### Provider benchmark protocol

Three providers (Doubao `doubao-seed-1-6-vision`, Kimi `moonshot-v1-128k-vision`, and a text-only
MiniMax model via a coding-plan key) were run on six de-identified records (gene-panel reports and
record images) on 2026-05-01. For each document we recorded success/failure, end-to-end latency,
prompt/completion token counts, and cost computed from each provider's published per-token pricing
(CNY per 1M tokens: Doubao 0.86/8.28, Kimi 6.84/28.80, MiniMax 1.20/6.00). Faithfulness was assessed
by checking whether the returned text corresponded to the document's actual clinical content; the
text-only MiniMax model failed this check by fabricating content unrelated to the image. All PDFs fell
back to the vision path in this run, so reported costs are a vision-path upper bound. The full
per-document table is given in Supplementary Table S1 and in `docs/bench-vision-llm-2026-05-01.md`.

### Privacy and security engineering

PII de-identification is implemented in `server/utils/piiScrubber.js`. `scrubForLlm` replaces phone
numbers, 18-digit national ID numbers, 16–19-digit bank-card numbers, e-mail addresses, label-anchored
names and structured addresses with stable typed placeholders (`<TYPE_N>`); identical values reuse one
placeholder within a call, and the placeholder→value mapping is held only in memory and never logged or
persisted. `restoreFromLlm` walks the schema-validated LLM output and re-inserts original values into
human-readable fields. A separate `scrubForLog` performs irreversible masking for logs and error
monitoring (phone numbers keep their last four digits; other identifiers are redacted) and retains no
mapping. CSV exports use `server/utils/csvSafe.js`, which prefixes a single quote to any cell beginning
with a formula trigger (`= + - @ \t \r`) to prevent spreadsheet formula injection (CWE-1236) in addition
to standard quoting. Administrative and CRO endpoints are protected by role-based access control
(`server/middleware/adminAuth.js`, returning 401 when unauthenticated and 403 when the role is not
permitted) and an audit-log middleware (`server/middleware/auditLog.js`) that records actor, action and
target. We do not implement, and do not claim, an explicit prompt-injection fence.

### Observability and deployment

A single Prometheus registry (`server/middleware/metrics.js`, metric prefix `treatbot_`) exports default
process metrics plus an HTTP-request-duration histogram (labelled by method/route/status), an OCR-queue
gauge (waiting/active/failed/completed), a match-score summary, and an LLM-call-duration histogram
(labelled by provider/model/operation/status); a heartbeat job refreshes queue gauges. The service is a
Node.js/Express application with a Sequelize/MySQL data layer, Redis/Bull job queue, schema migrations
(`server/scripts/migrate.js`), and is deployed as a web/H5 site and a WeChat mini-program.

### Ethics and data statement

All records used in development and benchmarking were de-identified, and the gold-standard evaluation
set is curated/semi-synthetic, constructed from de-identified clinical patterns rather than from
identifiable patients; it contains no real patient identifiers and is not a prospective cohort. No
real-world patient outcomes, enrolment results or user-study data are reported in this manuscript. PII
present in operational documents is de-identified before any model call as described above.

---

## Data availability

The curated, semi-synthetic gold-standard evaluation set
(`server/tests/fixtures/golden-matches.json`), the trial-criteria representations
(`server/data/structured_inclusion.json`, `server/data/decomposed_criteria.json`), the committed OCR
benchmark (`docs/bench-vision-llm-2026-05-01.md`) and the figure-data snapshot
(`paper/figures/data/metrics.json`, with raw eval outputs in `paper/figures/data/*.txt`) are available
in the project repository. Raw patient-uploaded records are not shared, to protect patient privacy.

## Code availability

The evaluation and benchmark scripts (`server/scripts/evalMatchEngine.js`,
`server/scripts/evalCriterionMatcher.js`, `server/scripts/benchVisionLlm.js`), the matching engines
(`server/services/matchEngine.js`, `server/services/criterionMatcher.js`), the privacy/security utilities
(`server/utils/piiScrubber.js`, `server/utils/csvSafe.js`) and the figure generators (`paper/figures/*.py`)
are in the project repository. Each figure is reproducible by running its generator against
`paper/figures/data/metrics.json`; see `paper/README.md`.

## Author contributions

[To be completed.]

## Competing interests

[To be completed — Treatbot is a deployed commercial product; declare accordingly.]

## Acknowledgements

[To be completed.]

---

## Figure legends

**Fig. 1 | An end-to-end system for trial matching from real-world records.** Five-stage pipeline:
(1) patient upload of record images/PDFs; (2) vision-language OCR via a provider chain (Doubao, with
Kimi fallback); (3) schema-constrained structured extraction (LLM + Zod validation, SSE-streamed
fields); (4) two-stage matching against 496 recruiting trials (SQL coarse filter, then weighted score
plus criterion gate); (5) a ranked shortlist with plain-language reasons. System-wide properties
(privacy-by-design, streaming UX, corpus scale, deployment surfaces) hold across stages. Schematic; the
corpus count is read from the committed metrics snapshot.

**Fig. 2 | Multi-provider document extraction: cost, latency and faithfulness.** Real benchmark of six
de-identified records (2026-05-01). (a) Total cost over the set per provider; (b) mean per-document
latency; (c) capability/faithfulness matrix (Doubao and Kimi are vision-capable and succeed on 6/6;
Kimi shows a truncation risk on long records; the text-only MiniMax model is unusable and fabricates
content); (d) published token pricing; (e) per-document cost, Doubao vs Kimi. Costs are a vision-path
upper bound. Data: `paper/figures/data/metrics.json`.

**Fig. 3 | Explainable two-stage matching.** (a) Funnel from the 496-trial corpus through the SQL coarse
filter to candidate trials and a ranked shortlist with reasons. (b) Real scoring-dimension weights
(points; maximum 99, match threshold 42). (c) An illustrative explained decision in which a high additive
score nonetheless can be vetoed by an unmet hard criterion; weights as in (b). Panels (a, c) are
schematic; panel (b) is read from the metrics snapshot.

**Fig. 4 | Criterion-level matching eliminates false positives.** Evaluation on the curated,
semi-synthetic gold set (12 patients; 50 pairs; 13 eligible / 23 ineligible / 14 uncertain). (a)
Precision, recall, F1 and accuracy for the weighted scorer versus the criterion-level matcher; the
scorer reaches perfect recall but only 52% precision. (b, c) Confusion matrices: the scorer produces 12
false positives among 23 ineligible pairs (b), all removed by the criterion gate (c). (d) Ranking quality
(nDCG@10) for the scorer; the gate is a classifier and does not rank. (e) Worked example: trial 22615
requires a HER2 activating mutation, and the scorer wrongly matched four non-HER2 patients (scores 53–78),
which the criterion gate excludes. Data: `paper/figures/data/metrics.json`.

**Fig. 5 | Privacy- and observability-by-design.** (a) Two de-identification policies chosen by
destination: a reversible in-memory placeholder scheme on the path to any LLM (`scrubForLlm` →
`restoreFromLlm`) versus an irreversible one-way mask on the path to logs (`scrubForLog`). (b)
Defense-in-depth controls, each a verified module (Zod schema validation, CSV formula-injection escape
[CWE-1236], RBAC + audit logging, versioned prompts with multi-provider fallback, PII scrub before any
LLM call). (c) Observability: a Prometheus registry (`treatbot_*`) exporting request latency, OCR-queue
depth, a match-score summary and per-provider LLM-call latency. Schematic depicting implemented modules.

---

## Tables

**Table 1 | Deployment and corpus snapshot.**

| Item | Value |
|---|---|
| Trial corpus (actively recruiting) | 496 |
| Cancer types in gold set | NSCLC, SCLC, liver, breast, colorectal, gastric (6) |
| Client surfaces | Web/H5; WeChat mini-program |
| Backend | Node.js/Express; Sequelize/MySQL; Redis/Bull queue |
| OCR | Vision-language provider chain (Doubao; Kimi fallback) |
| Extraction validation | Zod schema; versioned prompt registry (v1) |
| Observability | Prometheus registry (`treatbot_*`) |

**Table 2 | Weighted scoring dimensions (`matchEngine.scoreRecordAgainstTrial`).**

| Dimension | Weight (points) |
|---|---|
| Disease — exact | 34 |
| Disease — directional | 26 |
| Gene / mutation | 20 |
| Stage | 10 |
| Treatment line | 10 |
| Base | 10 |
| ECOG | 6 |
| PD-L1 | 6 |
| Disease-tag bonus | 5 |
| City | 3 |
| **Maximum attainable** | **99** |
| Match threshold (`SCORE_MIN`) | 42 |

---

## References

Citations use pandoc `[@key]` syntax keyed to `paper/references.bib`; run
`pandoc --citeproc --bibliography=paper/references.bib` to render the final numbered list. Entries marked
`VERIFY` in the `.bib` require a final metadata check before submission. Key references include TrialGPT
[@trialgpt], eligibility-extraction and LLM-matching work [@datta2024autocriteria; @yuan2023augmentation;
@wong2023oncology; @nievas2024distilling], earlier patient–trial matchers [@zhang2020deepenroll;
@gao2020compose; @yuan2019criteria2query; @koopman2016testcollection; @stubbs2019n2c2], recruitment-
bottleneck evidence [@kadam2016recruitment; @bennette2016accrual; @woo2019aiboost; @hutson2024accelerate],
clinical-LLM and reasoning background [@singhal2023clinicalknowledge; @tian2024chatgpt; @wei2022cot;
@vaswani2017attention; @openai2023gpt4; @jin2023medcpt; @devlin2019bert], PHI de-identification
[@uzuner2007deid; @dernoncourt2017deid; @liu2023deidgpt], OCR and Chinese clinical NLP [@smith2007tesseract;
@zhang2018lattice], and LLM-security context [@greshake2023indirect; @perez2022ignore; @owasp2023llmtop10].
