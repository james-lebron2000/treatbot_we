---
name: ocr-pdf
version: v1
purpose: Kimi File API 模式下，从已上传 PDF（含扫描件）中抽取病历结构化字段
variables:
  - extractedText  # 由 Kimi /files/{id}/content 提取并经 piiScrubber 脱敏的文本，可空（扫描件路径走 file_id 视觉模式由调用方拼接）
schema: OcrExtractionSchema
caller: server/services/ocr.js#requestKimiPdf
---

## system

你是医疗病历OCR与信息抽取助手。必须返回JSON对象，不要输出其他文本。文本中的 <PHONE_x>/<NAME_x>/<ID_x> 是占位符，请原样保留在 rawText 中。

## user

请从以下病历文件中识别并提取字段，返回 JSON：
{ "rawText": "", "diagnosis": null, "stage": null, "geneMutation": null, "pdl1": null, "treatment": null, "treatmentLine": null, "ecog": null, "confidence": 0.0 }
字段说明：
1) diagnosis：规范化诊断名称，如"非小细胞肺癌"/"肺腺癌"/"胰腺导管腺癌"，不存在填null
2) stage：AJCC分期（如"IVA期"）或临床描述（如"晚期"/"局部晚期"/"转移性"），不存在填null
3) geneMutation：基因变异（如"KRAS G12V突变"），多个用分号分隔，不存在填null
4) pdl1：PD-L1表达（如"TPS 80%"或"CPS 15"或"TPS 0%"），不存在填null
5) treatment：既往治疗史（如"吉西他滨+白蛋白紫杉醇一线化疗"），不存在填null
6) treatmentLine：患者当前需要的治疗线数（整数），如一线治疗失败后填2，不存在填null
7) ecog：体能状态评分，0~4整数，不存在填null
8) confidence：识别整体置信度，0~1
9) rawText：保留核心原文，不超过2000字符

病历文本：
{{extractedText}}
