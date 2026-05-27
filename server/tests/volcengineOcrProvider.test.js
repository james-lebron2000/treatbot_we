const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');

jest.mock('axios');

describe('Volcengine OCRNormal provider', () => {
  const ORIGINAL_ENV = { ...process.env };
  const uploadDir = path.join(__dirname, '..', 'uploads', '__tests__');
  const sampleKey = '__tests__/volcengine-sample.jpg';
  let ocr;

  beforeAll(async () => {
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, 'volcengine-sample.jpg'), Buffer.from('fake-image'));
    ocr = require('../services/ocr');
  });

  afterAll(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.ARK_API_KEY;
    delete process.env.DOUBAO_API_KEY;
    delete process.env.KIMI_API_KEY;
    delete process.env.OCR_SECRET_ID;
    delete process.env.OCR_SECRET_KEY;
    process.env.VOLCENGINE_AK = 'volc-test-ak';
    process.env.VOLCENGINE_SK = 'volc-test-sk';
    process.env.OCR_PROVIDER = 'volcengine_ocr';
    axios.post.mockResolvedValue({
      status: 200,
      data: {
        code: 10000,
        message: 'Success',
        data: {
          line_texts: ['诊断：直肠癌', 'IV期', 'EGFR 野生型', '既往化疗2周期'],
          line_probs: [0.99, 0.98, 0.97, 0.96],
          line_rects: [[0, 0, 100, 20], [0, 20, 80, 40]],
          chars: ['诊', '断']
        }
      }
    });
  });

  test('requestVolcengineOcrText signs form-urlencoded OCRNormal request and normalizes line text', async () => {
    const result = await ocr.requestVolcengineOcrText({
      imageDataUrl: 'data:image/jpeg;base64,ZmFrZS1pbWFnZQ=='
    });

    expect(result.provider).toBe('volcengine_ocr');
    expect(result.text).toContain('诊断：直肠癌');
    expect(result.providerMeta.lineCount).toBe(4);
    expect(result.confidence).toBeGreaterThan(0.95);

    const [url, body, requestOptions] = axios.post.mock.calls[0];
    expect(url).toBe('https://visual.volcengineapi.com/');
    expect(body).toBeInstanceOf(URLSearchParams);
    expect(body.get('image_base64')).toBe('ZmFrZS1pbWFnZQ==');
    expect(requestOptions.params).toEqual({ Action: 'OCRNormal', Version: '2020-08-26' });
    expect(requestOptions.headers.Authorization).toMatch(/^HMAC-SHA256 Credential=volc-test-ak\//);
    expect(requestOptions.headers['X-Date']).toBeTruthy();
    expect(requestOptions.headers['X-Content-Sha256']).toBeTruthy();
    expect(requestOptions.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  test('recognizeGeneral uses Volcengine OCRNormal first and falls back to rule structuring without LLM keys', async () => {
    const result = await ocr.recognizeGeneral({
      fileKey: sampleKey,
      mimeType: 'image/jpeg'
    });

    expect(result.provider).toBe('volcengine_ocr+rule');
    expect(result.text).toContain('既往化疗2周期');
    expect(result.entities.diagnosis).toBe('直肠癌');
    expect(result.entities.stage).toBe('IV期');
    expect(result.entities.geneMutation).toMatch(/EGFR/i);
    expect(axios.post).toHaveBeenCalledTimes(1);
  });

  test('processMedicalImage preserves deferred providerMeta for streaming pipeline', async () => {
    const result = await ocr.processMedicalImage({
      fileKey: sampleKey,
      mimeType: 'image/jpeg'
    }, { deferTextStructuring: true });

    expect(result.provider).toBe('volcengine_ocr+raw_text');
    expect(result.providerMeta.deferredStructuring).toBe(true);
    expect(result.providerMeta.lineCount).toBe(4);
    expect(result.text).toContain('诊断：直肠癌');
  });
});
