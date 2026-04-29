/**
 * Q3-红线 §A.1.1：piiScrubber 单测。
 * 覆盖：手机号 / 身份证 / 姓名替换；同值幂等；mapping 还原；空输入；超长输入。
 */

const { scrubForLlm, restoreFromLlm } = require('../utils/piiScrubber');

describe('scrubForLlm', () => {
  test('替换手机号、身份证、姓名为占位符', () => {
    const raw = '姓名：张三丰，电话 13812345678，身份证号 110101199003076789，门诊就诊。';
    const { scrubbed, mapping } = scrubForLlm(raw);

    expect(scrubbed).not.toContain('13812345678');
    expect(scrubbed).not.toContain('110101199003076789');
    expect(scrubbed).not.toContain('张三丰');
    expect(scrubbed).toContain('<PHONE_1>');
    expect(scrubbed).toContain('<ID_1>');
    expect(scrubbed).toContain('<NAME_1>');

    // mapping 反向可还原
    expect(mapping['<PHONE_1>']).toBe('13812345678');
    expect(mapping['<ID_1>']).toBe('110101199003076789');
    expect(mapping['<NAME_1>']).toBe('张三丰');
  });

  test('同值幂等：同一手机号多次出现复用同一占位符', () => {
    const raw = '联系电话 13812345678；备用 13812345678；新号 13900001111。';
    const { scrubbed, mapping } = scrubForLlm(raw);

    // 13812345678 出现两次但只占一个 placeholder
    const phone1Count = (scrubbed.match(/<PHONE_1>/g) || []).length;
    expect(phone1Count).toBe(2);
    expect(scrubbed).toContain('<PHONE_2>');
    expect(mapping['<PHONE_1>']).toBe('13812345678');
    expect(mapping['<PHONE_2>']).toBe('13900001111');
  });

  test('restoreFromLlm 在 LLM 输出对象上回填占位符', () => {
    const raw = '姓名：李雷，主诉：肺癌晚期。';
    const { scrubbed, mapping } = scrubForLlm(raw);
    expect(scrubbed).toContain('<NAME_1>');

    // 模拟 LLM 输出（仍带占位符）
    const llmOutput = {
      diagnosis: '肺癌',
      patientName: '<NAME_1>',
      nested: { contact: '<PHONE_1>' }
    };
    // 在测试里手工补一个 PHONE_1 → 验证嵌套字段还原
    mapping['<PHONE_1>'] = '13900000000';

    const restored = restoreFromLlm(llmOutput, mapping);
    expect(restored.patientName).toBe('李雷');
    expect(restored.nested.contact).toBe('13900000000');
    expect(restored.diagnosis).toBe('肺癌');
  });

  test('空输入返回空 scrubbed + 空 mapping', () => {
    expect(scrubForLlm('')).toEqual({ scrubbed: '', mapping: {} });
    expect(scrubForLlm(null)).toEqual({ scrubbed: '', mapping: {} });
    expect(scrubForLlm(undefined)).toEqual({ scrubbed: '', mapping: {} });
  });

  test('超长输入仍可处理且占位符稳定', () => {
    const block = '电话 13800000001，';
    const raw = block.repeat(2000) + ' 末尾电话 13900000002';
    const { scrubbed, mapping } = scrubForLlm(raw);

    expect(scrubbed.length).toBeGreaterThan(0);
    // 第一个手机号反复出现，仍只生成一个 placeholder
    expect(mapping['<PHONE_1>']).toBe('13800000001');
    expect(mapping['<PHONE_2>']).toBe('13900000002');
    // 不应包含原值
    expect(scrubbed.includes('13800000001')).toBe(false);
    expect(scrubbed.includes('13900000002')).toBe(false);
  });

  test('邮箱、银行卡也会被替换', () => {
    const raw = '邮箱 alice@example.com，账号 6222021234567890123 用于退费。';
    const { scrubbed, mapping } = scrubForLlm(raw);
    expect(scrubbed).toContain('<EMAIL_1>');
    expect(scrubbed).toContain('<BANKCARD_1>');
    expect(mapping['<EMAIL_1>']).toBe('alice@example.com');
    expect(mapping['<BANKCARD_1>']).toBe('6222021234567890123');
  });

  test('身份证不会被误识别为银行卡', () => {
    const raw = '身份证 11010119900307678X 备注。';
    const { scrubbed, mapping } = scrubForLlm(raw);
    // 身份证应进 ID 占位符，而不是 BANKCARD
    expect(Object.keys(mapping)).toContain('<ID_1>');
    expect(Object.keys(mapping)).not.toContain('<BANKCARD_1>');
    expect(scrubbed).toContain('<ID_1>');
  });
});
