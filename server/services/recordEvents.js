// PRD-2026Q4 流式 OCR：单一事实源 publish/subscribe + 快照回放。
//
// 三件事：
// 1. publishRecordEvent —— worker 在 OCR 管线检查点广播事件
//    a) HSET 写"按阶段去重"快照到 Redis（用 stage 或 stage:groupName 作 hash field）
//    b) PUBLISH 到 ocr:record:${recordId} 频道
//    c) Redis 不可用时退化为进程内 EventEmitter（保证单进程部署仍能 SSE）
// 2. subscribeRecordEvents —— SSE 端点订阅一组 recordIds
//    a) 先 HGETALL 快照按事件顺序回放（防晚到的客户端漏事件）
//    b) 再 attach pub/sub
//    c) 引用计数：同进程多 SSE 共享一个 Redis subscriber
// 3. EventEmitter fallback：纯进程内场景（dev / Redis 挂）也能跑通

const EventEmitter = require('events')
const logger = require('../utils/logger')
const { STAGE, isTerminalStage } = require('../../shared/streaming/events')

const SNAPSHOT_TTL_SECONDS = 30 * 60   // 30min：上传完结果一般要在这个窗口内被看见
const CHANNEL_PREFIX = 'ocr:record:'
const SNAPSHOT_PREFIX = 'ocr:snapshot:'

// 进程内 EventEmitter（Redis 挂时兜底；同进程订阅也走这里以省掉 pub/sub 序列化）
const localBus = new EventEmitter()
localBus.setMaxListeners(200)

// Redis 客户端（lazy）。复用 middleware/rateLimit.js 的连接策略——
// 一份 publisher（可与其他模块共用），一份专用 subscriber（subscribe 模式独占）。
let _publisher = null
let _subscriber = null
const _subscriberRefCount = new Map()  // channel → refCount

const buildRedis = () => {
  // 故意不共用 rateLimit 的 client：rateLimit 那个是 Proxy 包装的，对 subscribe 模式不友好。
  const Redis = require('ioredis')
  return new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: 0,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 3000
  })
}

const getPublisher = () => {
  if (_publisher) return _publisher
  _publisher = buildRedis()
  _publisher.on('error', (err) => {
    // 只 warn，不 throw —— 调用方通过返回值/降级判断
    logger.warn('recordEvents publisher Redis 错误', { error: err.message })
  })
  return _publisher
}

const getSubscriber = () => {
  if (_subscriber) return _subscriber
  _subscriber = buildRedis()
  _subscriber.on('error', (err) => {
    logger.warn('recordEvents subscriber Redis 错误', { error: err.message })
  })
  _subscriber.on('message', (channel, message) => {
    const recordId = channel.startsWith(CHANNEL_PREFIX) ? channel.slice(CHANNEL_PREFIX.length) : null
    if (!recordId) return
    let evt = null
    try {
      evt = JSON.parse(message)
    } catch (e) {
      logger.warn('recordEvents 无法解析 pub/sub message', { channel, message: message?.slice(0, 200) })
      return
    }
    localBus.emit(`record:${recordId}`, evt)
  })
  return _subscriber
}

// 快照 hash field key：除 field_group 之外都按 stage；field_group 按 stage:groupName 区分
const snapshotFieldKey = (evt) => {
  if (evt.stage === STAGE.FIELD_GROUP && evt.fieldGroup) {
    return `${STAGE.FIELD_GROUP}:${evt.fieldGroup}`
  }
  return evt.stage
}

// 回放顺序：保证客户端看到的事件序列与 worker 实际产生顺序一致
const REPLAY_ORDER = [
  STAGE.RECEIVED,
  STAGE.PREPROCESS,
  STAGE.OCR_TEXT,
  `${STAGE.FIELD_GROUP}:basic`,
  `${STAGE.FIELD_GROUP}:diagnosis`,
  `${STAGE.FIELD_GROUP}:treatment`,
  `${STAGE.FIELD_GROUP}:timeline`,
  STAGE.COMPLETED,
  STAGE.ERROR
]

/**
 * 广播一个 OCR 阶段事件。
 *   - 同时写快照（HSET + EXPIRE）和 PUBLISH
 *   - Redis 任意失败都不抛——进程内 localBus 兜底，让单进程部署也能工作
 *
 * @param {string} recordId
 * @param {object} evt 已通过 composeEvent 构建的事件对象
 * @returns {Promise<void>}
 */
