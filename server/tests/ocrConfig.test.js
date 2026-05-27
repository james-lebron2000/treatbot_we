const ocrConfig = require('../utils/ocrConfig');

describe('ocrConfig provider detection', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test('ARK_API_KEY alone enables OCR and reports doubao', () => {
    delete process.env.KIMI_API_KEY;
    delete process.env.OCR_SECRET_ID;
    delete process.env.OCR_SECRET_KEY;
    delete process.env.DOUBAO_API_KEY;
    process.env.ARK_API_KEY = 'ark-test-key';

    expect(ocrConfig.hasDoubaoCredential()).toBe(true);
    expect(ocrConfig.isOcrEnabled()).toBe(true);
    expect(ocrConfig.describeOcrProviders()).toBe('doubao');
  });

  test('DOUBAO_API_KEY alias enables Doubao OCR without ARK_API_KEY', () => {
    delete process.env.ARK_API_KEY;
    delete process.env.KIMI_API_KEY;
    delete process.env.OCR_SECRET_ID;
    delete process.env.OCR_SECRET_KEY;
    process.env.DOUBAO_API_KEY = 'doubao-test-key';

    expect(ocrConfig.hasDoubaoCredential()).toBe(true);
    expect(ocrConfig.isOcrEnabled()).toBe(true);
    expect(ocrConfig.describeOcrProviders()).toBe('doubao');
  });

  test('VOLCENGINE_AK/SK alone enable Volcengine OCRNormal without masquerading as Ark API key', () => {
    delete process.env.ARK_API_KEY;
    delete process.env.DOUBAO_API_KEY;
    delete process.env.KIMI_API_KEY;
    delete process.env.OCR_SECRET_ID;
    delete process.env.OCR_SECRET_KEY;
    process.env.VOLCENGINE_AK = 'volc-ak';
    process.env.VOLCENGINE_SK = 'volc-sk';

    expect(ocrConfig.hasDoubaoCredential()).toBe(false);
    expect(ocrConfig.hasVolcengineOcrCredential()).toBe(true);
    expect(ocrConfig.isOcrEnabled()).toBe(true);
    expect(ocrConfig.describeOcrProviders()).toBe('volcengine_ocr');
  });

  test('no credentials → OCR disabled', () => {
    delete process.env.ARK_API_KEY;
    delete process.env.DOUBAO_API_KEY;
    delete process.env.KIMI_API_KEY;
    delete process.env.OCR_SECRET_ID;
    delete process.env.OCR_SECRET_KEY;
    delete process.env.VOLCENGINE_AK;
    delete process.env.VOLCENGINE_SK;

    expect(ocrConfig.isOcrEnabled()).toBe(false);
    expect(ocrConfig.describeOcrProviders()).toBe('none');
  });
});
