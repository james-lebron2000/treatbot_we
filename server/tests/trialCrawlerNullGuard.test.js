/**
 * PRD-2026Q4 T0-1：trialCrawler null 守门
 *
 * 覆盖：
 *   1. clinicalTrialsClient.normalize 对 null/missing 字段的标记（_null_sources）
 *   2. trialCrawler.diffAndApply 在 "上游 null + 库内非 null" 时
 *      —— 不覆盖 trial、不写 trial_change_log，而是写 trial_field_change_review
 *   3. 多字段同时 null + 部分有效时，仅 null 字段进 review，有效字段正常更新。
 *
 * 不做真实 DB / 网络：models 全 mock。
 */

const mockTrialFindAll = jest.fn();
const mockTrialChangeBulkCreate = jest.fn();
const mockFailureCreate = jest.fn();
const mockReviewCreate = jest.fn();
const mockReviewCount = jest.fn();
const mockMarkVerified = jest.fn();
const mockTrialUpdate = jest.fn();

jest.mock('../models', () => ({
  Trial: { findAll: (...a) => mockTrialFindAll(...a) },
  TrialChangeLog: { bulkCreate: (...a) => mockTrialChangeBulkCreate(...a) },
  TrialCrawlFailure: { create: (...a) => mockFailureCreate(...a) },
  TrialFieldChangeReview: {
    create: (...a) => mockReviewCreate(...a),
    count: (...a) => mockReviewCount(...a)
  }
}));

