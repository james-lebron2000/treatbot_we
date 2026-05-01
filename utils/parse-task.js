const api = require('./api')
const cache = require('./cache')
const schema = require('./schema')

const ACTIVE_PARSE_TASK_KEY = 'activeParseTask'
const RECENT_COMPLETED_RECORD_KEY = 'recentCompletedRecordId'
const MATCH_CACHE_TTL = 30 * 60 * 1000
const PARSE_RESULT_CACHE_TTL = 30 * 60 * 1000
// Phase E.2：批量上传时的额外 key —— 跟踪所有 fileIds + 已完成的 entities 合并结果
const ACTIVE_PARSE_BATCH_KEY = 'activeParseBatch'

// 修复方案 Track 3.4 / 3.5：兼容服务端可能微调的 status 取值。
// 当前 server/controllers/medical.js mapParseStatus 只回 'completed' / 'error' / 'parsing' / 'analyzing'，
// 但任何后端改成 'parsed' / 'success' / 'failed' / 'timeout' 都会让客户端断链。
// 在此一处放宽，后续不会再出现「服务端改了一个字客户端就转圈不动」的事故。
const COMPLETED_STATUSES = ['completed', 'parsed', 'success', 'done']
const ERROR_STATUSES = ['error', 'failed', 'timeout']

const pickPayload = (res) => {
  if (!res || typeof res !== 'object') {
    return {}
  }
  return api.normalizePayload(res) || {}
}

const pickList = (res) => {
  const payload = api.normalizePayload(res)
  if (!payload) {
    return []
  }
  if (Array.isArray(payload)) {
    return payload
  }
  return payload.list || payload.items || payload.trials || payload.matches || payload.data || payload.results || []
}

const getMatchCacheKey = (recordId) => `matchCache:v2:${recordId}`
const getParseResultCacheKey = (recordId) => `parseResult:${recordId}`

const clearKeysByPrefix = (prefix) => {
  if (!wx.getStorageInfoSync) {
    return
  }

  let info = null
  try {
    info = wx.getStorageInfoSync()
  } catch (error) {
    return
  }

  const keys = Array.isArray(info && info.keys) ? info.keys : []
  keys.forEach((key) => {
    if (key.indexOf(prefix) === 0) {
      wx.removeStorageSync(key)
    }
  })
}

const getActiveParseTask = () => {
  const task = wx.getStorageSync(ACTIVE_PARSE_TASK_KEY)
  if (!task || typeof task !== 'object' || !task.fileId) {
    return null
  }
  return task
}

const setActiveParseTask = (task) => {
  if (!task || !task.fileId) {
    return null
  }

  const merged = {
    ...(getActiveParseTask() || {}),
    ...task,
    updatedAt: Date.now()
  }

  wx.setStorageSync(ACTIVE_PARSE_TASK_KEY, merged)
  return merged
}

const clearActiveParseTask = () => {
  wx.removeStorageSync(ACTIVE_PARSE_TASK_KEY)
}

const getCachedMatches = (recordId) => {
  if (!recordId) {
    return null
  }
  return cache.getCache(getMatchCacheKey(recordId))
}

const setCachedMatches = (recordId, payload) => {
  if (!recordId) {
    return
  }
  cache.setCache(
    getMatchCacheKey(recordId),
    {
      ...(payload || {}),
      cachedAt: Date.now()
    },
    MATCH_CACHE_TTL
  )
}

const clearCachedMatches = (recordId) => {
  if (recordId) {
    cache.removeCache(getMatchCacheKey(recordId))
    return
  }
  clearKeysByPrefix('matchCache:v2:')
}

const getCachedParseResult = (recordId) => {
  if (!recordId) {
    return null
  }
  return cache.getCache(getParseResultCacheKey(recordId))
}

const setCachedParseResult = (recordId, result) => {
  if (!recordId || !result) {
    return
  }
  cache.setCache(getParseResultCacheKey(recordId), result, PARSE_RESULT_CACHE_TTL)
}

const clearCachedParseResults = (recordId) => {
  if (recordId) {
    cache.removeCache(getParseResultCacheKey(recordId))
    return
  }
  clearKeysByPrefix('parseResult:')
}

const preloadMatchesForRecord = async (recordId) => {
  if (!recordId) {
    return null
  }

  const res = await api.getMatches({ recordId })
  const items = pickList(res)
  const payload = {
    list: items,
    fallback: !!(res && res.fallback),
    message: (res && res.message) || ''
  }
  setCachedMatches(recordId, payload)
  return payload
}

