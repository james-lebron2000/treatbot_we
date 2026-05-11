/**
 * PRD-2026Q4 流式 OCR — recordEvents 单元测试。
 *
 * 这里的策略：
 *   测试不依赖真实 Redis。我们通过 mock ioredis（在 require 之前 jest.mock）让
 *   buildRedis 拿到的"客户端"是个 stub —— 即可单独验证：
 *     1. 进程内 publish → 订阅者收到（localBus 路径，与 Redis 解耦）
 *     2. snapshot 写入 → replay 按 REPLAY_ORDER 投递
 *     3. subscribeRecordEvents 引用计数：同 channel 多订阅只 SUBSCRIBE 一次
 *     4. ioredis 抛错时不影响 localBus（最重要的降级路径）
 */

// ---- Mock ioredis 在 require recordEvents 之前 ----
//
// 我们的 mock 客户端在内部维护一份"假 Redis hash store"，让 hset/hgetall/expire
// 同步生效；publish 简单返回 1，subscribe 记账。tests 通过 __getMockState 检视。
// virtual: true 让 jest 即使在 node_modules 里没装 ioredis 也能注册 mock
// （CI / 干净 worktree 场景下 dependencies 可能未安装）
jest.mock('ioredis', () => {
  const EventEmitter = require('events')
  const subscribedChannels = new Set()
  const hashStore = new Map()  // key → { field → value }
  const subscribers = []       // EventEmitter clients in subscribe mode

  let failNextOp = null        // tests 用：让下一次 hset/pipeline 抛错以验证降级
  let forceSubscribeFail = false

  class MockRedis extends EventEmitter {
    constructor(_opts) {
      super()
      this.isSubscriber = false
      subscribers.push(this)
    }

    async hset(key, field, value) {
      if (failNextOp === 'hset') { failNextOp = null; throw new Error('mock hset fail') }
      const h = hashStore.get(key) || {}
      h[field] = value
      hashStore.set(key, h)
      return 1
    }

    async hgetall(key) {
      if (failNextOp === 'hgetall') { failNextOp = null; throw new Error('mock hgetall fail') }
      return hashStore.get(key) || {}
    }

    async hdel(key, ...fields) {
      if (failNextOp === 'hdel') { failNextOp = null; throw new Error('mock hdel fail') }
      const h = hashStore.get(key)
      if (!h) return 0
      let removed = 0
      for (const f of fields) {
        if (Object.prototype.hasOwnProperty.call(h, f)) { delete h[f]; removed += 1 }
      }
      // ioredis 在 hash 变空时 key 仍然保留为空对象——我们这里也保持一致（不删 key 条目）
      return removed
    }

    async expire(_key, _ttl) { return 1 }

    async publish(channel, message) {
      // 把 message 投递到所有"已 subscribe 同 channel 的 client"
      for (const c of subscribers) {
        if (c.isSubscriber && c._subscribedTo && c._subscribedTo.has(channel)) {
          c.emit('message', channel, message)
        }
      }
      return 1
    }

    async subscribe(channel) {
      if (forceSubscribeFail) throw new Error('mock subscribe fail')
      this.isSubscriber = true
      if (!this._subscribedTo) this._subscribedTo = new Set()
      this._subscribedTo.add(channel)
      subscribedChannels.add(channel)
      return 1
    }

    async unsubscribe(channel) {
      if (this._subscribedTo) this._subscribedTo.delete(channel)
      subscribedChannels.delete(channel)
      return 1
    }

    pipeline() {
      const ops = []
      const self = this
      return {
        hset: (k, f, v) => { ops.push(['hset', k, f, v]); return this },
        expire: (k, t) => { ops.push(['expire', k, t]); return this },
        publish: (c, m) => { ops.push(['publish', c, m]); return this },
        async exec() {
          if (failNextOp === 'pipeline') { failNextOp = null; throw new Error('mock pipeline fail') }
          const results = []
          for (const [op, ...args] of ops) {
            // eslint-disable-next-line no-await-in-loop
            const r = await self[op](...args)
            results.push([null, r])
          }
          return results
        }
      }
    }

    disconnect() { /* noop */ }
  }

  MockRedis.__getState = () => ({
    subscribedChannels: new Set(subscribedChannels),
    hashStore: new Map(hashStore)
  })
  MockRedis.__failNext = (op) => { failNextOp = op }
  MockRedis.__setSubscribeFail = (v) => { forceSubscribeFail = v }
  MockRedis.__reset = () => {
    subscribedChannels.clear()
    hashStore.clear()
    subscribers.length = 0
    failNextOp = null
    forceSubscribeFail = false
  }

  return MockRedis
}, { virtual: true })

// 静默 logger，让测试输出干净
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}))

