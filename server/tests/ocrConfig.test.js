const ocrConfig = require('../utils/ocrConfig');

describe('ocrConfig provider detection', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test('ARK_API_KEY alone enables OCR and reports doubao', () => {
    delete process.env.MINIMAX_API_KEY;
    delete process.env.KIMI_API_KEY;
    delete process.env.OCR_SECRET_ID;
    delete process.env.OCR_SECRET_KEY;
    process.env.ARK_API_KEY = 'ark-test-key';

    expect(ocrConfig.hasDoubaoCredential()).toBe(true);
    expect(ocrConfig.isOcrEnabled()).toBe(true);
    expect(ocrConfig.describeOcrProviders()).toBe('doubao');
  });

  test('MiniMax key alone no longer enables production OCR', () => {
    process.env.MINIMAX_API_KEY = 'legacy-minimax-key';
    delete process.env.ARK_API_KEY;
    delete process.env.KIMI_API_KEY;
    delete process.env.OCR_SECRET_ID;
    delete process.env.OCR_SECRET_KEY;

    expect(ocrConfig.isOcrEnabled()).toBe(false);
    expect(ocrConfig.describeOcrProviders()).toBe('none');
  });
});