const syncActiveParseTask = async () => {
  const task = getActiveParseTask()
  if (!task || !task.fileId) {
    return null
  }

  const res = await api.getParseStatus(task.fileId)
  const payload = pickPayload(res)
  const status = payload.status || task.status || 'parsing'
  const recordId = payload.recordId || payload.fileId || task.recordId || task.fileId || ''
  const progress = Number(payload.progress || task.progress || 0)
  const nextTask = setActiveParseTask({
    ...task,
    fileId: task.fileId,
    recordId,
    status,
    progress,
    responseMessage: payload.message || task.responseMessage || ''
  })

  if (COMPLETED_STATUSES.includes(status)) {
    const result = schema.normalizeStructuredRecord(payload.result || payload.record || payload)
    const resolvedRecordId = recordId || result.id || result.recordId || task.fileId
    setCachedParseResult(resolvedRecordId, result)
    wx.setStorageSync('currentRecordId', resolvedRecordId)
    wx.setStorageSync('structuredRecordDraft', result)
    wx.setStorageSync(RECENT_COMPLETED_RECORD_KEY, resolvedRecordId)

    let matchPayload = null
    try {
      matchPayload = await preloadMatchesForRecord(resolvedRecordId)
    } catch (error) {
      console.warn('预取匹配结果失败:', error)
    }

    clearActiveParseTask()
    return {
      task: {
        ...nextTask,
        recordId: resolvedRecordId,
        status: 'completed',
        progress: 100
      },
      response: res,
      payload,
      result,
      matchPayload
    }
  }

  if (ERROR_STATUSES.includes(status)) {
    clearActiveParseTask()
    return {
      task: {
        ...nextTask,
        status
      },
      response: res,
      payload,
      failed: true
    }
  }

  return {
    task: nextTask,
    response: res,
    payload
  }
}

// ====================================================================
// Phase E.2 — 批量上传支持
// ====================================================================
// 小程序的 wx.uploadFile 一次只能传单文件，所以批量场景下我们仍然在循环里
// 调 /api/medical/upload，但把所有返回的 fileId 收齐，然后用一次
// /api/medical/parse-status-batch 拿全部状态。
// 设计目标：
//   1) 与单文件 path 共存。setActiveParseTask 存的是当前关注的"主"文件（兼容老页面），
//      setActiveParseBatch 额外维护一份 fileIds + 累积结果。
//   2) 全部进入终态（completed | error | not_found）后，syncActiveParseBatch 自动清掉
//      activeParseBatch，并把最后一份完成的 record 写到 currentRecordId / structuredRecordDraft，
//      让后续 records/detail / matches 页面无缝衔接（与单文件 path 行为一致）。
//   3) 把已完成 entries 的 entities 合并成一份 mergedEntities，方便上传页 / 匹配页一次拿。

const getActiveParseBatch = () => {
  const batch = wx.getStorageSync(ACTIVE_PARSE_BATCH_KEY)
  if (!batch || typeof batch !== 'object' || !Array.isArray(batch.fileIds) || !batch.fileIds.length) {
    return null
  }
  return batch
}

const setActiveParseBatch = (batch) => {
  if (!batch || !Array.isArray(batch.fileIds) || !batch.fileIds.length) {
    return null
  }
  const existing = getActiveParseBatch() || {}
  const merged = {
    ...existing,
    ...batch,
    fileIds: batch.fileIds,
    updatedAt: Date.now()
  }
  wx.setStorageSync(ACTIVE_PARSE_BATCH_KEY, merged)
  return merged
}

const clearActiveParseBatch = () => {
  wx.removeStorageSync(ACTIVE_PARSE_BATCH_KEY)
}

