/**
 * Plan §Phase 3.3：文件名启发式占位卡规则单测。
 *
 * 测试关注点：
 *   1) 关键词命中按顺序（病理 / CT / 报告 通用兜底）
 *   2) 大小写 + 中文符号兼容
 *   3) PDF 兜底逻辑（无文件名 / 无关键词都给"PDF 报告"）
 *   4) 图片无文件名 / 无关键词 → null（不乱猜）
 *   5) buildPlaceholderHints 合并 + count 正确
 */

const {
  inferFileHint,
  buildPlaceholderHints,
  FILENAME_HINT_RULES
} = require('../../utils/placeholderHints');

describe('inferFileHint §Phase 3.3', () => {
  test('1) 病理报告关键词 → 病理报告', () => {
    expect(inferFileHint({ name: '王某某-病理报告-20260301.jpg', fileType: 'image' }))
      .toEqual({ label: '病理报告' });
    expect(inferFileHint({ name: '活检结果.pdf', fileType: 'pdf' }))
      .toEqual({ label: '病理报告' });
  });

  test('2) CT 大小写都识别', () => {
    expect(inferFileHint({ name: 'ct_chest_2026.png', fileType: 'image' }))
      .toEqual({ label: 'CT 报告' });
    expect(inferFileHint({ name: '胸部CT.jpg', fileType: 'image' }))
      .toEqual({ label: 'CT 报告' });
  });

  test('3) 病理优先于通用「报告」（按规则顺序）', () => {
    // "病理报告.jpg" 既含 "病理" 也含 "报告"，应命中"病理报告"而非"检查报告"
    expect(inferFileHint({ name: '病理报告.jpg', fileType: 'image' }))
      .toEqual({ label: '病理报告' });
  });

  test('4) MRI / 核磁 / 磁共振 → MRI 报告', () => {
    expect(inferFileHint({ name: 'mri_brain.png', fileType: 'image' })).toEqual({ label: 'MRI 报告' });
    expect(inferFileHint({ name: '头颅核磁.jpg', fileType: 'image' })).toEqual({ label: 'MRI 报告' });
    expect(inferFileHint({ name: '磁共振结果.pdf', fileType: 'pdf' })).toEqual({ label: 'MRI 报告' });
  });

  test('5) 基因 / NGS / 测序 → 基因检测报告', () => {
    expect(inferFileHint({ name: 'NGS-2026.pdf', fileType: 'pdf' }))
      .toEqual({ label: '基因检测报告' });
    expect(inferFileHint({ name: '基因检测.png', fileType: 'image' }))
      .toEqual({ label: '基因检测报告' });
  });

  test('6) 通用「报告」兜底', () => {
    expect(inferFileHint({ name: '体检报告.jpg', fileType: 'image' }))
      .toEqual({ label: '检查报告' });
  });

  test('7) PDF 无关键词 → "PDF 报告"', () => {
    expect(inferFileHint({ name: 'doc.pdf', fileType: 'pdf' }))
      .toEqual({ label: 'PDF 报告' });
    expect(inferFileHint({ name: '', fileType: 'pdf' }))
      .toEqual({ label: 'PDF 报告' });
  });

  test('8) 图片无文件名/无关键词 → null（不乱猜）', () => {
    expect(inferFileHint({ name: '', fileType: 'image' })).toBeNull();
    expect(inferFileHint({ name: 'IMG_2026.jpg', fileType: 'image' })).toBeNull();
    expect(inferFileHint({ name: 'foo.png', fileType: 'image' })).toBeNull();
  });

  test('9) 防御：null / undefined → null', () => {
    expect(inferFileHint(null)).toBeNull();
    expect(inferFileHint(undefined)).toBeNull();
  });

  test('10) 规则集合非空（防回归）', () => {
    expect(Array.isArray(FILENAME_HINT_RULES)).toBe(true);
    expect(FILENAME_HINT_RULES.length).toBeGreaterThan(5);
    // 每条规则结构合法
    FILENAME_HINT_RULES.forEach((r) => {
      expect(Array.isArray(r.keywords)).toBe(true);
      expect(typeof r.label).toBe('string');
      expect(r.label.length).toBeGreaterThan(0);
    });
  });
});

describe('buildPlaceholderHints §Phase 3.3', () => {
  test('1) 空数组 / 非数组 → []', () => {
    expect(buildPlaceholderHints([])).toEqual([]);
    expect(buildPlaceholderHints(null)).toEqual([]);
    expect(buildPlaceholderHints(undefined)).toEqual([]);
  });

  test('2) 同 label 合并 + count 累加', () => {
    const files = [
      { name: '病理1.jpg', fileType: 'image', hint: { label: '病理报告' } },
      { name: '病理2.jpg', fileType: 'image', hint: { label: '病理报告' } },
      { name: 'CT.jpg', fileType: 'image', hint: { label: 'CT 报告' } }
    ];
    const result = buildPlaceholderHints(files);
    expect(result).toEqual([
      { label: '病理报告', count: 2 },
      { label: 'CT 报告', count: 1 }
    ]);
  });

  test('3) 没 hint 的文件即时计算（兜底防御）', () => {
    const files = [
      { name: '病理报告.jpg', fileType: 'image' }, // 无 hint，会现场算
      { name: 'IMG_random.jpg', fileType: 'image' } // 无关键词 + 图片 → null，不计入
    ];
    const result = buildPlaceholderHints(files);
    expect(result).toEqual([{ label: '病理报告', count: 1 }]);
  });

  test('4) 全部图片无关键词 → 空（不让用户看到误导卡）', () => {
    const files = [
      { name: 'IMG_001.jpg', fileType: 'image' },
      { name: 'IMG_002.jpg', fileType: 'image' }
    ];
    expect(buildPlaceholderHints(files)).toEqual([]);
  });

  test('5) PDF 无关键词 → 都归 "PDF 报告" 一类', () => {
    const files = [
      { name: 'doc1.pdf', fileType: 'pdf' },
      { name: 'doc2.pdf', fileType: 'pdf' }
    ];
    expect(buildPlaceholderHints(files)).toEqual([{ label: 'PDF 报告', count: 2 }]);
  });
});
