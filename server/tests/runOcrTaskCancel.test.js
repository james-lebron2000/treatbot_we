/**
 * Plan §Phase 3.1：runOcrTask 用户主动取消路径单测。
 *
 * 验证：
 *   1) worker 拉起瞬间 cancelled_at 已存在 → assertNotCancelled 抛 OcrCancelledError
 *      → 不调 processMedicalImage、不写 status='error'、不进 Sentry、不重抛
 *   2) processMedicalImage 跑完后才被取消 → final update 不写 completed，返回 cancelled:true
 *   3) 正常路径（cancelled_at=null）→ 完整完成，与原行为一致
 *   4) cancelled 错误码不被混淆为普通错误（不写 error 状态）
 *
 * 这是 Phase 3.1 的核心安全网：用户按"取消"后，OCR worker 必须停止"花钱"。
 */

const mockFindOne = jest.fn();
const mockUpdate = jest.fn().mockResolvedValue([1]);
const mockProcessImage = jest.fn();
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

jest.mock('../services/ocr', () => ({
  processMedicalImage: (...args) => mockProcessImage(...args)
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

const goodOcrResult = {
  text: '诊断：肺腺癌',
  entities: {
    diagnosis: '肺腺癌', stage: 'IV', geneMutation: 'EGFR L858R',
    treatment: '吉非替尼', treatmentLine: 1, pdl1: '50%'
  },
  confidence: 0.92,
  detections: [],
  provider: 'doubao',
  pageCount: 1
};

describe('runOcrTask §Phase 3.1 用户取消路径', () => {
  beforeEach(() => {
    mockFindOne.mockReset();
    mockUpdate.mockReset(); mockUpdate.mockResolvedValue([1]);
    mockProcessImage.mockReset();
    mockPublish.mockClear();
    mockCaptureException.mockClear();
    mockNotifyAdd.mockClear();
  });

  test('worker 启动瞬间已被取消 → 不调 processMedicalImage，不写 error 状态', async () => {
    // assertNotCancelled 第一次 findOne
    mockFindOne.mockResolvedValueOnce({ cancelled_at: new Date() });

    const ret = await runOcrTask({
      recordId: 'rec_cancel_early',
      imageUrl: 'https://x/y.jpg',
      mimeType: 'image/jpeg',
      fileKey: 'uploads/u1/y.jpg',
      userId: 'u1'
    });

    expect(ret).toEqual({ success: false, recordId: 'rec_cancel_early', cancelled: true });
    expect(mockProcessImage).not.toHaveBeenCalled();
    // 不应写 status='running' 或 status='error'
    expect(mockUpdate).not.toHaveBeenCalled();
    // SSE 推 cancelled
    expect(mockPublish).toHaveBeenCalledWith('rec_cancel_early', expect.objectContaining({ status: 'cancelled' }));
    // 不应上报到 Sentry（取消不是异常）
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  test('processMedicalImage 跑完后才取消 → final update 跳过，OCR 结果丢弃', async () => {
    // 首次 assertNotCancelled：未取消
    mockFindOne.mockResolvedValueOnce({ cancelled_at: null });
    // mockProcessImage 返回有效结果
    mockProcessImage.mockResolvedValueOnce(goodOcrResult);
    // 第二次 assertNotCancelled（OCR 后）：已取消
    mockFindOne.mockResolvedValueOnce({ cancelled_at: new Date() });

    const ret = await runOcrTask({
      recordId: 'rec_cancel_mid',
      imageUrl: 'https://x/y.jpg',
      mimeType: 'image/jpeg',
      fileKey: 'uploads/u1/y.jpg',
      userId: 'u1'
    });

    expect(ret.cancelled).toBe(true);
    // Phase 1.3：worker 启动后会一次性打 (status='running', status_phase='analyzing')；
    // OCR 结束后取消闸提前抛 → structuring 阶段切换不会发生。
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate.mock.calls[0][0]).toEqual({ status: 'running', status_phase: 'analyzing' });
    // 不应有 status='completed' / 'error' 写库
    const allUpdates = mockUpdate.mock.calls.map((c) => c[0].status);
    expect(allUpdates).not.toContain('completed');
    expect(allUpdates).not.toContain('error');
    expect(mockPublish).toHaveBeenCalledWith('rec_cancel_mid', expect.objectContaining({ status: 'cancelled' }));
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  test('未取消 → 正常完成路径不被影响（回归保护）', async () => {
    mockFindOne.mockResolvedValue({ cancelled_at: null });
    mockProcessImage.mockResolvedValueOnce(goodOcrResult);

    const ret = await runOcrTask({
      recordId: 'rec_normal',
      imageUrl: 'https://x/y.jpg',
      mimeType: 'image/jpeg',
      fileKey: 'uploads/u1/y.jpg',
      userId: 'u1'
    });

    expect(ret).toEqual({ success: true, recordId: 'rec_normal' });
    // 一次 status='running'，一次 status='completed' + 字段
    const statuses = mockUpdate.mock.calls.map((c) => c[0].status);
    expect(statuses).toContain('running');
    expect(statuses).toContain('completed');
    // 不应推 cancelled
    const events = mockPublish.mock.calls.map((c) => c[1] && c[1].status);
    expect(events).not.toContain('cancelled');
    expect(events).toContain('completed');
  });

  test('OcrCancelledError 自带 code=OCR_CANCELLED（catch 块识别用）', () => {
    const err = new OcrCancelledError('用户已取消');
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('OCR_CANCELLED');
    expect(err.message).toBe('用户已取消');
  });
});
