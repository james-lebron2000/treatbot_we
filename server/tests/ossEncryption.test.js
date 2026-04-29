/**
 * PRD-2026Q2 §2.2：确保 putObject 必传 SSE=AES256。
 * 用 jest.mock 拦截 cos-nodejs-sdk-v5，专注于参数契约，避免真实网络调用。
 */

const mockPutObject = jest.fn().mockResolvedValue({ ETag: '"mock-etag"' });
const mockGetObject = jest.fn().mockResolvedValue({
  Body: Buffer.from('hello'),
  ContentType: 'image/png',
  ETag: '"mock-etag"',
  headers: { 'x-cos-server-side-encryption': 'AES256' }
});
const mockHeadObject = jest.fn();
const mockPutObjectCopy = jest.fn().mockResolvedValue({ ETag: '"copied"' });

jest.mock('cos-nodejs-sdk-v5', () => {
  return jest.fn().mockImplementation(() => ({
    putObject: mockPutObject,
    getObject: mockGetObject,
    headObject: mockHeadObject,
    putObjectCopy: mockPutObjectCopy,
    getObjectUrl: jest.fn(),
    deleteObject: jest.fn(),
    getCredential: jest.fn()
  }));
});

const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  process.env.COS_SECRET_ID = 'test-id';
  process.env.COS_SECRET_KEY = 'test-key';
  process.env.COS_BUCKET = 'test-bucket-1250000000';
  process.env.COS_REGION = 'ap-shanghai';
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('oss service §2.2 encryption', () => {
  let ossService;

  beforeEach(() => {
    jest.resetModules();
    mockPutObject.mockClear();
    mockGetObject.mockClear();
    mockHeadObject.mockReset();
    mockPutObjectCopy.mockClear();
    ossService = require('../services/oss');
  });

  test('uploadFile 必传 ServerSideEncryption=AES256', async () => {
    const buffer = Buffer.from('payload');
    const key = 'uploads/u1/abc.png';

    await ossService.uploadFile(buffer, key, { contentType: 'image/png' });

    expect(mockPutObject).toHaveBeenCalledTimes(1);
    const args = mockPutObject.mock.calls[0][0];
    expect(args).toMatchObject({
      Bucket: 'test-bucket-1250000000',
      Key: key,
      ServerSideEncryption: 'AES256'
    });
  });

  test('默认 presigned URL TTL = 300s', () => {
    expect(ossService.DEFAULT_PRESIGNED_EXPIRES).toBe(300);
  });

  test('getObjectBuffer 返回 buffer + contentType', async () => {
    const result = await ossService.getObjectBuffer('uploads/u1/x.png');
    expect(result.buffer).toEqual(Buffer.from('hello'));
    expect(result.contentType).toBe('image/png');
    expect(result.encrypted).toBe(true);
  });

  test('ensureObjectEncrypted 已加密 → skipped', async () => {
    mockHeadObject.mockResolvedValueOnce({
      headers: { 'x-cos-server-side-encryption': 'AES256' }
    });
    const result = await ossService.ensureObjectEncrypted('uploads/u1/y.png');
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('already_encrypted');
    expect(mockPutObjectCopy).not.toHaveBeenCalled();
  });

  test('ensureObjectEncrypted 未加密 → putObjectCopy with AES256', async () => {
    mockHeadObject.mockResolvedValueOnce({ headers: {} });
    const result = await ossService.ensureObjectEncrypted('uploads/u1/z.png');
    expect(result.skipped).toBe(false);
    expect(result.encrypted).toBe(true);
    expect(mockPutObjectCopy).toHaveBeenCalledTimes(1);
    const copyArgs = mockPutObjectCopy.mock.calls[0][0];
    expect(copyArgs.ServerSideEncryption).toBe('AES256');
    expect(copyArgs.MetadataDirective).toBe('Copy');
    expect(copyArgs.Key).toBe('uploads/u1/z.png');
  });
});
