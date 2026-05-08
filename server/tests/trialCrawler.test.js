/**
 * PRD-2026Q3 T1-1：试验数据每日抓取
 *
 * 覆盖：
 *  1) clinicalTrialsClient.fetchByNctIds：normalize 输出 + missing → errors
 *  2) clinicalTrialsClient.mapStatus：上游 enum 全集
 *  3) trialCrawler.diffAndApply：status 变更触发 trial_change_log + trials.update
 *  4) trialCrawler.run：单批失败入 DLQ
 *  5) trialCrawler.run：closed 试验自动从 recruiting → closed
 */

const mockTrialFindAll = jest.fn();
const mockTrialChangeBulkCreate = jest.fn();
const mockFailureCreate = jest.fn();
const mockMarkVerified = jest.fn();
const mockTrialUpdate = jest.fn();

jest.mock('../models', () => ({
  Trial: { findAll: (...a) => mockTrialFindAll(...a) },
  TrialChangeLog: { bulkCreate: (...a) => mockTrialChangeBulkCreate(...a) },
  TrialCrawlFailure: { create: (...a) => mockFailureCreate(...a) }
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
  mockMarkVerified.mockReset().mockResolvedValue();
  mockTrialUpdate.mockReset().mockResolvedValue([1]);
  client._setHttpClient(null);
});

describe('clinicalTrialsClient.mapStatus', () => {
  test('上游 enum 映射', () => {
    expect(client.mapStatus('RECRUITING')).toBe('recruiting');
    expect(client.mapStatus('NOT_YET_RECRUITING')).toBe('recruiting');
    expect(client.mapStatus('ACTIVE_NOT_RECRUITING')).toBe('recruiting');
    expect(client.mapStatus('COMPLETED')).toBe('completed');
    expect(client.mapStatus('TERMINATED')).toBe('closed');
    expect(client.mapStatus('WITHDRAWN')).toBe('closed');
    expect(client.mapStatus('SUSPENDED')).toBe('closed');
    expect(client.mapStatus('UNKNOWN')).toBe('closed');
    expect(client.mapStatus('')).toBe('closed');
  });
});

describe('clinicalTrialsClient.fetchByNctIds', () => {
  test('normalize：成功命中 + 上游缺失项进 errors', async () => {
    client._setHttpClient(async () => ({
      studies: [
        {
          protocolSection: {
            identificationModule: { nctId: 'NCT00000001' },
            statusModule: {
              overallStatus: 'RECRUITING',
              enrollmentInfo: { count: 50 },
              lastUpdatePostDateStruct: { date: '2026-04-01' }
            },
            designModule: { phases: ['PHASE1', 'PHASE2'] },
            contactsLocationsModule: {
              locations: [{ facility: 'A 医院', city: '北京', country: 'China', status: 'RECRUITING' }]
            }
          }
        }
      ]
    }));

    const r = await client.fetchByNctIds(['NCT00000001', 'NCT99999999']);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({
      nct_id: 'NCT00000001',
      status: 'recruiting',
      phase: 'PHASE1/PHASE2',
      enrolled_count: 50
    });
    expect(r.items[0].locations).toHaveLength(1);
    expect(r.errors).toContainEqual({ nct_id: 'NCT99999999', reason: 'not_found_upstream' });
  });

  test('单条解析异常进 errors，不影响整批', async () => {
    client._setHttpClient(async () => ({
      studies: [
        { protocolSection: { identificationModule: {} } }, // 缺 nctId
        {
          protocolSection: {
            identificationModule: { nctId: 'NCT00000002' },
            statusModule: { overallStatus: 'COMPLETED' }
          }
        }
      ]
    }));

    const r = await client.fetchByNctIds(['NCT00000002']);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].nct_id).toBe('NCT00000002');
    expect(r.errors.find((e) => e.reason === 'missing nctId')).toBeDefined();
  });

  test('空入参直接返回', async () => {
    const r = await client.fetchByNctIds([]);
    expect(r).toEqual({ items: [], errors: [] });
  });

  test('超过 100 条抛错', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `NCT${String(i).padStart(8, '0')}`);
    await expect(client.fetchByNctIds(ids)).rejects.toThrow(/最多/);
  });
});

