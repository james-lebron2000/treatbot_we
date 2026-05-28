const {
  DEFAULT_DOUBAO_TEXT_MODEL,
  DEFAULT_DOUBAO_VISION_MODEL,
  getDoubaoTextModel,
  getDoubaoVisionModel
} = require('../utils/doubaoEnv');

describe('doubaoEnv model selection', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  test('text structuring defaults to Doubao-Seed-2.0-lite API model id', () => {
    delete process.env.ARK_TEXT_MODEL;
    delete process.env.DOUBAO_TEXT_MODEL;
    delete process.env.ARK_VISION_MODEL;
    delete process.env.DOUBAO_MODEL;

    expect(getDoubaoTextModel()).toBe(DEFAULT_DOUBAO_TEXT_MODEL);
  });

  test('legacy DOUBAO_MODEL does not override text structuring default', () => {
    delete process.env.ARK_TEXT_MODEL;
    delete process.env.DOUBAO_TEXT_MODEL;
    process.env.DOUBAO_MODEL = 'legacy-vision-or-pro-model';

    expect(getDoubaoTextModel()).toBe(DEFAULT_DOUBAO_TEXT_MODEL);
    expect(getDoubaoVisionModel()).toBe('legacy-vision-or-pro-model');
  });

  test('explicit text model envs override the default in stable order', () => {
    process.env.DOUBAO_TEXT_MODEL = 'doubao-text-alias';
    expect(getDoubaoTextModel()).toBe('doubao-text-alias');

    process.env.ARK_TEXT_MODEL = 'ark-text-explicit';
    expect(getDoubaoTextModel()).toBe('ark-text-explicit');
  });

  test('vision model keeps vision default independently', () => {
    delete process.env.ARK_VISION_MODEL;
    delete process.env.DOUBAO_MODEL;

    expect(getDoubaoVisionModel()).toBe(DEFAULT_DOUBAO_VISION_MODEL);
  });
});
