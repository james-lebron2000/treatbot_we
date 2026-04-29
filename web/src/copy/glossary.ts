// Re-export of shared/copy/glossary.json for web consumers.
// Source of truth lives in shared/copy/glossary.json so it can be reused by
// 小程序 / web / docs.  Keep this file as a thin re-export only.
//
// PRD-2026Q3 §U2：FieldExplainer 通过 `fields[key]` 读 plain / example /
// whyAsk / iDontKnow 文案；类型在这里收拢，避免组件里到处 cast。
import glossary from '../../../shared/copy/glossary.json'

export interface GlossaryFieldEntry {
  label: string
  plain: string
  example: string
  whyAsk: string
  iDontKnow: string
}

export interface GlossaryFile {
  fields: Record<string, GlossaryFieldEntry>
  matchReasons: Record<string, string>
  errors: Record<string, string>
}

const typed = glossary as unknown as GlossaryFile

export default typed

export const matchReasons = typed.matchReasons
export const fields = typed.fields
export const errors = typed.errors
