/**
 * Q3-红线 §A.1.2：LLM 结构化输出 Schema 定义。
 *
 * 设计原则：
 *  - 所有 LLM 入站 payload 必须通过这里的 schema 校验后再进入业务逻辑；
 *    校验失败 → 触发 llmClient 的「换温度重试 → 换 provider → 走规则兜底」三段式降级。
 *  - 关键字段 strict（类型/范围/枚举），其它字段 passthrough：
 *      - 模型可能新增的辅助字段（如 explanations、warnings）不会阻塞主流程；
 *      - 但显式声明的字段类型不允许漂移（防止 stage 变成 number 等）。
 *  - 不直接断言整体 strict——LLM 偶尔会冒泡 reasoning/raw_text 等多余字段，要兼容。
 */

const { z } = require('zod');

// 通用 helper：把 ""/0 视作合法 0；null / undefined 都允许；非数字字符串拒绝。
const optionalNumber = z.union([z.number(), z.null()]).optional();
const optionalString = z.union([z.string(), z.null()]).optional();
const optionalStringArray = z.array(z.string()).optional().default([]);

const LabValueSchema = z.object({
  value: z.number(),
  unit: z.string().optional()
}).passthrough();

const LabValueDictSchema = z.record(z.string(), LabValueSchema).optional().default({});

// ---- 灯塔癌症导航报告 12 节富字段 schema 片段（与 demo 富化保持一致）----
const GeneVariantSchema = z.object({
  gene: z.string(),
  variant: optionalString,
  impact: optionalString
}).passthrough();

const SurgicalHistoryItemSchema = z.object({
  name: z.string(),
  date: optionalString
}).passthrough();

const TimelineEventSchema = z.object({
  date: z.string(),
  event: z.string(),
  type: optionalString
}).passthrough();

const ImagingItemSchema = z.object({
  date: optionalString,
  modality: optionalString,
  findings: optionalString
}).passthrough();

const TumorMarkerItemSchema = z.object({
  name: z.string(),
  value: z.union([z.number(), z.string()]).optional(),
  unit: optionalString,
  flag: optionalString
}).passthrough();

const TreatmentHistoryItemSchema = z.object({
  name: z.string(),
  startDate: optionalString,
  endDate: optionalString,
  response: optionalString
}).passthrough();

const TmbValueSchema = z.union([
  z.string(),
  z.null(),
  z.object({}).passthrough()
]).optional();

const BiomarkersSchema = z.object({
  tmb: TmbValueSchema,
  msi: optionalString,
  mmr: optionalString,
  pdl1: optionalString,
  her2: optionalString,
  claudin182: optionalString,
  hla: optionalString
}).passthrough().optional();

const MolecularSchema = z.object({
  drivers: z.array(GeneVariantSchema).optional().default([]),
  actionable: z.array(GeneVariantSchema).optional().default([]),
  lossOfFunction: z.array(GeneVariantSchema).optional().default([]),
  vus: z.array(GeneVariantSchema).optional().default([]),
  biomarkers: BiomarkersSchema,
  drugMetabolism: z.array(GeneVariantSchema).optional().default([])
}).passthrough().optional();

const OrganoidDrugSensitivitySchema = z.object({
  sensitive: z.array(z.string()).optional().default([]),
  resistant: z.array(z.string()).optional().default([])
}).passthrough().optional();

/**
 * OcrExtractionSchema — 与 services/ocr.js 中 parseKimiEntities 的字段集对齐。
 *
 * 基础 17 字段：
 *   rawText / diagnosis / stage / geneMutation / pdl1 / treatment / treatmentLine /
 *   ecog / age / weight / height / comorbidities / priorTherapies / labValues /
 *   bloodCounts / fertilityStatus / confidence
 *
 * 富化字段（PRD-2026Q2 灯塔癌症导航报告 12 节）：
 *   tnmStage / pathologyType / sex / hospital / diagnosisDate / metastasisSites /
 *   surgicalHistory / timeline / molecular / organoidDrugSensitivity / imaging /
 *   tumorMarkers / treatmentHistory
 */
