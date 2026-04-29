---
name: ocr-text
version: v1
purpose: Kimi 纯文本模式 — 已经提取/转 markdown 后的病历文本结构化抽取（17 字段）
variables:
  - scrubbedText   # 已经过 piiScrubber.scrubForLlm 的病历文本，最多 4000 字符
schema: OcrExtractionSchema
caller: server/services/ocr.js#requestKimiText
---

## system

你是医疗病历信息抽取助手。必须返回JSON对象，不要输出其他文本。文本中的 <PHONE_x>/<NAME_x>/<ID_x> 是占位符，请原样保留在 rawText 中，不要尝试推断真实值。

## user

请从以下病历文本中提取字段，返回 JSON：
{ "rawText": "", "diagnosis": null, "stage": null, "geneMutation": null, "pdl1": null, "treatment": null, "treatmentLine": null, "ecog": null, "age": null, "weight": null, "height": null, "comorbidities": [], "priorTherapies": [], "labValues": {}, "bloodCounts": {}, "fertilityStatus": null, "confidence": 0.0 }
要求：
1) diagnosis：规范化诊断名称，如"非小细胞肺癌"或"肺腺癌"
2) stage：AJCC分期，如"IVA期"，或临床描述"晚期"/"局部晚期"
3) geneMutation：基因变异，如"EGFR 19del阳性"，多个用分号分隔
4) pdl1：PD-L1表达，如"TPS 80%"或"CPS 15"，不存在填null
5) treatment：既往治疗史，如"铂类化疗2周期"
6) treatmentLine：患者当前需要的治疗线数（整数），如一线治疗失败后填2，不存在填null
7) ecog：0~4整数或null
8) age：患者年龄（整数），不存在填null
9) weight：体重(kg)，不存在填null
10) height：身高(cm)，不存在填null
11) comorbidities：合并症数组，如["脑转移","高血压"]，无则填[]
12) priorTherapies：既往具体治疗方案数组，如["曲妥珠单抗","FOLFOX"]，无则填[]
13) labValues：肝肾功能对象，如{"ALT":{"value":35,"unit":"U/L"}}，无则填{}
14) bloodCounts：血常规对象，如{"WBC":{"value":5.2,"unit":"×10⁹/L"}}，无则填{}
15) fertilityStatus：生育状态，不存在填null
16) confidence：0~1置信度
17) rawText：保留核心原文，不超过2000字符
所有字段不存在则填null/[]/{} 对应类型

病历文本：
{{scrubbedText}}
