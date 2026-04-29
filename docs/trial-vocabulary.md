# Trial Vocabulary —— 泛瘤种 / 免基因入组口径词典

> 维护归口：`server/services/matchEngine.js` 中的 `GENERIC_CANCER_ALIASES` 与 `GENE_AGNOSTIC_HINTS`。
> 本文件仅做「词条 → 来源 / 语义」映射，便于后续维护者增删时有据可查。
>
> 最新更新：PRD-2026Q2 §3.1「泛瘤种匹配完善」。

## 1. 设计原则

1. **保守优先**：只收录*明确表达* "多瘤种 / 全实体瘤 / 生物标志物驱动泛瘤种" 的口径；
   绝不把 `NSCLC` / `乳腺癌` 这种收窄到单瘤种的词纳入（会把特定癌种试验错判为 generic）。
2. **大小写不敏感**：所有匹配经 `normalizeText` 归一（去空白/连字符/标点），大小写无需重复列举。
3. **多源聚合**：`hasGenericCancerSignal(trial)` 聚合 `inclusion_criteria` /
   `structured_inclusion`（JSON stringify） / `disease_tags` 三路文本，任一命中即判定为泛瘤种。
4. **中英变体并列**：同一概念的中英 / 简繁变体并列列出，减少漏判。

## 2. GENERIC_CANCER_ALIASES（泛实体瘤信号）

| 词条 | 类别 | 来源 / 语义 |
| --- | --- | --- |
| 实体瘤 / 实体性肿瘤 / 实体肿瘤 | 中文基础 | §2.4 既有，NMPA 常见表述 |
| 恶性肿瘤 | 中文基础 | §2.4 既有，较宽口径 |
| 晚期实体瘤 / 进展期实体瘤 | 中文分期修饰 | §2.4 既有 |
| **泛实体瘤 / 泛實體瘤** | 中文简繁变体 | §3.1 新增；国内 CDE 公告 / 临床文献常见 |
| **转移性实体瘤** | 中文 | §3.1 新增；对应 "metastatic solid tumor" |
| **多瘤种 / 多种实体瘤** | 中文 | §3.1 新增；NMPA 多癌种篮子试验常见 |
| **全部实体瘤 / 任何实体瘤** | 中文 | §3.1 新增；补充 `%全部实体瘤%` JSON_SEARCH 既有模式 |
| **solid tumor / solid tumors / solid tumour / solid tumours** | 英文基础 | §3.1 新增；ClinicalTrials.gov 标准表述 |
| **advanced solid tumor(s)** | 英文修饰 | §3.1 新增；NCT 入组标题高频词 |
| **metastatic solid tumor(s)** | 英文修饰 | §3.1 新增；同上 |
| **all solid tumors / any solid tumor(s)** | 英文泛口径 | §3.1 新增；basket trial 常见 |
| **advanced malignancies / advanced malignancy** | 英文 | §3.1 新增；Phase I 剂量爬坡常用表述 |
| **msi-h / msih / dmmr / mmr deficient / mismatch repair deficient** | 生物标志物 | §3.1 新增；FDA pembrolizumab 2017 pan-tumor 批准来源；国内同类试验遵循该生物标志物 |
| **tmb-h / tmbh / tmb high / high tumor mutational burden** | 生物标志物 | §3.1 新增；FDA 2020 pembrolizumab TMB ≥10 mut/Mb 泛瘤种批准 |
| **pd-l1 positive / pd-l1 高表达 / pd-l1≥1% / pd-l1 ≥ 1%** | 生物标志物 | §3.1 新增；多个泛瘤种 IO 试验沿用该阈值 |

### 已主动排除的词（避免假阳性）

| 词条 | 不收录原因 |
| --- | --- |
| `NSCLC` / `lung cancer` / `肺癌` | 具体癌种，收录会让所有肺癌试验被误判为泛瘤种 |
| `cancer` / `癌症` / `tumor` | 过于宽泛，基本每条试验都会命中 |
| `advanced cancer` | 容易误击中 NSCLC / GI 等具体癌种的 "advanced 非小细胞肺癌" 文本 |
| `ICD-10` 编码 | 按 PRD-2026Q2 §3.1「不引入 ICD-10 映射」延到 P2 |

## 3. GENE_AGNOSTIC_HINTS（免基因检测入组信号）

| 词条 | 来源 / 语义 |
| --- | --- |
| 不限基因 / 不限制基因 / 不限突变 | 既有；中文入组条款常见 |
| 无需基因检测 / 无需基因检查 | 既有 |
| 不要求基因 / 不要求检测 | 既有 |
| 基因检测非必需 / 基因非必需 | 既有 |
| any mutation / regardless of mutation / biomarker-agnostic | 既有；英文 NCT 常见 |
| **advanced solid tumor(s) / metastatic solid tumor(s) / solid tumors / all solid tumors / any solid tumor** | §3.1 新增；泛实体瘤默认不强制单一基因 |
| **泛实体瘤 / 泛實體瘤 / 晚期实体瘤 / 转移性实体瘤 / 多瘤种** | §3.1 新增；中文对应 |
| **pd-l1 高表达 / pd-l1 positive / pd-l1≥1% / pd-l1 ≥ 1%** | §3.1 新增；PD-L1 表达驱动而非单基因突变 |
| **msi-h / dmmr / tmb-h / tmb high** | §3.1 新增；生物标志物驱动泛瘤种，不要求特定基因突变 |

## 4. 维护约定

- 新增词条时：**先加 snapshot test**（见 `server/tests/matchEngineAgnostic.test.js`），再补本表。
- 删除 / 改动既有词条时：跑全量 `cd server && npm test`，确认 17 suites / 145+ tests 全绿。
- 同义词收录边界：若一个词在真实 trial 语料里出现 < 3 次，先不收；避免过拟合样本。
- ICD-10 / SNOMED 映射不在本文件范围，延后到 P2 阶段另建 `docs/disease-ontology.md`。
