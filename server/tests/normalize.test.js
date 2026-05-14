/**
 * PRD-2026Q4 T0-7：normalize 工具单元测试。
 *
 * 覆盖：
 *   - normalizePhone：各种噪声 → 11 位国内号码；非法位数 / 格式错误抛 ValidationError。
 *   - normalizeIdCard：GB 11643-1999 校验位算法；大小写、空格归一化。
 *   - normalizeNctId：trim + 大写归一化；位数错误抛错。
 *   - 抗噪 property：1000 次随机插入空白/连字符 → 归一化结果不变。
 */

const {
  normalizePhone,
  normalizeIdCard,
  normalizeNctId,
  ValidationError
} = require('../utils/normalize');

describe('normalizePhone', () => {
  test('+86 138 0013 8000 → 13800138000', () => {
    expect(normalizePhone('+86 138 0013 8000')).toBe('13800138000');
  });
  test('+8613800138000 → 13800138000', () => {
    expect(normalizePhone('+8613800138000')).toBe('13800138000');
  });
  test('0086 13800138000 → 13800138000', () => {
    expect(normalizePhone('0086 13800138000')).toBe('13800138000');
  });
  test('138-0013-8000 → 13800138000', () => {
    expect(normalizePhone('138-0013-8000')).toBe('13800138000');
  });
  test('原值 13800138000 → 13800138000', () => {
    expect(normalizePhone('13800138000')).toBe('13800138000');
  });
  test('全角空格 138　0013　8000 → 13800138000', () => {
    expect(normalizePhone('138　0013　8000')).toBe('13800138000');
  });
  test('括号 (138)0013-8000 → 13800138000', () => {
    expect(normalizePhone('(138)0013-8000')).toBe('13800138000');
  });
  test('点 138.0013.8000 → 13800138000', () => {
    expect(normalizePhone('138.0013.8000')).toBe('13800138000');
  });
  test('12345 抛 ValidationError', () => {
    expect(() => normalizePhone('12345')).toThrow(ValidationError);
    try { normalizePhone('12345'); } catch (e) {
      expect(e.code).toBe('PHONE_INVALID');
      expect(e.statusCode).toBe(422);
    }
  });
  test('15012345（位数不够）抛', () => {
    expect(() => normalizePhone('15012345')).toThrow(ValidationError);
  });
  test('null / undefined → null', () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
  test('非字符串抛', () => {
    expect(() => normalizePhone(13800138000)).toThrow(ValidationError);
  });
  test('1 段错误：12800138000（第二位 2）抛', () => {
    expect(() => normalizePhone('12800138000')).toThrow(ValidationError);
  });
});

describe('normalizeIdCard', () => {
  // 校验过的 18 位身份证（最后位为 X 与数字两组）
  const VALID_DIGIT = '110101199003076798'; // 校验位 = 8
  const VALID_X = '11010119900307678X';     // 校验位 = X

  test('校验位正确（数字结尾）→ 返回大写', () => {
    expect(normalizeIdCard(VALID_DIGIT)).toBe(VALID_DIGIT);
  });
  test('校验位正确（X 结尾，传入小写 x）→ 返回大写', () => {
    expect(normalizeIdCard(VALID_X.toLowerCase())).toBe(VALID_X);
  });
  test('校验位错误 → 抛 ID_CARD_CHECKSUM_INVALID', () => {
    // 把最后位从 8 改成 1，校验位必错
    const bad = VALID_DIGIT.slice(0, 17) + '1';
    expect(() => normalizeIdCard(bad)).toThrow(ValidationError);
    try { normalizeIdCard(bad); } catch (e) {
      expect(e.code).toBe('ID_CARD_CHECKSUM_INVALID');
    }
  });
  test('17 位校验位 X → 通过', () => {
    expect(normalizeIdCard(VALID_X)).toBe(VALID_X);
  });
  test('含空格大小写混合 → 通过', () => {
    expect(normalizeIdCard(`  ${VALID_X.toLowerCase()}  `)).toBe(VALID_X);
  });
  test('15 位旧身份证 → 抛格式错误', () => {
    expect(() => normalizeIdCard('110101900307123')).toThrow(ValidationError);
  });
  test('字母在中段 → 抛格式错误', () => {
    expect(() => normalizeIdCard('11010119900A076798')).toThrow(ValidationError);
  });
  test('null / undefined → null', () => {
    expect(normalizeIdCard(null)).toBeNull();
    expect(normalizeIdCard(undefined)).toBeNull();
  });
});

describe('normalizeNctId', () => {
  test('nct00000001 → NCT00000001', () => {
    expect(normalizeNctId('nct00000001')).toBe('NCT00000001');
  });
  test('NCT 00000001（中间空格）→ NCT00000001', () => {
    expect(normalizeNctId('NCT 00000001')).toBe('NCT00000001');
  });
  test('NCT00000001\\n（含换行）→ 归一化层去空白通过', () => {
    expect(normalizeNctId('NCT00000001\n')).toBe('NCT00000001');
  });
  test('NCT0000001（7 位）抛', () => {
    expect(() => normalizeNctId('NCT0000001')).toThrow(ValidationError);
    try { normalizeNctId('NCT0000001'); } catch (e) {
      expect(e.code).toBe('NCT_FORMAT_INVALID');
    }
  });
  test('NCT123456789（9 位）抛', () => {
    expect(() => normalizeNctId('NCT123456789')).toThrow(ValidationError);
  });
  test('XCT00000001（前缀错）抛', () => {
    expect(() => normalizeNctId('XCT00000001')).toThrow(ValidationError);
  });
  test('null / undefined → null', () => {
    expect(normalizeNctId(null)).toBeNull();
    expect(normalizeNctId(undefined)).toBeNull();
  });
  test('错误信息含原值（不暴露正则）', () => {
    try { normalizeNctId('bad-value'); } catch (e) {
      expect(e.message).toContain('bad-value');
      expect(e.message).not.toMatch(/\^|\$/);
    }
  });
});

describe('property-based 抗噪：1000 次随机插入分隔符', () => {
  // 项目无 fast-check 依赖，使用普通循环 + Math.random 作 property check
  const SEPARATORS = [' ', '　', '-', '(', ')', '.'];
  const insertNoise = (s) => {
    let out = '';
    for (const ch of s) {
      // 30% 概率前置一个分隔符
      if (Math.random() < 0.3) {
        out += SEPARATORS[Math.floor(Math.random() * SEPARATORS.length)];
      }
      out += ch;
    }
    return out;
  };

  test('随机噪声 phone 归一化 → 等于无噪声版本', () => {
    const base = '13800138000';
    for (let i = 0; i < 1000; i++) {
      const noisy = insertNoise(base);
      expect(normalizePhone(noisy)).toBe(base);
    }
  });

  test('+86 前缀 + 随机噪声 → 剥前缀返回 11 位', () => {
    const base = '13912345678';
    for (let i = 0; i < 200; i++) {
      const noisy = '+86' + insertNoise(base);
      expect(normalizePhone(noisy)).toBe(base);
    }
  });
});
