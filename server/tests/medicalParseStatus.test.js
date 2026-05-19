/**
 * Plan §Phase 1.3：mapParseStatus(status, statusPhase) → (status, progress) 分发逻辑单测。
 *
 * 为什么必须有这个测试：
 *   - 旧版本只有 4 个广义 status（pending / running / completed / error），用户在 1% 静默 10–20s。
 *   - Phase 1.3 引入 status_phase: queued / analyzing / streaming / structuring，
 *     客户端 STATUS_TEXT_MAP 完全依赖这个映射的稳定性挑文案。
 *   - 一旦 server 端误把 status_phase='queued' 映射成 65% / 'analyzing'，
 *     用户会看到"找诊断、分期…"但实际还在 Bull 队列里 → 体验比之前更差。
 *
 * 这里只测纯函数 mapParseStatus；buildParseStatusEntry 的字段透出有
 *   medicalSoftDelete.test.js 已覆盖的同类断言模式作为参考，无需重复。
 */

jest.mock('../models', () => ({
  MedicalRecord: {
    findOne: jest.fn(),
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    create: jest.fn(),
    count: jest.fn()
  },
  Trial: { findAll: jest.fn().mockResolvedValue([]) }
}));
jest.mock('../services/oss', () => ({
  calculateMD5: jest.fn(),
  getInternalUrl: jest.fn(),
  generateKey: jest.fn(),
  uploadFile: jest.fn(),
  getRequestAwareUrl: jest.fn(),
  getObjectBuffer: jest.fn(),
  deleteFile: jest.fn()
}));
jest.mock('../services/queue', () => ({ addOCRTask: jest.fn() }));
jest.mock('../services/matchEngine', () => ({ scoreRecordAgainstTrial: () => ({ score: 0 }) }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const { MedicalRecord } = require('../models');
const {
  getParseStatusBatch,
  __mapParseStatus: mapParseStatus,
  __buildParseStatusEntry: buildParseStatusEntry
} = require('../controllers/medical');

describe('Phase 1.3 mapParseStatus dispatch', () => {
  describe('terminal states short-circuit (status_phase 不应影响)', () => {
    test('status=completed → (completed, 100) 无视任何残留 status_phase', () => {
      expect(mapParseStatus('completed', null)).toEqual({ status: 'completed', progress: 100 });
      expect(mapParseStatus('completed', 'analyzing')).toEqual({ status: 'completed', progress: 100 });
      expect(mapParseStatus('completed', 'streaming')).toEqual({ status: 'completed', progress: 100 });
    });

    test('status=error → (error, 0) 无视任何残留 status_phase', () => {
      expect(mapParseStatus('error', null)).toEqual({ status: 'error', progress: 0 });
      expect(mapParseStatus('error', 'analyzing')).toEqual({ status: 'error', progress: 0 });
    });
  });

  describe('status=running 中段', () => {
    test('queued → (parsing, 25) — Bull 已收等 worker', () => {
      expect(mapParseStatus('running', 'queued')).toEqual({ status: 'parsing', progress: 25 });
    });

    test('analyzing → (analyzing, 55) — LLM 调用中', () => {
      expect(mapParseStatus('running', 'analyzing')).toEqual({ status: 'analyzing', progress: 55 });
    });

    test('streaming → (analyzing, 75) — 流式拿到部分字段', () => {
      // streaming 仍归到 broad 'analyzing' 以兼容老客户端的 COMPLETED_STATUSES/ERROR_STATUSES 检查；
      // 客户端通过 statusPhase 透传字段挑准 STATUS_TEXT_MAP['streaming'] 文案。
      expect(mapParseStatus('running', 'streaming')).toEqual({ status: 'analyzing', progress: 75 });
    });

    test('structuring → (structuring, 90) — schema 校验/合并', () => {
      expect(mapParseStatus('running', 'structuring')).toEqual({ status: 'structuring', progress: 90 });
    });

    test('running 但无 status_phase（旧记录）→ (analyzing, 65) 兼容档', () => {
      expect(mapParseStatus('running', null)).toEqual({ status: 'analyzing', progress: 65 });
      expect(mapParseStatus('running', undefined)).toEqual({ status: 'analyzing', progress: 65 });
      expect(mapParseStatus('running', '')).toEqual({ status: 'analyzing', progress: 65 });
    });

    test('running + 未识别的 status_phase → 兼容档 (analyzing, 65)，永远不抛', () => {
      // 防御性：如果将来谁加了新枚举忘了同步这里，至少不爆。
      expect(mapParseStatus('running', 'unknown_phase')).toEqual({ status: 'analyzing', progress: 65 });
    });
  });

  describe('pending / 兜底', () => {
    test('status=pending 无 status_phase → (parsing, 25)', () => {
      expect(mapParseStatus('pending', null)).toEqual({ status: 'parsing', progress: 25 });
    });

    test('status=pending + status_phase=queued → (parsing, 25)', () => {
      // Phase 1.3 实际上 queue.js 在 pending → queued 切换时会把 status 也升到 'running'，
      // 但保留这个 case 是怕 pre-写入和 status update 之间有竞态：客户端拉到中间态也别错文案。
      expect(mapParseStatus('pending', 'queued')).toEqual({ status: 'parsing', progress: 25 });
    });

    test('status=空 → 兜底 (parsing, 25)', () => {
      expect(mapParseStatus(null, null)).toEqual({ status: 'parsing', progress: 25 });
      expect(mapParseStatus(undefined, undefined)).toEqual({ status: 'parsing', progress: 25 });
    });
  });

  describe('progress 阈值与客户端 STATUS_TEXT_MAP minProgress 不交叉', () => {
    // 防回归：客户端 pages/upload/upload.js STATUS_TEXT_MAP 的 minProgress 是
    //   queued: 22, parsing: 28, analyzing: 58, streaming: 72, structuring: 82, completed: 100
    // 服务端给的 progress 必须 ≥ 客户端阈值才不会被卡在更低档；这里抽几个关键档位 sanity check。
    test('queued 的 25% ≥ 客户端 queued.minProgress(22)', () => {
      expect(mapParseStatus('running', 'queued').progress).toBeGreaterThanOrEqual(22);
    });
    test('analyzing 的 55% < 客户端 analyzing.minProgress(58) — 可接受，pollProgress 会拉满', () => {
      // 这里特意留 3 点 buffer：服务端进度只是 minProgress 的下界提示，
      // 客户端 setProgressTarget 会插值到 minProgress 之上（pollProgress 内部约定）。
      expect(mapParseStatus('running', 'analyzing').progress).toBeGreaterThan(25);
    });
    test('structuring 的 90% ≥ 客户端 structuring.minProgress(82)', () => {
      expect(mapParseStatus('running', 'structuring').progress).toBeGreaterThanOrEqual(82);
    });
    test('completed 的 100% = 客户端 completed.minProgress(100)', () => {
      expect(mapParseStatus('completed', null).progress).toBe(100);
    });
  });
});

describe('Phase 1.3 buildParseStatusEntry 透传 statusPhase', () => {
  test('record 上有 status_phase → entry.statusPhase 透传', () => {
    const record = {
      id: 'rec-1',
      status: 'running',
      status_phase: 'analyzing',
      structured: null,
      created_at: new Date('2026-05-08T10:00:00Z'),
      updated_at: new Date('2026-05-08T10:00:30Z')
    };
    const entry = buildParseStatusEntry(record);
    expect(entry.statusPhase).toBe('analyzing');
    expect(entry.status).toBe('analyzing');
    expect(entry.progress).toBe(55);
    expect(entry.recordId).toBe('rec-1');
    expect(entry.fileId).toBe('rec-1');
  });

  test('record 上无 status_phase → entry.statusPhase=null（不漏字段）', () => {
    const record = {
      id: 'rec-2',
      status: 'pending',
      status_phase: null,
      structured: null,
      created_at: new Date(),
      updated_at: new Date()
    };
    const entry = buildParseStatusEntry(record);
    expect(entry.statusPhase).toBeNull();
    expect(entry.status).toBe('parsing');
    expect(entry.progress).toBe(25);
  });

  test('completed 记录 status_phase 应被 status 短路覆盖（终态优先）', () => {
    const record = {
      id: 'rec-3',
      status: 'completed',
      status_phase: 'streaming', // 假装残留了
      structured: {
        text: '这是一段原始识别文本',
        confidence: 0.82,
        entities: {
          diagnosis: '肺腺癌',
          age: 65,
          pathologyType: '腺癌',
          geneMutation: 'EGFR 19del',
          labValues: { ALT: { value: 35, unit: 'U/L' } },
          treatmentHistory: [{ name: '奥希替尼', response: 'PR' }]
        }
      },
      diagnosis: '肺腺癌',
      stage: 'IV',
      gene_mutation: 'EGFR L858R',
      treatment: '奥希替尼',
      file_url: null,
      created_at: new Date(),
      updated_at: new Date()
    };
    const entry = buildParseStatusEntry(record);
    expect(entry.status).toBe('completed');
    expect(entry.progress).toBe(100);
    // statusPhase 字段虽然透回 'streaming' 但客户端 STATUS_TEXT_MAP 优先级低于 status='completed' 的 step 跳转
    expect(entry.statusPhase).toBe('streaming');
    expect(entry.result).toBeTruthy();
    expect(entry.result.diagnosis).toBe('肺腺癌');
    expect(entry.result.stage).toBe('IV');
    expect(entry.result.geneMutation).toBe('EGFR 19del');
    expect(entry.result.treatment).toBe('奥希替尼');
    expect(entry.result.age).toBe(65);
    expect(entry.result.pathologyType).toBe('腺癌');
    expect(entry.result.labValues.ALT.value).toBe(35);
    expect(entry.result.treatmentHistory[0].name).toBe('奥希替尼');
    expect(entry.result.confidence).toBe(0.82);
    expect(entry.result.rawText).toBe('这是一段原始识别文本');
  });
});

describe('parse-status-batch result shape', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('completed entry preserves full structured.entities fields', async () => {
    MedicalRecord.findAll.mockResolvedValue([
      {
        id: 'rec-batch-1',
        status: 'completed',
        status_phase: null,
        diagnosis: '肺腺癌',
        stage: 'IV期',
        gene_mutation: 'EGFR L858R',
        treatment: '奥希替尼',
        structured: {
          text: '原始识别文本',
          confidence: 0.91,
          entities: {
            diagnosis: '肺腺癌',
            age: 61,
            pathologyType: '腺癌',
            molecular: { drivers: [{ gene: 'EGFR', variant: 'L858R' }] },
            imaging: [{ modality: 'CT', findings: '肺部占位' }]
          }
        },
        created_at: new Date('2026-05-08T10:00:00Z'),
        updated_at: new Date('2026-05-08T10:00:30Z')
      }
    ]);

    const req = {
      method: 'GET',
      query: { fileIds: 'rec-batch-1' },
      userId: 'u1'
    };
    const res = {
      json: jest.fn()
    };
    const next = jest.fn();

    await getParseStatusBatch(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const payload = res.json.mock.calls[0][0];
    const result = payload.data.entries[0].result;
    expect(result.diagnosis).toBe('肺腺癌');
    expect(result.stage).toBe('IV期');
    expect(result.geneMutation).toBe('EGFR L858R');
    expect(result.age).toBe(61);
    expect(result.pathologyType).toBe('腺癌');
    expect(result.molecular.drivers[0].gene).toBe('EGFR');
    expect(result.imaging[0].modality).toBe('CT');
    expect(result.confidence).toBe(0.91);
  });
});