const publishRecordEvent = async (recordId, evt) => {
  if (!recordId || !evt || !evt.stage) {
    logger.warn('publishRecordEvent: 参数不全', { recordId, hasEvt: !!evt })
    return
  }

  // 走 Redis 链路（pipeline: hset + expire + publish）。
  // 关键点：成功时不再额外 localBus.emit —— 同进程订阅者会通过 Redis subscriber
  // 收到这条 publish 后由 _subscriber.on('message') 投递到 localBus（见 getSubscriber）。
  // 双路径会导致同一事件被订阅者收到两次。
  let redisOk = false
  try {
    const pub = getPublisher()
    const snapshotKey = `${SNAPSHOT_PREFIX}${recordId}`
    const fieldKey = snapshotFieldKey(evt)
    const message = JSON.stringify(evt)

    const pipeline = pub.pipeline()
    pipeline.hset(snapshotKey, fieldKey, message)
    pipeline.expire(snapshotKey, SNAPSHOT_TTL_SECONDS)
    pipeline.publish(`${CHANNEL_PREFIX}${recordId}`, message)
    await pipeline.exec()
    redisOk = true
  } catch (err) {
    logger.warn('publishRecordEvent Redis 写入失败（fallback 到进程内 localBus）', {
      recordId,
      stage: evt.stage,
      error: err.message
    })
  }

  // Redis 不可用才走进程内广播——保证单进程部署 / Redis 抖动期间 SSE 仍能工作。
  // 关键：仅当本进程订阅者尚未通过 Redis subscriber 路径接收到该事件时才发——
  // redisOk=true 时，Redis subscriber 会把 publish 的消息回灌到 localBus，无需重复 emit。
  if (!redisOk) {
    localBus.emit(`record:${recordId}`, evt)
  }
}

/**
 * 回放某 recordId 的快照（HGETALL → 按时序 emit 给本地 callback）。
 * 失败时返回 false（让调用方自行决定要不要降级到轮询）。
 */
const replaySnapshot = async (recordId, onEvent) => {
  try {
    const pub = getPublisher()
    const hash = await pub.hgetall(`${SNAPSHOT_PREFIX}${recordId}`)
    if (!hash || Object.keys(hash).length === 0) return true   // 还没事件，正常

    // 按 REPLAY_ORDER 顺序发，避免乱序导致 UI 状态机混乱
    for (const fieldKey of REPLAY_ORDER) {
      if (hash[fieldKey]) {
        try {
          const evt = JSON.parse(hash[fieldKey])
          onEvent(evt)
        } catch (e) {
          logger.warn('replaySnapshot 跳过无法解析的快照字段', { recordId, fieldKey })
        }
      }
    }
    return true
  } catch (err) {
    logger.warn('replaySnapshot Redis 读失败', { recordId, error: err.message })
    return false
  }
}

const channelOf = (recordId) => `${CHANNEL_PREFIX}${recordId}`

/**
 * Bull 重试场景：上一次 attempt 失败后会留下 snapshot 的 `error` 字段；
 * 下一个 attempt 成功并写 `completed` 后，replay 顺序里 `completed` 在 `error` 之前，
 * 客户端会先看到 completed → 又被 error 覆盖（UI 翻转回失败）。
 *
 * 解决：每个 attempt 进入时调用本方法，删 snapshot 里的 error 字段（不动其他阶段字段——
 * 已经发生过的 received/preprocess/ocr_text 仍然有效，重写会原地覆盖）。
 * Redis 不可用时静默吞掉，不阻塞 worker。
 */
const clearSnapshotErrorField = async (recordId) => {
  if (!recordId) return
  try {
    const pub = getPublisher()
    await pub.hdel(`${SNAPSHOT_PREFIX}${recordId}`, STAGE.ERROR)
  } catch (err) {
    logger.warn('clearSnapshotErrorField Redis 失败（忽略，retry 仍能继续）', {
      recordId,
      error: err.message
    })
  }
}

/**
 * 订阅一组 recordIds 的实时事件。
 *   - 先 replaySnapshot（保证晚到的客户端能看到已发生的事件）
 *   - 再 attach 进程内 + Redis pub/sub
 *   - 返回 unsubscribe 函数，调用方在客户端断开时务必调用
 *
 * @param {string[]} recordIds
 * @param {(evt: object) => void} onEvent
 * @returns {Promise<{ unsubscribe: () => void, hasRedis: boolean }>}
 */
