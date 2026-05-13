/**
 * Plan §Phase 3.2：variance-of-Laplacian 纯计算单测。
 *
 * 用合成 RGBA buffer 验证：
 *   1) 全黑/全白图（零方差）→ ~0
 *   2) 高频棋盘格图 → variance >> threshold（典型清晰边缘）
 *   3) 平滑渐变图 → variance < threshold（典型模糊外观）
 *   4) 边界条件：N=2 → 0（无内部像素可算 stencil）
 */

const { computeLaplacianVariance } = require('../../utils/blurAdvisory');

const SIZE = 32;
const BLUR_THRESHOLD = 80;

// 帮工：构造 SIZE×SIZE RGBA buffer，按 (x,y) → 灰度值的回调填充
const buildBuffer = (size, fn) => {
  const buf = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const v = Math.max(0, Math.min(255, Math.round(fn(x, y))));
      const i = (y * size + x) * 4;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
      buf[i + 3] = 255;
    }
  }
  return buf;
};

describe('computeLaplacianVariance §Phase 3.2', () => {
  test('1) 全黑图 → 方差 0（无任何边缘）', () => {
    const buf = buildBuffer(SIZE, () => 0);
    const v = computeLaplacianVariance(buf, SIZE);
    expect(v).toBeCloseTo(0, 6);
  });

  test('2) 全白图 → 方差 0（无任何边缘）', () => {
    const buf = buildBuffer(SIZE, () => 255);
    const v = computeLaplacianVariance(buf, SIZE);
    expect(v).toBeCloseTo(0, 6);
  });

  test('3) 棋盘格高频图（每像素切换 0/255）→ variance 远大于阈值', () => {
    const buf = buildBuffer(SIZE, (x, y) => ((x + y) % 2 === 0 ? 0 : 255));
    const v = computeLaplacianVariance(buf, SIZE);
    // 棋盘格的 Laplacian 值理论上在 ±255×4 量级；方差应为数万到数十万
    expect(v).toBeGreaterThan(BLUR_THRESHOLD * 100);
  });

  test('4) 线性渐变图（典型模糊外观）→ variance < 阈值', () => {
    // 平滑渐变：Laplacian ≡ 0（理想情况），实际有轻微取整噪声但仍远小于 80
    const buf = buildBuffer(SIZE, (x) => (x / (SIZE - 1)) * 255);
    const v = computeLaplacianVariance(buf, SIZE);
    expect(v).toBeLessThan(BLUR_THRESHOLD);
  });

  test('5) N=2 兜底 → 返回 0（无内部像素可参与 stencil）', () => {
    const buf = buildBuffer(2, () => 128);
    const v = computeLaplacianVariance(buf, 2);
    expect(v).toBe(0);
  });

  test('6) buffer 长度不足 → 返回 0（防御传错 size）', () => {
    const buf = new Uint8ClampedArray(16); // 远小于 32×32×4
    const v = computeLaplacianVariance(buf, SIZE);
    expect(v).toBe(0);
  });

  test('7) null/undefined buffer → 0（防御）', () => {
    expect(computeLaplacianVariance(null, SIZE)).toBe(0);
    expect(computeLaplacianVariance(undefined, SIZE)).toBe(0);
  });

  test('8) 棋盘格 vs 渐变 —— sharp / blurry 排序符合预期', () => {
    const sharp = buildBuffer(SIZE, (x, y) => ((x + y) % 2 === 0 ? 0 : 255));
    const blurry = buildBuffer(SIZE, (x) => (x / (SIZE - 1)) * 255);
    const sharpVar = computeLaplacianVariance(sharp, SIZE);
    const blurryVar = computeLaplacianVariance(blurry, SIZE);
    expect(sharpVar).toBeGreaterThan(blurryVar);
  });
});
