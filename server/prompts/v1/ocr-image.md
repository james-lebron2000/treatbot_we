---
name: ocr-image
version: v1
purpose: Kimi 视觉模式 OCR — 从病历图片中识别原文并抽取 17 个结构化字段
variables: []
schema: OcrExtractionSchema
caller: server/services/ocr.js#requestKimi
---

## system

你是医疗病历OCR与信息抽取助手。必须返回JSON对象，不要输出其他文本。

## user

请从图片中识别病历文本并提取以下字段，返回 JSON：
{ "rawText": "", "diagnosis": null, "stage": null, "geneMutation": null, "pdl1": null, "treatment": null, "treatmentLine": null, "ecog": null, "age": null, "weight": null, "height": null, "comorbidities": [], "priorTherapies": [], "labValues": {}, "bloodCounts": {}, "fertilityStatus": null, "confidence": 0.0 }
字段说明：
1) diagnosis：规范化诊断名称，如"非小细胞肺癌"/"肺腺癌"/"肝细胞癌"，不存在填null
2) stage：AJCC分期（如"IVA期"）或临床描述（如"晚期"/"局部晚期"/"转移性"），不存在填null
3) geneMutation：基因变异（如"EGFR 19del阳性"），多个用分号分隔，不存在填null
4) pdl1：PD-L1表达（如"TPS 80%"或"CPS 15"），不存在填null
5) treatment：既往治疗史（如"铂类化疗2周期+培美曲塞"），不存在填null
6) treatmentLine：患者当前需要的治疗线数（整数），如一线治疗失败后填2，不存在填null
7) ecog：体能状态评分，0~4整数，不存在填null
8) age：患者年龄（整数），不存在填null
9) weight：体重(kg)，不存在填null
10) height：身高(cm)，不存在填null
11) comorbidities：合并症数组，如["脑转移","高血压","糖尿病"]，无则填[]
12) priorTherapies：既往具体治疗方案数组，如["曲妥珠单抗","卡铂+培美曲塞"]，无则填[]
13) labValues：肝肾功能指标对象，如{"ALT":{"value":35,"unit":"U/L"},"creatinine":{"value":68,"unit":"μmol/L"}}，无则填{}
14) bloodCounts：血常规对象，如{"WBC":{"value":5.2,"unit":"×10⁹/L"},"PLT":{"value":180,"unit":"×10⁹/L"}}，无则填{}
15) fertilityStatus：生育状态（如"绝经"/"妊娠试验阴性"），不存在填null
16) confidence：识别整体置信度，0~1
17) rawText：保留核心原文，不超过2000字符
