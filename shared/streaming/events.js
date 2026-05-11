// 单一事实源：OCR 流式事件类型与阶段-progress 映射。
// 后端 publishRecordEvent / 前端 parseStream / 小程序 sseClient 共用。
// CommonJS（与其他 shared/*.js 一致），Web 端 Vite 走 CJS interop。

const STAGE = Object.freeze({
  RECEIVED: 'received',         // 进入 worker，已 ack 上传
  PREPROCESS: 'preprocess',     // markitdown / pdftoppm / 文件准备
  OCR_TEXT: 'ocr_text',         // 拿到 raw OCR 文本（可能含多页拼接）
  FIELD_GROUP: 'field_group',   // 结构化分组完成（一次一组）
  COMPLETED: 'completed',       // 全部入库
  ERROR: 'error',               // 任意阶段抛错的终态
  HEARTBEAT: 'heartbeat'        // 内部心跳，前端忽略
})

// 阶段对应的"基线 progress"——保证 UI 不倒退。
// FIELD_GROUP 不放这里，因为不同分组的 progress 不同。
const STAGE_PROGRESS = Object.freeze({
  [STAGE.RECEIVED]: 5,
  [STAGE.PREPROCESS]: 15,
  [STAGE.OCR_TEXT]: 40,
  [STAGE.COMPLETED]: 100
})

// 标准事件结构：
//   { recordId, stage, progress, ts, ...payload }
// stage=field_group 时 payload 包含 { fieldGroup, fields }
// stage=ocr_text 时 payload 包含 { rawText }
// stage=completed 时 payload 包含 { result }
// stage=error 时 payload 包含 { errorMsg }
const composeEvent = (recordId, stage, payload = {}) => {
  const baseProgress = STAGE_PROGRESS[stage]
  return {
    recordId,
    stage,
    progress: typeof payload.progress === 'number'
      ? payload.progress
      : (typeof baseProgress === 'number' ? baseProgress : null),
    ts: Date.now(),
    ...payload
  }
}

// 终态：客户端可断开连接、停止订阅。
const isTerminalStage = (stage) => stage === STAGE.COMPLETED || stage === STAGE.ERROR

module.exports = {
  STAGE,
  STAGE_PROGRESS,
  composeEvent,
  isTerminalStage
}
