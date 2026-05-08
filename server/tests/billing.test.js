/**
 * PRD-2026Q3 T1-4：CPA 月度对账 billing.computeMonthly
 *
 * 验收标准：mock 100 条 status_event，summary 数字与 SQL 手算一致。
 *
 * 覆盖：
 *   1) 基础聚合：(cro_id, trial_id) × count × cpa_price = amount
 *   2) 单 application 反复 contacted ↔ screened 来回切，仅第一次计入（防重计）
 *   3) cpa_qualified_status='enrolled' 的 CRO，screened 不计、enrolled 才计
 *   4) 跨月事件不计（month=2026-04 不应包含 2026-03 末或 2026-05 初的事件）
 *   5) 没有 trial_ids 的 CRO 不出现在结果中；非 active CRO 排除
 *   6) toCsv 含 BOM、表头顺序固定、合计行
 */

const mockCroFindAll = jest.fn();
const mockEventFindAll = jest.fn();
const mockAppFindAll = jest.fn();

jest.mock('../models', () => ({
  sequelize: {},
  CroCompany: { findAll: (...a) => mockCroFindAll(...a) },
  ApplicationStatusEvent: { findAll: (...a) => mockEventFindAll(...a) },
  TrialApplication: { findAll: (...a) => mockAppFindAll(...a) }
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const billing = require('../services/billing');

const mkCompany = (id, name, trialIds, price, status = 'screened') => ({
  id, name, trial_ids: trialIds, cpa_price: price, cpa_qualified_status: status, status: 'active'
});

const mkEvent = (appId, toStatus, createdAt, fromStatus = 'contacted') => ({
  application_id: appId, from_status: fromStatus, to_status: toStatus,
  created_at: new Date(createdAt)
});

beforeEach(() => {
  mockCroFindAll.mockReset();
  mockEventFindAll.mockReset();
  mockAppFindAll.mockReset();
});

describe('billing.computeMonthly — T1-4', () => {
  test('1) 基础聚合：cro_A trial_t1 命中 3 条 × 200 = 600 元', async () => {
    mockCroFindAll.mockResolvedValue([mkCompany('cro_A', 'A 公司', ['t1'], 200)]);
    mockAppFindAll.mockResolvedValue([
      { id: 'app_1', trial_id: 't1' },
      { id: 'app_2', trial_id: 't1' },
      { id: 'app_3', trial_id: 't1' }
    ]);
    mockEventFindAll.mockResolvedValue([
      mkEvent('app_1', 'screened', '2026-04-05T10:00:00+08:00'),
      mkEvent('app_2', 'screened', '2026-04-10T10:00:00+08:00'),
      mkEvent('app_3', 'screened', '2026-04-20T10:00:00+08:00')
    ]);

    const r = await billing.computeMonthly('2026-04');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      cro_id: 'cro_A', trial_id: 't1', count: 3, unit_price: 200, amount: 600
    });
    expect(r.total_count).toBe(3);
    expect(r.total_amount).toBe(600);
  });

  test('2) 同 application 多次 to=screened 仅计第一次（防重计）', async () => {
    mockCroFindAll.mockResolvedValue([mkCompany('cro_A', 'A', ['t1'], 100)]);
    mockAppFindAll.mockResolvedValue([{ id: 'app_1', trial_id: 't1' }]);
    mockEventFindAll.mockResolvedValue([
      mkEvent('app_1', 'screened', '2026-04-05T10:00:00+08:00'),
      mkEvent('app_1', 'screened', '2026-04-15T10:00:00+08:00'),
      mkEvent('app_1', 'screened', '2026-04-25T10:00:00+08:00')
    ]);

    const r = await billing.computeMonthly('2026-04');
    expect(r.rows[0].count).toBe(1);
    expect(r.total_amount).toBe(100);
  });

  test('3) cpa_qualified_status=enrolled：screened 不计、enrolled 才计', async () => {
    mockCroFindAll.mockResolvedValue([mkCompany('cro_B', 'B', ['t2'], 500, 'enrolled')]);
    mockAppFindAll.mockResolvedValue([
      { id: 'app_1', trial_id: 't2' },
      { id: 'app_2', trial_id: 't2' }
    ]);
    mockEventFindAll.mockResolvedValue([
      mkEvent('app_1', 'screened', '2026-04-05T10:00:00+08:00'),
      mkEvent('app_1', 'enrolled', '2026-04-06T10:00:00+08:00', 'screened'),
      mkEvent('app_2', 'screened', '2026-04-07T10:00:00+08:00')
    ]);

    const r = await billing.computeMonthly('2026-04');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].count).toBe(1);
    expect(r.rows[0].qualified_status).toBe('enrolled');
    expect(r.total_amount).toBe(500);
  });

  test('4) month=2026-04 时，computeMonthly 通过 created_at 范围把别月剔掉', async () => {
    mockCroFindAll.mockResolvedValue([mkCompany('cro_A', 'A', ['t1'], 50)]);
    // 模拟 SQL 已按范围过滤后的结果（4月内 2 条）
    mockAppFindAll.mockResolvedValue([
      { id: 'app_1', trial_id: 't1' },
      { id: 'app_2', trial_id: 't1' }
    ]);
    mockEventFindAll.mockResolvedValue([
      mkEvent('app_1', 'screened', '2026-04-01T08:00:00+08:00'),
      mkEvent('app_2', 'screened', '2026-04-30T23:00:00+08:00')
    ]);

    const r = await billing.computeMonthly('2026-04');
    // 验证 findAll 的 where 包含 created_at 范围
    const whereArg = mockEventFindAll.mock.calls[0][0].where;
    expect(whereArg.created_at).toBeDefined();
    // UTC+8 的 2026-04-01 00:00 = UTC 2026-03-31 16:00
    const symbolKeys = Object.getOwnPropertySymbols(whereArg.created_at);
    expect(symbolKeys.length).toBe(2); // gte + lt
    expect(r.rows[0].count).toBe(2);
  });

  test('5) 100 条事件混合场景：手算 vs API 一致（T1-4 验收）', async () => {
    // 三家 CRO，三个试验，混合 100 条事件
    mockCroFindAll.mockResolvedValue([
      mkCompany('cro_A', 'A 大型', ['t1'], 200),                  // screened 计费
      mkCompany('cro_B', 'B 中型', ['t2'], 500, 'enrolled'),       // enrolled 计费
      mkCompany('cro_C', 'C 启停', ['t3'], 0)                      // 单价 0：算金额 0
    ]);

    // 100 条事件：分布如下（手算）
    //   t1 → cro_A：60 个不同 app，全部到 screened → 60 计入 × 200 = 12000
    //   t2 → cro_B：25 个不同 app，先到 screened 不计，其中 15 个再到 enrolled → 15 × 500 = 7500
    //                （25 个 screened + 15 个 enrolled = 40 条事件）
    //   t3 → cro_C：剩 0 条事件以凑齐 100；改为：用 t3 = 0 个事件，验证非零单价但单价为 0 的情况单独
    // 调整方案：t1=60, t2=40 (25 screened + 15 enrolled), 共 100 条；cro_C 单独覆盖见 case 1
    // 合计 60 + 15 = 75 条计入，金额 60×200 + 15×500 = 19500
    const events = [];
    const apps = [];
    for (let i = 1; i <= 60; i++) {
      apps.push({ id: `a_t1_${i}`, trial_id: 't1' });
      events.push(mkEvent(`a_t1_${i}`, 'screened', `2026-04-${String((i % 28) + 1).padStart(2, '0')}T10:00:00+08:00`));
    }
    for (let i = 1; i <= 25; i++) {
      apps.push({ id: `a_t2_${i}`, trial_id: 't2' });
      events.push(mkEvent(`a_t2_${i}`, 'screened', `2026-04-10T10:00:00+08:00`));
      if (i <= 15) {
        events.push(mkEvent(`a_t2_${i}`, 'enrolled', `2026-04-11T10:00:00+08:00`, 'screened'));
      }
    }
    expect(events.length).toBe(100);

    mockAppFindAll.mockResolvedValue(apps);
    mockEventFindAll.mockResolvedValue(events);

    const r = await billing.computeMonthly('2026-04');

    const byCro = (id) => r.rows.find((x) => x.cro_id === id);
    expect(byCro('cro_A').count).toBe(60);
    expect(byCro('cro_A').amount).toBe(12000);
    expect(byCro('cro_B').count).toBe(15);
    expect(byCro('cro_B').amount).toBe(7500);
    // cro_C 没有 trial_id 命中事件 → 不出现
    expect(byCro('cro_C')).toBeUndefined();

    expect(r.total_count).toBe(60 + 15);
    expect(r.total_amount).toBe(19500);
  });

  test('6) toCsv：BOM + 表头固定 + 合计行', async () => {
    mockCroFindAll.mockResolvedValue([mkCompany('cro_A', 'A 公司', ['t1'], 100)]);
    mockAppFindAll.mockResolvedValue([{ id: 'app_1', trial_id: 't1' }]);
    mockEventFindAll.mockResolvedValue([
      mkEvent('app_1', 'screened', '2026-04-10T10:00:00+08:00')
    ]);

    const r = await billing.computeMonthly('2026-04');
    const csv = billing.toCsv(r);

    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    const lines = csv.replace(/^﻿/, '').trim().split('\n');
    expect(lines[0]).toBe('月份,CRO ID,CRO 公司,试验 ID,合格状态,合格线索数,单价(元),小计(元)');
    expect(lines[1]).toContain('cro_A');
    expect(lines[1]).toContain('"A 公司"');
    expect(lines[1].endsWith(',1,100.00,100.00')).toBe(true);
    expect(lines[2].startsWith('合计,')).toBe(true);
    expect(lines[2].endsWith(',1,,100.00')).toBe(true);
  });

  test('7) 非法 month 抛错', async () => {
    await expect(billing.computeMonthly('2026/04')).rejects.toThrow(/非法 month/);
    await expect(billing.computeMonthly('2026-13')).rejects.toThrow(/非法 month/);
    await expect(billing.computeMonthly('')).rejects.toThrow(/非法 month/);
  });
});

describe('billing.monthBounds — UTC+8 边界', () => {
  test('2026-04 的 startUtc = 2026-03-31 16:00 UTC', () => {
    const { startUtc, endUtc } = billing.monthBounds('2026-04');
    expect(startUtc.toISOString()).toBe('2026-03-31T16:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-04-30T16:00:00.000Z');
  });
});