const subscribeRecordEvents = async (recordIds, onEvent) => {
  const ids = (Array.isArray(recordIds) ? recordIds : [recordIds]).filter(Boolean)
  if (!ids.length) {
    return { unsubscribe: () => {}, hasRedis: false }
  }

  // localBus listener 永远 attach（同进程 publishRecordEvent 直接走 localBus）
  const localHandlers = ids.map((rid) => {
    const handler = (evt) => onEvent(evt)
    localBus.on(`record:${rid}`, handler)
    return { rid, handler }
  })

  // Redis pub/sub + replay：失败也不影响 localBus 路径
  let hasRedis = false
  // 记录本次实际成功 SUBSCRIBE 的 channels —— 失败回滚 / unsubscribe 时只动这一组，
  // 避免：rid#1 subscribe 成功后 rid#2 抛错 → rid#1 的 refcount 永不归零的泄漏。
  const acquired = []
  try {
    const sub = getSubscriber()
    // 引用计数 SUBSCRIBE：同进程多个订阅同一 channel 时只 SUBSCRIBE 一次
    for (const rid of ids) {
      const ch = channelOf(rid)
      const cur = _subscriberRefCount.get(ch) || 0
      // 每个 rid 单独 try：成功才动 refcount，失败抛出由外层 catch 处理（已 acquire 的 channels 回滚）
      // eslint-disable-next-line no-await-in-loop
      if (cur === 0) await sub.subscribe(ch)
      _subscriberRefCount.set(ch, cur + 1)
      acquired.push(ch)
    }
    hasRedis = true

    // 回放快照——在 SUBSCRIBE 之后调，确保不丢事件（即使 worker 在两步之间又发了一条）
    for (const rid of ids) {
      // eslint-disable-next-line no-await-in-loop
      await replaySnapshot(rid, onEvent)
    }
  } catch (err) {
    logger.warn('subscribeRecordEvents Redis 订阅失败，仅本地广播生效', {
      ids,
      error: err.message
    })
    hasRedis = false
    // 回滚：把已经 inc 过的 refcount 减回去，并对 refcount 归零的 channel 实发 UNSUBSCRIBE
    const sub = _subscriber
    for (const ch of acquired) {
      const cur = _subscriberRefCount.get(ch) || 0
      const next = Math.max(0, cur - 1)
      if (next === 0) {
        _subscriberRefCount.delete(ch)
        if (sub) {
          try { sub.unsubscribe(ch).catch(() => {}) } catch (_e) { /* ignore */ }
        }
      } else {
        _subscriberRefCount.set(ch, next)
      }
    }
  }

  let unsubscribed = false
  const unsubscribe = () => {
    if (unsubscribed) return
    unsubscribed = true

    for (const { rid, handler } of localHandlers) {
      localBus.removeListener(`record:${rid}`, handler)
    }

    if (hasRedis) {
      // 引用计数减 1，归零才真正 UNSUBSCRIBE
      const sub = _subscriber
      if (sub) {
        for (const rid of ids) {
          const ch = channelOf(rid)
          const cur = _subscriberRefCount.get(ch) || 0
          const next = Math.max(0, cur - 1)
          if (next === 0) {
            _subscriberRefCount.delete(ch)
            sub.unsubscribe(ch).catch((err) => {
              logger.warn('recordEvents 退订失败', { ch, error: err.message })
            })
          } else {
            _subscriberRefCount.set(ch, next)
          }
        }
      }
    }
  }

  return { unsubscribe, hasRedis }
}

// 测试 / 进程关停 hook
const __resetForTests = () => {
  localBus.removeAllListeners()
  _subscriberRefCount.clear()
  if (_publisher) { try { _publisher.disconnect() } catch (_e) {} _publisher = null }
  if (_subscriber) { try { _subscriber.disconnect() } catch (_e) {} _subscriber = null }
}

module.exports = {
  publishRecordEvent,
  subscribeRecordEvents,
  replaySnapshot,
  clearSnapshotErrorField,
  isTerminalStage,
  __internals: {
    SNAPSHOT_PREFIX,
    CHANNEL_PREFIX,
    SNAPSHOT_TTL_SECONDS,
    REPLAY_ORDER,
    snapshotFieldKey,
    __resetForTests
  }
}