const MockRedis = require('ioredis')
const { STAGE, composeEvent } = require('../../shared/streaming/events')
const recordEvents = require('../services/recordEvents')
const {
  publishRecordEvent,
  subscribeRecordEvents,
  clearSnapshotErrorField,
  __internals
} = recordEvents

describe('recordEvents', () => {
  beforeEach(() => {
    MockRedis.__reset()
    __internals.__resetForTests()
  })

  test('publish → 同进程订阅者立即收到（不经过 Redis）', async () => {
    const received = []
    const { unsubscribe } = await subscribeRecordEvents(['rec_1'], (evt) => received.push(evt))

    await publishRecordEvent('rec_1', composeEvent('rec_1', STAGE.RECEIVED))

    // localBus 是同步 emit
    expect(received).toHaveLength(1)
    expect(received[0].stage).toBe(STAGE.RECEIVED)
    expect(received[0].progress).toBe(5)

    unsubscribe()
  })

  test('snapshot 回放：晚到的订阅者按 REPLAY_ORDER 顺序收事件', async () => {
    // 先发一连串事件，但还没有人订阅
    await publishRecordEvent('rec_2', composeEvent('rec_2', STAGE.RECEIVED))
    await publishRecordEvent('rec_2', composeEvent('rec_2', STAGE.PREPROCESS))
    await publishRecordEvent('rec_2', composeEvent('rec_2', STAGE.OCR_TEXT, { rawText: 'hello' }))
    await publishRecordEvent('rec_2', composeEvent('rec_2', STAGE.FIELD_GROUP, {
      fieldGroup: 'basic', fields: { age: 60 }, progress: 50
    }))

    // 检视 mock：snapshot 应该记录了 4 个 field
    const state = MockRedis.__getState()
    const snap = state.hashStore.get('ocr:snapshot:rec_2') || {}
    expect(Object.keys(snap).sort()).toEqual(['field_group:basic', 'ocr_text', 'preprocess', 'received'])

    // 新订阅者：必须按 REPLAY_ORDER 收到回放
    const received = []
    const { unsubscribe } = await subscribeRecordEvents(['rec_2'], (evt) => received.push(evt))

    const stages = received.map((e) => e.stage)
    // received → preprocess → ocr_text → field_group 的顺序
    expect(stages).toEqual([
      STAGE.RECEIVED,
      STAGE.PREPROCESS,
      STAGE.OCR_TEXT,
      STAGE.FIELD_GROUP
    ])
    // rawText / fields 完整透传
    expect(received[2].rawText).toBe('hello')
    expect(received[3].fields).toEqual({ age: 60 })

    unsubscribe()
  })

  test('引用计数：同 channel 多次订阅只 SUBSCRIBE 一次，全部退订才 UNSUBSCRIBE', async () => {
    const subA = await subscribeRecordEvents(['rec_3'], () => {})
    let state = MockRedis.__getState()
    expect(state.subscribedChannels.has('ocr:record:rec_3')).toBe(true)
    expect(state.subscribedChannels.size).toBe(1)

    const subB = await subscribeRecordEvents(['rec_3'], () => {})
    state = MockRedis.__getState()
    // 还是只有一个 channel 被订阅
    expect(state.subscribedChannels.size).toBe(1)

    // 先 unsubscribe 一个：channel 仍然保留
    subA.unsubscribe()
    state = MockRedis.__getState()
    expect(state.subscribedChannels.has('ocr:record:rec_3')).toBe(true)

    // 全部 unsubscribe：channel 才被真正退订
    subB.unsubscribe()
    // unsubscribe 内是 async 但调用了 .catch，给一个 tick 让 microtask 跑完
    await new Promise((r) => setImmediate(r))
    state = MockRedis.__getState()
    expect(state.subscribedChannels.has('ocr:record:rec_3')).toBe(false)
  })

  test('Redis 写入失败：localBus 仍然投递事件（最关键的降级路径）', async () => {
    const received = []
    const { unsubscribe } = await subscribeRecordEvents(['rec_4'], (evt) => received.push(evt))

    // 让下一次 pipeline.exec() 抛错
    MockRedis.__failNext('pipeline')
    await publishRecordEvent('rec_4', composeEvent('rec_4', STAGE.OCR_TEXT, { rawText: 'x' }))

    // Redis 挂，本地 emit 仍然成功
    expect(received).toHaveLength(1)
    expect(received[0].stage).toBe(STAGE.OCR_TEXT)
    expect(received[0].rawText).toBe('x')

    unsubscribe()
  })

  test('Redis 整体不可用：subscribe + publish 都 fallback 到 localBus，事件仍能到达', async () => {
    // 现实场景：Redis 完全连不上 → subscribe 抛 + publish pipeline 也抛
    MockRedis.__setSubscribeFail(true)

    const received = []
    const { unsubscribe, hasRedis } = await subscribeRecordEvents(
      ['rec_5'],
      (evt) => received.push(evt)
    )
    expect(hasRedis).toBe(false)

    // 模拟 Redis 也无法 publish —— pipeline.exec 抛错触发 fallback
    MockRedis.__failNext('pipeline')
    await publishRecordEvent('rec_5', composeEvent('rec_5', STAGE.COMPLETED, {
      result: { entities: { diagnosis: 'NSCLC' }, text: 'x', provider: 'mock', confidence: 0.9 }
    }))
    expect(received).toHaveLength(1)
    expect(received[0].stage).toBe(STAGE.COMPLETED)
    expect(received[0].result.entities.diagnosis).toBe('NSCLC')

    unsubscribe()
  })

  test('参数缺失：publishRecordEvent 安静返回，不抛', async () => {
    await expect(publishRecordEvent(null, { stage: STAGE.RECEIVED })).resolves.toBeUndefined()
    await expect(publishRecordEvent('rec', null)).resolves.toBeUndefined()
    await expect(publishRecordEvent('rec', {})).resolves.toBeUndefined()
  })

  test('snapshotFieldKey: field_group 按 stage:groupName 区分，其它按 stage', () => {
    const { snapshotFieldKey } = __internals
    expect(snapshotFieldKey({ stage: STAGE.RECEIVED })).toBe(STAGE.RECEIVED)
    expect(snapshotFieldKey({ stage: STAGE.FIELD_GROUP, fieldGroup: 'diagnosis' }))
      .toBe(`${STAGE.FIELD_GROUP}:diagnosis`)
    // 没带 fieldGroup 时退化到 stage（防 hash field collision，但属边缘场景）
    expect(snapshotFieldKey({ stage: STAGE.FIELD_GROUP })).toBe(STAGE.FIELD_GROUP)
  })

  test('Bull 重试场景：clearSnapshotErrorField 删 error 字段，其他字段保留', async () => {
    // attempt1：先 received 然后失败发 error
    await publishRecordEvent('rec_retry', composeEvent('rec_retry', STAGE.RECEIVED))
    await publishRecordEvent('rec_retry', composeEvent('rec_retry', STAGE.ERROR, { errorMsg: 'transient' }))
    let snap = MockRedis.__getState().hashStore.get('ocr:snapshot:rec_retry') || {}
    expect(Object.keys(snap).sort()).toEqual(['error', 'received'])

    // attempt2 入口：清 error
    await clearSnapshotErrorField('rec_retry')
    snap = MockRedis.__getState().hashStore.get('ocr:snapshot:rec_retry') || {}
    expect(Object.keys(snap)).toEqual(['received'])  // received 仍在
    expect(snap.error).toBeUndefined()

    // attempt2 成功：completed 落库；客户端晚到 replay 只看到 received → completed（不会再被 error 翻转）
    await publishRecordEvent('rec_retry', composeEvent('rec_retry', STAGE.COMPLETED, { result: { entities: {}, text: 'x', provider: 'mock', confidence: 0.9 } }))
    snap = MockRedis.__getState().hashStore.get('ocr:snapshot:rec_retry') || {}
    expect(snap.error).toBeUndefined()
    expect(snap.completed).toBeDefined()
  })

  test('subscribe 失败回滚：refcount 不泄漏', async () => {
    // 先建一个正常订阅，让 _subscriber 实例化
    const subOk = await subscribeRecordEvents(['rec_ok'], () => {})
    expect(subOk.hasRedis).toBe(true)
    let state = MockRedis.__getState()
    expect(state.subscribedChannels.has('ocr:record:rec_ok')).toBe(true)

    // 让下一次 subscribe 抛错——多 id 订阅时第一个成功、第二个失败
    MockRedis.__setSubscribeFail(true)
    const subFail = await subscribeRecordEvents(['rec_a', 'rec_b'], () => {})
    expect(subFail.hasRedis).toBe(false)

    // 关键断言：rec_a 即使曾经 inc 过 refcount，回滚后也归零并真发 UNSUBSCRIBE
    state = MockRedis.__getState()
    expect(state.subscribedChannels.has('ocr:record:rec_a')).toBe(false)
    expect(state.subscribedChannels.has('ocr:record:rec_b')).toBe(false)
    // 同时不影响 rec_ok 的活跃订阅
    expect(state.subscribedChannels.has('ocr:record:rec_ok')).toBe(true)

    subOk.unsubscribe()
    subFail.unsubscribe()  // 幂等，重复调不抛
  })
})