jest.mock('../services/trialFreshness', () => ({
  markVerified: (...a) => mockMarkVerified(...a)
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const client = require('../services/clinicalTrialsClient');
const crawler = require('../jobs/trialCrawler');

beforeEach(() => {
  mockTrialFindAll.mockReset();
  mockTrialChangeBulkCreate.mockReset().mockResolvedValue([]);
  mockFailureCreate.mockReset().mockResolvedValue({});
  mockReviewCreate.mockReset().mockResolvedValue({});
  mockReviewCount.mockReset().mockResolvedValue(0);
  mockMarkVerified.mockReset().mockResolvedValue();
  mockTrialUpdate.mockReset().mockResolvedValue([1]);
  client._setHttpClient(null);
});

describe('clinicalTrialsClient.normalize null sources', () => {
  test('上游字段全 missing：_null_sources 各项为 missing', async () => {
    client._setHttpClient(async () => ({
      studies: [{
        protocolSection: {
          identificationModule: { nctId: 'NCT_M' }
          // 无 statusModule / designModule / contactsLocationsModule
        }
      }]
    }));
    const r = await client.fetchByNctIds(['NCT_M']);
    expect(r.items).toHaveLength(1);
    const item = r.items[0];
    expect(item._null_sources).toEqual({
      status: 'missing',
      phase: 'missing',
      enrolled_count: 'missing',
      locations: 'missing'
    });
    expect(item.status).toBeNull();
    expect(item.phase).toBeNull();
    expect(item.enrolled_count).toBeNull();
    expect(item.locations).toBeNull();
  });

  test('上游字段显式 null：_null_sources 标记 explicit', async () => {
    client._setHttpClient(async () => ({
      studies: [{
        protocolSection: {
          identificationModule: { nctId: 'NCT_E' },
          statusModule: { overallStatus: null, enrollmentInfo: { count: null } },
          designModule: { phases: null },
          contactsLocationsModule: { locations: null }
        }
      }]
    }));
    const r = await client.fetchByNctIds(['NCT_E']);
    expect(r.items[0]._null_sources).toEqual({
      status: 'explicit',
      phase: 'explicit',
      enrolled_count: 'explicit',
      locations: 'explicit'
    });
  });

  test('上游字段非 null：_null_sources 不写入对应 key', async () => {
    client._setHttpClient(async () => ({
      studies: [{
        protocolSection: {
          identificationModule: { nctId: 'NCT_OK' },
          statusModule: { overallStatus: 'RECRUITING', enrollmentInfo: { count: 30 } },
          designModule: { phases: ['PHASE2'] },
          contactsLocationsModule: { locations: [] }
        }
      }]
    }));
    const r = await client.fetchByNctIds(['NCT_OK']);
    const item = r.items[0];
    expect(item.status).toBe('recruiting');
    expect(item.phase).toBe('PHASE2');
    expect(item.enrolled_count).toBe(30);
    // 数组 [] 不会 fall-through 到 missing；只标 phase 为 missing 当 phases=[]
    // status / enrolled_count 不应在 _null_sources 里
    expect(item._null_sources.status).toBeUndefined();
    expect(item._null_sources.enrolled_count).toBeUndefined();
  });
});

describe('trialCrawler.diffAndApply null guard', () => {
  // 用例 1：上游 status='RECRUITING' 库内 'recruiting' → 无变化、无 review
  test('上游 RECRUITING vs 库内 recruiting：无变化、无 review log', async () => {
    const trial = {
      id: 't1', nct_id: 'NCT01', status: 'recruiting', phase: 'PHASE2', enrolled_count: 10,
      hospitals: [], update: mockTrialUpdate
    };
    const upstream = {
      nct_id: 'NCT01', status: 'recruiting', phase: 'PHASE2', enrolled_count: 10,
      locations: [], _null_sources: {}
    };
    const changes = await crawler.diffAndApply(trial, upstream);
    expect(changes).toHaveLength(0);
    expect(mockTrialChangeBulkCreate).not.toHaveBeenCalled();
    expect(mockReviewCreate).not.toHaveBeenCalled();
    expect(mockTrialUpdate).not.toHaveBeenCalled();
    expect(mockMarkVerified).toHaveBeenCalledWith('t1');
  });

  // 用例 2：上游 status=null（explicit）库内 recruiting → trial 不变 + review 一条 explicit
  test('上游 status 显式 null：守门拦截，写 review 一条 null_source=explicit', async () => {
    const trial = {
      id: 't1', nct_id: 'NCT01', status: 'recruiting', phase: 'PHASE2', enrolled_count: 10,
      hospitals: [], update: mockTrialUpdate
    };
    const upstream = {
      nct_id: 'NCT01', status: null, phase: 'PHASE2', enrolled_count: 10,
      locations: [], _null_sources: { status: 'explicit' }
    };
    const changes = await crawler.diffAndApply(trial, upstream);
    expect(changes).toHaveLength(0);
    expect(mockTrialUpdate).not.toHaveBeenCalled();
    expect(mockTrialChangeBulkCreate).not.toHaveBeenCalled();
    expect(mockReviewCreate).toHaveBeenCalledTimes(1);
    expect(mockReviewCreate).toHaveBeenCalledWith(expect.objectContaining({
      trial_id: 't1',
      nct_id: 'NCT01',
      field: 'status',
      old_value: 'recruiting',
      new_value: null,
      null_source: 'explicit',
      change_kind: 'suspect_null_from_upstream',
      status: 'pending'
    }));
    expect(mockMarkVerified).toHaveBeenCalledWith('t1');
  });

  // 用例 3：上游 status undefined（missing）库内 recruiting → review 一条 missing
  test('上游 status 字段缺失：守门拦截，写 review 一条 null_source=missing', async () => {
    const trial = {
      id: 't1', nct_id: 'NCT01', status: 'recruiting', phase: 'PHASE2', enrolled_count: 10,
      hospitals: [], update: mockTrialUpdate
    };
    const upstream = {
      nct_id: 'NCT01', /* status undefined */ phase: 'PHASE2', enrolled_count: 10,
      locations: [], _null_sources: { status: 'missing' }
    };
    const changes = await crawler.diffAndApply(trial, upstream);
    expect(changes).toHaveLength(0);
    expect(mockTrialUpdate).not.toHaveBeenCalled();
    expect(mockReviewCreate).toHaveBeenCalledTimes(1);
    expect(mockReviewCreate).toHaveBeenCalledWith(expect.objectContaining({
      field: 'status',
      old_value: 'recruiting',
      new_value: null,
      null_source: 'missing'
    }));
  });

  // 用例 4：上游 enrolled_count=null 库内 120 → trial.enrolled_count 仍 120 + review 一条
  test('上游 enrolled_count 为 null：守门，库内 120 不被刷', async () => {
    const trial = {
      id: 't2', nct_id: 'NCT02', status: 'recruiting', phase: 'PHASE3', enrolled_count: 120,
      hospitals: [], update: mockTrialUpdate
    };
    const upstream = {
      nct_id: 'NCT02', status: 'recruiting', phase: 'PHASE3', enrolled_count: null,
      locations: [], _null_sources: { enrolled_count: 'explicit' }
    };
    const changes = await crawler.diffAndApply(trial, upstream);
    expect(changes).toHaveLength(0);
    expect(mockTrialUpdate).not.toHaveBeenCalled();
    expect(mockReviewCreate).toHaveBeenCalledTimes(1);
    expect(mockReviewCreate).toHaveBeenCalledWith(expect.objectContaining({
      field: 'enrolled_count',
      old_value: 120,
      new_value: null,
      null_source: 'explicit'
    }));
  });

  // 用例 5：上游 enrolled_count=130 库内 120 → trial 更新到 130，无 review
  test('上游 enrolled_count 为合法新值：正常 update + change_log，不入 review', async () => {
    const trial = {
      id: 't3', nct_id: 'NCT03', status: 'recruiting', phase: 'PHASE3', enrolled_count: 120,
      hospitals: [], update: mockTrialUpdate
    };
    const upstream = {
      nct_id: 'NCT03', status: 'recruiting', phase: 'PHASE3', enrolled_count: 130,
      locations: [], _null_sources: {}
    };
    const changes = await crawler.diffAndApply(trial, upstream);
    expect(changes.find((c) => c.field === 'enrolled_count')).toBeDefined();
    expect(mockTrialUpdate).toHaveBeenCalledWith({ enrolled_count: 130 });
    expect(mockTrialChangeBulkCreate).toHaveBeenCalled();
    expect(mockReviewCreate).not.toHaveBeenCalled();
  });

  // 用例 6：上游 enrolled_count=null 库内也 null → 无变化、无 review
  test('上游 null + 库内 null：无变化、不入 review', async () => {
    const trial = {
      id: 't4', nct_id: 'NCT04', status: 'recruiting', phase: 'PHASE2', enrolled_count: null,
      hospitals: [], update: mockTrialUpdate
    };
    const upstream = {
      nct_id: 'NCT04', status: 'recruiting', phase: 'PHASE2', enrolled_count: null,
      locations: [], _null_sources: { enrolled_count: 'missing' }
    };
    const changes = await crawler.diffAndApply(trial, upstream);
    expect(changes).toHaveLength(0);
    expect(mockReviewCreate).not.toHaveBeenCalled();
    expect(mockTrialUpdate).not.toHaveBeenCalled();
  });

  // 用例 7：多字段同时 null + 部分有效 → 仅 null 进 review，有效字段正常更新
  test('混合：phase=null（拦截）+ status=closed（应用）+ enrolled_count=200（应用）', async () => {
    const trial = {
      id: 't5', nct_id: 'NCT05', status: 'recruiting', phase: 'PHASE2', enrolled_count: 100,
      hospitals: [], update: mockTrialUpdate
    };
    const upstream = {
      nct_id: 'NCT05', status: 'closed', phase: null, enrolled_count: 200,
      locations: [], _null_sources: { phase: 'explicit' }
    };
    const changes = await crawler.diffAndApply(trial, upstream);

    // 只有 status / enrolled_count 进 changes，phase 被守门
    const fields = changes.map((c) => c.field).sort();
    expect(fields).toEqual(['enrolled_count', 'status']);

    // trial.update 不应包含 phase
    expect(mockTrialUpdate).toHaveBeenCalledTimes(1);
    const patch = mockTrialUpdate.mock.calls[0][0];
    expect(patch).toEqual({ status: 'closed', enrolled_count: 200 });
    expect(patch.phase).toBeUndefined();

    // review 仅一条 phase
    expect(mockReviewCreate).toHaveBeenCalledTimes(1);
    expect(mockReviewCreate).toHaveBeenCalledWith(expect.objectContaining({
      field: 'phase',
      old_value: 'PHASE2',
      new_value: null,
      null_source: 'explicit'
    }));
  });
});
