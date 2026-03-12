const api = require('./api')
const cache = require('./cache')
const schema = require('./schema')

const ACTIVE_PARSE_TASK_KEY = 'activeParseTask'
const RECENT_COMPLETED_RECORD_KEY = 'recentCompletedRecordId'
const MATCH_CACHE_TTL = 30 * 60 * 1000
const PARSE_RESULT_CACHE_TTL = 30 * 60 * 1000

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

  if (status === 'completed') {
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

  if (status === 'error' || status === 'failed') {
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

module.exports = {
  ACTIVE_PARSE_TASK_KEY,
  RECENT_COMPLETED_RECORD_KEY,
  getActiveParseTask,
  setActiveParseTask,
  clearActiveParseTask,
  getCachedMatches,
  setCachedMatches,
  clearCachedMatches,
  getCachedParseResult,
  setCachedParseResult,
  clearCachedParseResults,
  preloadMatchesForRecord,
  syncActiveParseTask
}
