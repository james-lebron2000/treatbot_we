/**
 * PRD-2026Q4 followup（B6）：runOcrTask 中段取消闸合约
 *
 * 背景：原 Phase 3.1 只在 worker 启动瞬间 + OCR 跑完后做了取消检查；中间 60-180s
 * 的视觉调用 + 流式结构化阶段用户点取消时，要等整段跑完才被识别 —— 体感"卡死"，
 * 且白烧 LLM tokens。
 *
 * 本测试验证 queue.js 的 emit adapter（runOcrTask 内）在 fieldGroup 事件到达时
 * 节流（5s）做一次 assertNotCancelled：取消触发 → 抛 OcrCancelledError → 走
 * cancelled 分支（不写 status='error'、不进 Sentry、不重抛进 Bull DLQ）。
 *
 * mock 模式与 tests/runOcrTaskCancel.test.js 对齐，但把 OCR 主路径换成
 * runStreamingPipeline（PRD-2026Q4 新主路径）而不是老的 processMedicalImage。
 */

const mockFindOne = jest.fn();
const mockUpdate = jest.fn().mockResolvedValue([1]);
const mockRunStreamingPipeline = jest.fn();
const mockNotifyAdd = jest.fn().mockResolvedValue(true);
const mockPublish = jest.fn().mockResolvedValue(true);
const mockCaptureException = jest.fn();

jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    process: jest.fn(),
    add: (...a) => mockNotifyAdd(...a),
    on: jest.fn(),
    setMaxListeners: jest.fn(),
    settings: {}
  }));
});

jest.mock('../models', () => ({
  OcrJobFailure: { create: jest.fn(), findByPk: jest.fn() },
  MedicalRecord: {
    findOne: (...args) => mockFindOne(...args),
    update: (...args) => mockUpdate(...args)
  }
}));

jest.mock('../services/ocrPipeline', () => ({
  runStreamingPipeline: (...args) => mockRunStreamingPipeline(...args)
}));

// ocrCache 不命中（buildUpdateArgsFromPayload 返回 null → 跳过缓存短路）
jest.mock('../services/ocrCache', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  buildUpdateArgsFromPayload: jest.fn(() => null),
  buildPayloadFromResult: jest.fn(() => ({}))
}));

jest.mock('../services/recordEvents', () => ({
  publishRecordEvent: (...a) => mockPublish(...a)
}));

jest.mock('../observability/sentry', () => ({
  captureException: (...a) => mockCaptureException(...a)
}));

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn()
}));

const queueService = require('../services/queue');
const { runOcrTask, OcrCancelledError } = queueService.__testables;

const goodResult = {
  text: '诊断：肺腺癌',
  entities: { diagnosis: '肺腺癌', stage: 'IV' },
  confidence: 0.9,
  detections: [],
  provider: 'doubao',
  pageCount: 1,
  schemaValidated: {}
};

describe('B6: runOcrTask mid-stream cancellation gate', () => {
  beforeEach(() => {
    mockFindOne.mockReset();
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue([1]);
    mockRunStreamingPipeline.mockReset();
    mockPublish.mockClear();
    mockCaptureException.mockClear();
    mockNotifyAdd.mockClear();
  });

  test('emit 期间（≥5s 节流窗后）发现 cancelled_at → 抛 OcrCancelledError → 走 cancelled 分支', async () => {
    // 第 1 次 findOne：入口 assertNotCancelled（未取消）
    // 第 2 次 findOne：emit 内 mid-stream 检查（已取消）
    let n = 0;
    mockFindOne.mockImplementation(async () => {
      n++;
      if (n === 1) return { id: 'rec1', file_hash: null, cancelled_at: null };
      return { id: 'rec1', file_hash: null, cancelled_at: new Date() };
    });

    // pipeline 模拟：先等 5.5s 越过节流窗，再 emit field_group → 触发 mid-stream check
    mockRunStreamingPipeline.mockImplementation(async ({ emit }) => {
      // 节流窗 5000ms —— 等过窗口后再 emit，否则 check 被跳过。
      // 真实场景里，OCR_TEXT/PREPROCESS 在头几秒内发出，FIELD_GROUP 会跨越 5s 阈值；
      // 这里我们 Date.now() 跳跃地模拟"已过节流窗"的状态。
      const realDateNow = Date.now;
      const t0 = realDateNow();
      Date.now = () => t0 + 6000;
      try {
        await emit({ stage: 'field_group', fieldGroup: 'basic', fields: { age: '60' }, progress: 50 });
      } finally {
        Date.now = realDateNow;
      }
      throw new Error('should-have-been-cancelled-mid-stream');
    });

    const result = await runOcrTask({
      recordId: 'rec1',
      imageUrl: 'https://x/y.jpg',
      mimeType: 'image/jpeg',
      fileKey: 'k1',
      userId: 7
    });

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    // 不应写 status='error'
    const errorWrite = mockUpdate.mock.calls.find(
      (c) => c[0] && c[0].status === 'error'
    );
    expect(errorWrite).toBeUndefined();
    // 不应进 Sentry
    expect(mockCaptureException).not.toHaveBeenCalled();
    // 应推 cancelled SSE
    const cancelPub = mockPublish.mock.calls.find(
      (c) => c[1] && c[1].status === 'cancelled'
    );
    expect(cancelPub).toBeDefined();
  });

  test('emit 期间数据库临时错误不应被当作取消（fall-through 继续主流程）', async () => {
    let n = 0;
    mockFindOne.mockImplementation(async () => {
      n++;
      if (n === 1) return { id: 'rec2', file_hash: null, cancelled_at: null };
      // 第二次 emit 内：DB 临时错误（非取消）
      if (n === 2) throw new Error('db_temporary_failure');
      // 第三次：runOcrTask 主路径 post-pipeline assertNotCancelled，未取消
      return { id: 'rec2', file_hash: null, cancelled_at: null };
    });

    mockRunStreamingPipeline.mockImplementation(async ({ emit }) => {
      const realDateNow = Date.now;
      const t0 = realDateNow();
      Date.now = () => t0 + 6000;
      try {
        await emit({ stage: 'field_group', fieldGroup: 'basic', fields: {}, progress: 50 });
      } finally {
        Date.now = realDateNow;
      }
      return goodResult;
    });

    const result = await runOcrTask({
      recordId: 'rec2',
      imageUrl: 'https://x/y.jpg',
      mimeType: 'image/jpeg',
      fileKey: 'k2',
      userId: 7
    });

    expect(result.success).toBe(true);
    expect(result.cancelled).toBeUndefined();
  });

  test('OcrCancelledError 是 emit 路径抛出时也要被识别（双判：instanceof + code）', () => {
    const err = new OcrCancelledError('用户已取消');
    expect(err.code).toBe('OCR_CANCELLED');
    expect(err instanceof OcrCancelledError).toBe(true);
  });
});
