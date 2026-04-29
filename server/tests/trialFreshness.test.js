/**
 * PRD-2026Q2 §2.4：试验新鲜度 —— 衰减档位与归一化单测。
 *
 * 关注点（不触发 DB）：
 *  - computeFreshnessScore 在 14d / 30d / 60d 边界的档位切换；
 *  - normalizeScore(0..100) → 0.7..1.0 的线性映射；
 *  - decayStaleTrials 对 mock Trial 列表的行为（含 autoClosedIds 返回）。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// mock sequelize model before import
jest.mock('../models', () => ({
  Trial: {
    findAll: jest.fn(),
    count: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn()
  }
}));

const { Trial } = require('../models');
const {
  computeFreshnessScore,
  normalizeScore,
  decayStaleTrials,
  markVerified
} = require('../services/trialFreshness');

describe('computeFreshnessScore', () => {
  const now = Date.now();
  test('null → 50 （从未 verify 给中等分）', () => {
    expect(computeFreshnessScore(null, now)).toBe(50);
  });
  test('<14d → 100', () => {
    expect(computeFreshnessScore(new Date(now - 5 * DAY_MS), now)).toBe(100);
  });
  test('14-30d → 90', () => {
    expect(computeFreshnessScore(new Date(now - 20 * DAY_MS), now)).toBe(90);
  });
  test('30-60d → 70', () => {
    expect(computeFreshnessScore(new Date(now - 45 * DAY_MS), now)).toBe(70);
  });
  test('60d+ → 30', () => {
    expect(computeFreshnessScore(new Date(now - 70 * DAY_MS), now)).toBe(30);
  });
});

describe('normalizeScore', () => {
  test('100 → 1.0', () => {
    expect(normalizeScore(100)).toBeCloseTo(1.0, 5);
  });
  test('0 → 0.7', () => {
    expect(normalizeScore(0)).toBeCloseTo(0.7, 5);
  });
  test('50 → 0.85', () => {
    expect(normalizeScore(50)).toBeCloseTo(0.85, 5);
  });
  test('未知（null/undefined/NaN）→ 1.0（不扣分）', () => {
    expect(normalizeScore(null)).toBe(1.0);
    expect(normalizeScore(undefined)).toBe(1.0);
    expect(normalizeScore(NaN)).toBe(1.0);
  });
  test('超界值被 clamp 到 [0,100]', () => {
    expect(normalizeScore(150)).toBeCloseTo(1.0, 5);
    expect(normalizeScore(-50)).toBeCloseTo(0.7, 5);
  });
});

describe('decayStaleTrials', () => {
  const now = Date.now();

  const makeTrial = (id, daysAgo, currentScore = 100) => {
    const updates = [];
    return {
      id,
      status: 'recruiting',
      last_verified_at: daysAgo == null ? null : new Date(now - daysAgo * DAY_MS),
      freshness_score: currentScore,
      update: jest.fn(async (patch) => {
        updates.push(patch);
        Object.assign(this || {}, patch);
      }),
      __patches: updates
    };
  };

  beforeEach(() => {
    Trial.findAll.mockReset();
    Trial.update.mockReset();
  });

  test('三档衰减 + 超期自动 close', async () => {
    const fresh = makeTrial('t-fresh', 5, 100);       // <14d，保持 100
    const mid = makeTrial('t-mid', 20, 100);          // 14-30d → 90
    const old = makeTrial('t-old', 45, 100);          // 30-60d → 70
    const stale = makeTrial('t-stale', 70, 100);      // 60d+ → 30 + close
    Trial.findAll.mockResolvedValue([fresh, mid, old, stale]);

    const result = await decayStaleTrials();

    // fresh 本来已经是 100，不需要 update
    expect(fresh.update).not.toHaveBeenCalled();
    // mid / old 应拿到对应档位
    expect(mid.update).toHaveBeenCalledWith(expect.objectContaining({ freshness_score: 90 }));
    expect(old.update).toHaveBeenCalledWith(expect.objectContaining({ freshness_score: 70 }));
    // stale 应被关闭
    expect(stale.update).toHaveBeenCalledWith(expect.objectContaining({
      freshness_score: 30,
      status: 'closed'
    }));

    expect(result.autoClosedIds).toEqual(['t-stale']);
    expect(result.updated).toBe(3);
  });

  test('never-verified trial 走 50 分档位（不触发 close）', async () => {
    const neverVerified = makeTrial('t-new', null, 100);
    Trial.findAll.mockResolvedValue([neverVerified]);
    const result = await decayStaleTrials();
    expect(neverVerified.update).toHaveBeenCalledWith(expect.objectContaining({ freshness_score: 50 }));
    expect(result.autoClosedIds).toEqual([]);
  });
});

describe('markVerified', () => {
  beforeEach(() => {
    Trial.update.mockReset();
    Trial.update.mockResolvedValue([1]);
  });
  test('传 trialId 会把 last_verified_at 刷到 NOW 且 score=100', async () => {
    await markVerified('trial-x');
    expect(Trial.update).toHaveBeenCalledTimes(1);
    const [patch, opts] = Trial.update.mock.calls[0];
    expect(patch.freshness_score).toBe(100);
    expect(patch.last_verified_at).toBeInstanceOf(Date);
    expect(opts.where).toEqual({ id: 'trial-x' });
  });
  test('空 trialId 跳过（保护）', async () => {
    await markVerified(null);
    expect(Trial.update).not.toHaveBeenCalled();
  });
});
