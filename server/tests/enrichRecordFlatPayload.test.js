/**
 * PRD-2026Q4 followup（"补全数据丢失"根因修复）：enrichRecord 契约测试。
 *
 * 修复前：客户端传扁平 parsedData（41 个字段），server 只硬编码读 5 个 key，
 * 其余 37 个静默丢弃 → 用户看到 toast "已保存"但回头病历里没自己填的数据。
 *
 * 本测试锁住的新契约：
 *   1) 扁平 body 顶层任意 key（除 meta keys 外）都会落到 structured.entities
 *   2) 嵌套 body.entities / body.structured.entities 仍然兼容
 *   3) 扁平比嵌套优先（更晚 spread）
 *   4) currentEntities 未被 patch 提到的 key 保留
 *   5) gene_mutation → geneMutation alias 保留
 *   6) meta keys（entities / structured / unknownFields / id 等）不进 entities
 */

const mockFindOne = jest.fn();

jest.mock('../models', () => ({
  MedicalRecord: {
    findOne: (...args) => mockFindOne(...args),
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

const { responseEnvelope } = require('../middleware/responseEnvelope');
const controller = require('../controllers/medical');

const buildRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  responseEnvelope({}, res, () => {});
  return res;
};

const buildRecord = (overrides = {}) => {
  const record = {
    id: 'rec_42',
    diagnosis: '非小细胞肺癌',
    stage: 'IV期',
    gene_mutation: null,
    treatment: null,
    structured: {
      entities: {
        diagnosis: '非小细胞肺癌',
        stage: 'IV期'
      }
    },
    updated_at: new Date('2026-05-01T00:00:00Z'),
    ...overrides
  };
  record.update = jest.fn().mockResolvedValue(undefined);
  return record;
};

describe('medical.enrichRecord — flat-payload contract', () => {
  beforeEach(() => {
    mockFindOne.mockReset();
  });

  test('扁平 body 顶层 key（age/ecog/pathologyType/targetLesion/lab values）全部落到 structured.entities', async () => {
    const record = buildRecord();
    mockFindOne.mockResolvedValue(record);

    await controller.enrichRecord(
      {
        params: { id: 'rec_42' },
        userId: 'user_1',
        body: {
          age: 65,
          ecog: 1,
          pathologyType: '腺癌',
          targetLesion: '有',
          pdL1Status: '阳性',
          hemoglobin: 12.5,
          platelets: 180,
          alt: 22,
          ast: 26,
          hbvStatus: '阴性',
          hcvStatus: '阴性'
        }
      },
      buildRes(),
      jest.fn()
    );

    expect(record.update).toHaveBeenCalledTimes(1);
    const patch = record.update.mock.calls[0][0];
    const entities = patch.structured.entities;
    expect(entities.age).toBe(65);
    expect(entities.ecog).toBe(1);
    expect(entities.pathologyType).toBe('腺癌');
    expect(entities.targetLesion).toBe('有');
    expect(entities.pdL1Status).toBe('阳性');
    expect(entities.hemoglobin).toBe(12.5);
    expect(entities.platelets).toBe(180);
    expect(entities.alt).toBe(22);
    expect(entities.ast).toBe(26);
    expect(entities.hbvStatus).toBe('阴性');
    expect(entities.hcvStatus).toBe('阴性');
  });

  test('扁平 body 同时含 diagnosis/stage 时 → 更新对应 DB 列', async () => {
    const record = buildRecord({ diagnosis: '旧诊断', stage: '旧分期' });
    mockFindOne.mockResolvedValue(record);

    await controller.enrichRecord(
      {
        params: { id: 'rec_42' },
        userId: 'user_1',
        body: { diagnosis: '小细胞肺癌', stage: 'III期', age: 70 }
      },
      buildRes(),
      jest.fn()
    );

    const patch = record.update.mock.calls[0][0];
    expect(patch.diagnosis).toBe('小细胞肺癌');
    expect(patch.stage).toBe('III期');
    expect(patch.structured.entities.age).toBe(70);
  });

  test('原 entities 中未被本次 patch 覆盖的 key 必须保留', async () => {
    const record = buildRecord({
      structured: {
        entities: {
          diagnosis: '非小细胞肺癌',
          stage: 'IV期',
          gender: '男',
          city: '上海'
        }
      }
    });
    mockFindOne.mockResolvedValue(record);

    await controller.enrichRecord(
      {
        params: { id: 'rec_42' },
        userId: 'user_1',
        body: { age: 65 }
      },
      buildRes(),
      jest.fn()
    );

    const entities = record.update.mock.calls[0][0].structured.entities;
    expect(entities.diagnosis).toBe('非小细胞肺癌');
    expect(entities.stage).toBe('IV期');
    expect(entities.gender).toBe('男');
    expect(entities.city).toBe('上海');
    expect(entities.age).toBe(65);
  });

  test('嵌套 body.entities 仍兼容（backward-compat）', async () => {
    const record = buildRecord();
    mockFindOne.mockResolvedValue(record);

    await controller.enrichRecord(
      {
        params: { id: 'rec_42' },
        userId: 'user_1',
        body: { entities: { age: 50, ecog: 0 } }
      },
      buildRes(),
      jest.fn()
    );

    const entities = record.update.mock.calls[0][0].structured.entities;
    expect(entities.age).toBe(50);
    expect(entities.ecog).toBe(0);
  });

  test('扁平 key 优先级高于嵌套（同 key 时扁平覆盖嵌套）', async () => {
    const record = buildRecord();
    mockFindOne.mockResolvedValue(record);

    await controller.enrichRecord(
      {
        params: { id: 'rec_42' },
        userId: 'user_1',
        body: {
          entities: { age: 30 },
          age: 65
        }
      },
      buildRes(),
      jest.fn()
    );

    expect(record.update.mock.calls[0][0].structured.entities.age).toBe(65);
  });

  test('gene_mutation → geneMutation alias 保留', async () => {
    const record = buildRecord();
    mockFindOne.mockResolvedValue(record);

    await controller.enrichRecord(
      {
        params: { id: 'rec_42' },
        userId: 'user_1',
        body: { gene_mutation: 'EGFR L858R' }
      },
      buildRes(),
      jest.fn()
    );

    const patch = record.update.mock.calls[0][0];
    expect(patch.gene_mutation).toBe('EGFR L858R');
    expect(patch.structured.entities.geneMutation).toBe('EGFR L858R');
  });

  test('meta keys（unknownFields / id / recordId / fileId）不会被当成 entity 字段', async () => {
    const record = buildRecord();
    mockFindOne.mockResolvedValue(record);

    await controller.enrichRecord(
      {
        params: { id: 'rec_42' },
        userId: 'user_1',
        body: {
          unknownFields: ['age', 'ecog'],
          id: 'spoofed',
          recordId: 'rec_spoof',
          fileId: 'fid_spoof',
          age: 65
        }
      },
      buildRes(),
      jest.fn()
    );

    const entities = record.update.mock.calls[0][0].structured.entities;
    expect(entities.age).toBe(65);
    expect(entities.unknownFields).toBeUndefined();
    expect(entities.id).toBeUndefined();
    expect(entities.recordId).toBeUndefined();
    expect(entities.fileId).toBeUndefined();
  });

  test('记录不存在 → 404 + 统一 fail 信封；不调 update', async () => {
    mockFindOne.mockResolvedValue(null);
    const res = buildRes();

    await controller.enrichRecord(
      { params: { id: 'rec_missing' }, userId: 'user_1', body: { age: 65 } },
      res,
      jest.fn()
    );

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ code: 404, message: '病历不存在', data: null });
  });

  test('异常走 next（错误中间件）', async () => {
    mockFindOne.mockRejectedValue(new Error('db down'));
    const next = jest.fn();

    await controller.enrichRecord(
      { params: { id: 'rec_42' }, userId: 'user_1', body: { age: 65 } },
      buildRes(),
      next
    );

    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