const OcrExtractionSchema = z.object({
  rawText: optionalString,
  diagnosis: optionalString,
  stage: optionalString,
  geneMutation: optionalString,
  pdl1: optionalString,
  treatment: optionalString,
  treatmentLine: optionalNumber,
  ecog: optionalNumber,
  age: optionalNumber,
  weight: optionalNumber,
  height: optionalNumber,
  comorbidities: optionalStringArray,
  priorTherapies: optionalStringArray,
  labValues: LabValueDictSchema,
  bloodCounts: LabValueDictSchema,
  fertilityStatus: optionalString,
  confidence: z.number().optional(),
  // ---- 富化字段（demo 12 节口径）----
  tnmStage: optionalString,
  pathologyType: optionalString,
  sex: optionalString,
  hospital: optionalString,
  diagnosisDate: optionalString,
  metastasisSites: z.array(z.string()).optional().default([]),
  surgicalHistory: z.array(SurgicalHistoryItemSchema).optional().default([]),
  timeline: z.array(TimelineEventSchema).optional().default([]),
  molecular: MolecularSchema,
  organoidDrugSensitivity: OrganoidDrugSensitivitySchema,
  imaging: z.array(ImagingItemSchema).optional().default([]),
  tumorMarkers: z.array(TumorMarkerItemSchema).optional().default([]),
  treatmentHistory: z.array(TreatmentHistoryItemSchema).optional().default([])
}).passthrough();

/**
 * PatientProfileSchema — 与 services/patientProfile.js emptyProfile() 对齐。
 * 当前没有 LLM 直接产出 patientProfile，但作为下游消费侧的 type guard 提供。
 */
const PatientProfileSchema = z.object({
  diagnosis: optionalString,
  stage: optionalString,
  ecog: optionalNumber,
  age: optionalNumber,
  pdl1: optionalString,
  treatmentLine: optionalNumber,
  treatment: optionalString,
  geneMutations: optionalStringArray,
  geneMutationText: optionalString,
  weight: optionalNumber,
  height: optionalNumber,
  comorbidities: optionalStringArray,
  priorTherapies: optionalStringArray,
  labValues: LabValueDictSchema,
  bloodCounts: LabValueDictSchema,
  fertilityStatus: optionalString,
  city: optionalString,
  // ---- 富化字段：mirrors OcrExtractionSchema ----
  tnmStage: optionalString,
  pathologyType: optionalString,
  sex: optionalString,
  hospital: optionalString,
  diagnosisDate: optionalString,
  metastasisSites: z.array(z.string()).optional().default([]),
  surgicalHistory: z.array(SurgicalHistoryItemSchema).optional().default([]),
  timeline: z.array(TimelineEventSchema).optional().default([]),
  molecular: MolecularSchema,
  organoidDrugSensitivity: OrganoidDrugSensitivitySchema,
  imaging: z.array(ImagingItemSchema).optional().default([]),
  tumorMarkers: z.array(TumorMarkerItemSchema).optional().default([]),
  treatmentHistory: z.array(TreatmentHistoryItemSchema).optional().default([])
}).passthrough();

/**
 * MatchScoreItemSchema — 与 services/matchEngine.js 输出条目对齐。
 * 为后续把 matchEngine 的 LLM 评分迁到 llmClient 留位。
 */
const MatchScoreItemSchema = z.object({
  trialId: z.union([z.string(), z.number()]),
  score: z.number().min(0).max(1),
  reasons: z.array(z.string()).optional().default([]),
  exclusions: z.array(z.string()).optional().default([]),
  confidence: z.number().min(0).max(1).optional()
}).passthrough();

module.exports = {
  OcrExtractionSchema,
  PatientProfileSchema,
  MatchScoreItemSchema,
  // exposed for unit tests
  __internals: {
    LabValueSchema,
    GeneVariantSchema,
    MolecularSchema,
    BiomarkersSchema,
    OrganoidDrugSensitivitySchema
  }
};