describe('trialCrawler.diffAndApply', () => {
  test('status 变更：写 change_log + update trial + markVerified', async () => {
    const trial = {
      id: 't1', nct_id: 'NCT01', status: 'recruiting', phase: 'PHASE2', enrolled_count: 10,
      hospitals: [{ facility: 'A', city: 'BJ' }],
      update: mockTrialUpdate
    };
    const upstream = {
      nct_id: 'NCT01',
      status: 'closed',
      phase: 'PHASE2',
      enrolled_count: 10,
      locations: [{ facility: 'A', city: 'BJ' }]
    };

    const changes = await crawler.diffAndApply(trial, upstream);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ field: 'status', old_value: 'recruiting', new_value: 'closed' });

    expect(mockTrialChangeBulkCreate).toHaveBeenCalledWith([
      expect.objectContaining({ trial_id: 't1', nct_id: 'NCT01', field: 'status', source: 'clinicaltrials_v2' })
    ]);
    expect(mockTrialUpdate).toHaveBeenCalledWith({ status: 'closed' });
    expect(mockMarkVerified).toHaveBeenCalledWith('t1');
  });

  test('无变更：不写 change_log，仍然 markVerified', async () => {
    const trial = {
      id: 't1', nct_id: 'NCT01', status: 'recruiting', phase: 'PHASE2', enrolled_count: 10,
      hospitals: [{ facility: 'A', city: 'BJ' }],
      update: mockTrialUpdate
    };
    const upstream = {
      nct_id: 'NCT01', status: 'recruiting', phase: 'PHASE2', enrolled_count: 10,
      locations: [{ facility: 'A', city: 'BJ' }]
    };

    const changes = await crawler.diffAndApply(trial, upstream);
    expect(changes).toHaveLength(0);
    expect(mockTrialChangeBulkCreate).not.toHaveBeenCalled();
    expect(mockTrialUpdate).not.toHaveBeenCalled();
    expect(mockMarkVerified).toHaveBeenCalledWith('t1');
  });

  test('locations 字段差异触发 hospitals 更新', async () => {
    const trial = {
      id: 't2', nct_id: 'NCT02', status: 'recruiting', phase: 'PHASE3', enrolled_count: 5,
      hospitals: [],
      update: mockTrialUpdate
    };
    const upstream = {
      nct_id: 'NCT02', status: 'recruiting', phase: 'PHASE3', enrolled_count: 5,
      locations: [{ facility: 'B', city: 'SH' }]
    };
    const changes = await crawler.diffAndApply(trial, upstream);
    expect(changes.find((c) => c.field === 'locations')).toBeDefined();
    expect(mockTrialUpdate).toHaveBeenCalledWith({ hospitals: [{ facility: 'B', city: 'SH' }] });
  });
});

describe('trialCrawler.run', () => {
  test('整批 HTTP 失败：批内每条 NCT 都进 DLQ', async () => {
    mockTrialFindAll.mockResolvedValue([
      { id: 't1', nct_id: 'NCT01', status: 'recruiting', update: mockTrialUpdate, hospitals: [] },
      { id: 't2', nct_id: 'NCT02', status: 'recruiting', update: mockTrialUpdate, hospitals: [] }
    ]);
    client._setHttpClient(async () => { throw new Error('upstream 503'); });

    const summary = await crawler.run({ batchSize: 10 });
    expect(summary.failures).toBe(2);
    expect(mockFailureCreate).toHaveBeenCalledTimes(2);
    const reasons = mockFailureCreate.mock.calls.map((c) => c[0].reason);
    expect(reasons.every((r) => r.startsWith('batch:'))).toBe(true);
  });

  test('正常一轮：closed 试验自动从 recruiting → closed', async () => {
    const trial = {
      id: 't1', nct_id: 'NCT01', status: 'recruiting', phase: 'PHASE2', enrolled_count: 10,
      hospitals: [], update: mockTrialUpdate
    };
    mockTrialFindAll.mockResolvedValue([trial]);
    client._setHttpClient(async () => ({
      studies: [{
        protocolSection: {
          identificationModule: { nctId: 'NCT01' },
          statusModule: { overallStatus: 'TERMINATED', enrollmentInfo: { count: 10 } },
          designModule: { phases: ['PHASE2'] },
          contactsLocationsModule: { locations: [] }
        }
      }]
    }));

    const summary = await crawler.run({ batchSize: 100 });
    expect(summary.fetched).toBe(1);
    expect(summary.changed).toBe(1);
    expect(mockTrialUpdate).toHaveBeenCalledWith({ status: 'closed' });
  });

  test('上游缺失 NCT：进 DLQ 但不阻塞其它', async () => {
    mockTrialFindAll.mockResolvedValue([
      { id: 't1', nct_id: 'NCT01', status: 'recruiting', phase: 'PHASE2', enrolled_count: 10, hospitals: [], update: mockTrialUpdate },
      { id: 't2', nct_id: 'NCT02', status: 'recruiting', phase: 'PHASE2', enrolled_count: 10, hospitals: [], update: mockTrialUpdate }
    ]);
    client._setHttpClient(async () => ({
      studies: [{
        protocolSection: {
          identificationModule: { nctId: 'NCT01' },
          statusModule: { overallStatus: 'RECRUITING', enrollmentInfo: { count: 10 } },
          designModule: { phases: ['PHASE2'] },
          contactsLocationsModule: { locations: [] }
        }
      }]
    }));
    const summary = await crawler.run({ batchSize: 100 });
    expect(summary.fetched).toBe(1);
    expect(summary.failures).toBe(1);
    expect(mockFailureCreate).toHaveBeenCalledWith(expect.objectContaining({
      nct_id: 'NCT02',
      reason: 'not_found_upstream'
    }));
  });

  test('无 nct_id 试验：空跑直接返回', async () => {
    mockTrialFindAll.mockResolvedValue([]);
    const summary = await crawler.run();
    expect(summary).toEqual({ totalCandidates: 0, fetched: 0, changed: 0, failures: 0, batches: 0 });
  });
});