// 把多份已完成结构化结果合并成一份（首个非空字段优先，treatment 数组拼接去重）
// 设计取舍：matches 引擎按疾病/分期/基因匹配，多份病历共享 patient，所以"合并"语义=
// "拿到字段最全的并集"。如果用户是不同病人的混上传（罕见），这一行会把字段叠在一起，
// 但匹配页本身按 recordId 也能切换，体感不至于崩。
//
// Phase E.6 / Review #9：同时抓取首条 errorMsg + erroredFileIds，让上传页能展示
//   "X 份解析失败" 而不只是"已显示其余结果"。
const mergeStructuredEntities = (entries) => {
  const completed = entries.filter((e) => e && COMPLETED_STATUSES.includes(e.status) && e.result)
  const errored = entries.filter((e) => e && ERROR_STATUSES.includes(e.status))

  if (!completed.length && !errored.length) {
    return null
  }

  const merged = {
    diagnosis: '',
    stage: '',
    geneMutation: '',
    treatment: '',
    confidence: 0,
    sourceRecordIds: [],
    erroredFileIds: errored.map((e) => e.fileId).filter(Boolean),
    firstError: ''
  }
  const treatments = []

  completed.forEach((entry) => {
    const r = entry.result || {}
    if (!merged.diagnosis && r.diagnosis) merged.diagnosis = r.diagnosis
    if (!merged.stage && r.stage) merged.stage = r.stage
    if (!merged.geneMutation && r.geneMutation) merged.geneMutation = r.geneMutation
    if (r.treatment) treatments.push(`${r.treatment}`)
    if (typeof r.confidence === 'number' && r.confidence > merged.confidence) {
      merged.confidence = r.confidence
    }
    if (entry.recordId) merged.sourceRecordIds.push(entry.recordId)
  })

  // treatment 去重 + 合并
  if (treatments.length) {
    const uniq = Array.from(new Set(treatments.map((t) => t.trim()).filter(Boolean)))
    merged.treatment = uniq.join('；')
  }

  // 抓首条失败的 errorMsg（用于上传页 toast / 模态展示）
  for (const e of errored) {
    if (e.errorMsg) {
      merged.firstError = e.errorMsg
      break
    }
  }

  // 全部失败时返回 null（上传页走 handleParseFailure 路径），有任意一份完成就返回合并结果
  if (!completed.length) {
    return null
  }
  return merged
}

const syncActiveParseBatch = async () => {
  const batch = getActiveParseBatch()
  if (!batch || !batch.fileIds.length) {
    return null
  }

  const res = await api.getParseStatusBatch(batch.fileIds)
  const payload = pickPayload(res)
  const entries = Array.isArray(payload.entries) ? payload.entries : []
  const completedCount = Number(payload.completedCount || 0)
  const erroredCount = Number(payload.erroredCount || 0)
  const total = Number(payload.total || batch.fileIds.length)
  const done = !!payload.done

  // 进度展示：(完成 + 失败) / 总数
  const progress = total > 0 ? Math.floor(((completedCount + erroredCount) / total) * 100) : 0

  const completedEntries = entries.filter((e) => COMPLETED_STATUSES.includes(e.status))
  const completedRecordIds = completedEntries.map((e) => e.recordId).filter(Boolean)
  const mergedEntities = mergeStructuredEntities(entries)

  const nextBatch = setActiveParseBatch({
    ...batch,
    entries,
    completedCount,
    erroredCount,
    completedRecordIds,
    mergedEntities,
    progress,
    done
  })

  if (done) {
    // 所有终态 → 把"最后一份完成"的结果写到与单文件 path 共享的 storage key，
    // 让 records/detail、matches 等不感知批量也能读到。
    if (completedEntries.length) {
      const last = completedEntries[completedEntries.length - 1]
      const result = schema.normalizeStructuredRecord(last.result || {})
      const resolvedRecordId = last.recordId || last.fileId
      if (resolvedRecordId) {
        setCachedParseResult(resolvedRecordId, result)
        wx.setStorageSync('currentRecordId', resolvedRecordId)
        wx.setStorageSync('structuredRecordDraft', result)
        wx.setStorageSync(RECENT_COMPLETED_RECORD_KEY, resolvedRecordId)
      }

      // 预取匹配（用任一 completed recordId；matches 引擎按 user_id 聚合所有 records）
      try {
        await preloadMatchesForRecord(resolvedRecordId)
      } catch (error) {
        console.warn('批量上传后预取匹配失败:', error)
      }
    }

    clearActiveParseBatch()
  }

  return {
    batch: nextBatch,
    response: res,
    payload,
    entries,
    completedRecordIds,
    completedCount,
    erroredCount,
    total,
    progress,
    done,
    mergedEntities
  }
}

module.exports = {
  ACTIVE_PARSE_TASK_KEY,
  ACTIVE_PARSE_BATCH_KEY,
  RECENT_COMPLETED_RECORD_KEY,
  getActiveParseTask,
  setActiveParseTask,
  clearActiveParseTask,
  getActiveParseBatch,
  setActiveParseBatch,
  clearActiveParseBatch,
  syncActiveParseBatch,
  mergeStructuredEntities,
  getCachedMatches,
  setCachedMatches,
  clearCachedMatches,
  getCachedParseResult,
  setCachedParseResult,
  clearCachedParseResults,
  preloadMatchesForRecord,
  syncActiveParseTask
}
