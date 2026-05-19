const mockGetObjectUrl = jest.fn(({ Bucket, Region, Key }) =>
  `https://${Bucket}.cos.${Region}.myqcloud.com/${Key}?q-signature=test&x-cos-security-token=tmp-token`
);

const mockCosConstructor = jest.fn(() => ({
  putObject: jest.fn(),
  getObjectUrl: (...args) => mockGetObjectUrl(...args),
  headObject: jest.fn()
}));

const mockGetCredential = jest.fn();

jest.mock('cos-nodejs-sdk-v5', () => mockCosConstructor);
jest.mock('qcloud-cos-sts', () => ({
  getCredential: (...args) => mockGetCredential(...args)
}));
jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

const SAVED_ENV = {
  COS_SECRET_ID: process.env.COS_SECRET_ID,
  COS_SECRET_KEY: process.env.COS_SECRET_KEY,
  COS_BUCKET: process.env.COS_BUCKET,
  COS_REGION: process.env.COS_REGION,
  COS_APPID: process.env.COS_APPID,
  COS_STS_ENDPOINT: process.env.COS_STS_ENDPOINT
};

const restoreEnv = () => {
  for (const [key, value] of Object.entries(SAVED_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

describe('oss STS direct upload credentials', () => {
  beforeEach(() => {
    jest.resetModules();
    mockCosConstructor.mockClear();
    mockGetObjectUrl.mockClear();
    mockGetCredential.mockReset();
    process.env.COS_SECRET_ID = 'secret-id';
    process.env.COS_SECRET_KEY = 'secret-key';
    process.env.COS_BUCKET = 'treatbot-1250000000';
    process.env.COS_REGION = 'ap-shanghai';
    delete process.env.COS_APPID;
    delete process.env.COS_STS_ENDPOINT;
  });

  afterEach(() => {
    restoreEnv();
  });

  test('getSTS uses qcloud-cos-sts instead of COS SDK getCredential and derives appId from bucket', async () => {
    mockGetCredential.mockImplementation((options, cb) => cb(null, {
      startTime: 1700000000,
      expiredTime: 1700001800,
      credentials: {
        tmpSecretId: 'tmp-id',
        tmpSecretKey: 'tmp-key',
        sessionToken: 'tmp-token'
      }
    }));

    const oss = require('../services/oss');
    const result = await oss.getSTS('user-1');

    expect(mockCosConstructor).not.toHaveBeenCalled();
    expect(mockGetCredential).toHaveBeenCalledTimes(1);
    const options = mockGetCredential.mock.calls[0][0];
    expect(options.secretId).toBe('secret-id');
    expect(options.secretKey).toBe('secret-key');
    expect(options.durationSeconds).toBe(1800);
    expect(options.policy.statement[0].principal).toEqual({ qcs: ['*'] });
    expect(options.policy.statement[0].resource).toEqual([
      'qcs::cos:ap-shanghai:uid/1250000000:treatbot-1250000000/uploads/user-1/*'
    ]);
    expect(result.credentials.tmpSecretId).toBe('tmp-id');
  });

  test('getDirectUploadInfo returns derived appId and prebuilt PUT urls', async () => {
    mockGetCredential.mockImplementation((options, cb) => cb(null, {
      startTime: 1700000000,
      expiredTime: 1700001800,
      credentials: {
        tmpSecretId: 'tmp-id',
        tmpSecretKey: 'tmp-key',
        sessionToken: 'tmp-token'
      }
    }));

    const oss = require('../services/oss');
    const result = await oss.getDirectUploadInfo('u42', [
      { originalName: 'report.pdf', mimeType: 'application/pdf' }
    ]);

    expect(result.mode).toBe('cos');
    expect(result.appId).toBe('1250000000');
    expect(result.hostname).toBe('treatbot-1250000000.cos.ap-shanghai.myqcloud.com');
    expect(mockCosConstructor).toHaveBeenCalledWith({
      SecretId: 'tmp-id',
      SecretKey: 'tmp-key',
      SecurityToken: 'tmp-token'
    });
    expect(mockGetObjectUrl).toHaveBeenCalledWith(expect.objectContaining({
      Bucket: 'treatbot-1250000000',
      Region: 'ap-shanghai',
      Method: 'PUT',
      Sign: true
    }));
    expect(result.files).toHaveLength(1);
    expect(result.files[0].fileKey).toMatch(/^uploads\/u42\/.*\.pdf$/);
    expect(result.files[0].putUrl).toContain(`https://${result.hostname}/${result.files[0].fileKey}?`);
    expect(result.files[0].putUrl).toContain('q-signature=test');
    expect(result.files[0].putUrl).toContain('x-cos-security-token=tmp-token');
  });
});
