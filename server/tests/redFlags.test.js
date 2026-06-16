const { detectRedFlags, buildSearchableText, normalize } = require('../services/redFlags');

describe('redFlags.detectRedFlags', () => {
  test('空文本 / 无意义输入不报红旗', () => {
    for (const input of [undefined, null, '', '   ', 123]) {
      const r = detectRedFlags(input);
      expect(r.redFlag).toBe(false);
      expect(r.categories).toEqual([]);
      expect(r.advice).toBe('');
    }
  });

  test('普通病历（脑转移/骨转移/咯血/胸腔积液）不误报为急症', () => {
    // 这些在肿瘤患者中很常见，本身不是急症——必须不命中，避免「狼来了」。
    const benign = '右肺腺癌IV期，伴脑转移、骨转移、少量胸腔积液，间断咯血，EGFR 19del';
    const r = detectRedFlags(benign);
    expect(r.redFlag).toBe(false);
  });

  test('紧邻否定/预防写法不误报（无休克 / 排除SVC / 预防肿瘤溶解 / 未见脊髓压迫）', () => {
    expect(detectRedFlags('无休克，生命体征平稳').redFlag).toBe(false);
    expect(detectRedFlags('排除上腔静脉综合征').redFlag).toBe(false);
    expect(detectRedFlags('预防肿瘤溶解综合征，已充分水化').redFlag).toBe(false);
    expect(detectRedFlags('影像未见脊髓压迫').redFlag).toBe(false);
    // 真阳性仍然命中
    expect(detectRedFlags('并发感染性休克').redFlag).toBe(true);
  });

  test('跨子句/远距否定不得抑制真急症（安全：宁可检出）', () => {
    // 「无」否定的是「胸闷」，不是「脊髓压迫」——必须仍报
    expect(detectRedFlags('无胸闷，脊髓压迫').redFlag).toBe(true);
    // 「无明显诱因」后真的出现脊髓压迫——必须仍报
    expect(detectRedFlags('无明显诱因出现脊髓压迫').redFlag).toBe(true);
    // 结构化实体 JSON 里的急症（前面是引号/字段名）也要报
    expect(detectRedFlags('{"complication":"脊髓压迫","note":"无发热"}').redFlag).toBe(true);
    // 「非感染性休克」的「非」是类型限定词，仍是休克——必须报
    expect(detectRedFlags('非感染性休克').redFlag).toBe(true);
  });

  test('脊髓压迫命中', () => {
    const r = detectRedFlags('胸椎转移致脊髓压迫，双下肢无力');
    expect(r.redFlag).toBe(true);
    expect(r.categories.map((c) => c.key)).toContain('spinal_cord_compression');
  });

  test('上腔静脉综合征命中', () => {
    const r = detectRedFlags('纵隔占位，上腔静脉综合征，颜面水肿');
    expect(r.redFlag).toBe(true);
    expect(r.categories.map((c) => c.key)).toContain('svc_syndrome');
  });

  test('粒缺发热 / 脓毒症命中（含英文 sepsis）', () => {
    expect(detectRedFlags('化疗后粒细胞缺乏伴发热').redFlag).toBe(true);
    const en = detectRedFlags('post-chemo febrile neutropenia, suspected sepsis');
    expect(en.redFlag).toBe(true);
    expect(en.categories.map((c) => c.key)).toEqual(
      expect.arrayContaining(['febrile_neutropenia_sepsis'])
    );
  });

  test('大出血命中且返回 advice', () => {
    const r = detectRedFlags('消化道大出血，呕血');
    expect(r.redFlag).toBe(true);
    expect(r.advice).toMatch(/急诊|尽快/);
  });

  test('英文大小写 / 空格不敏感（superior vena cava）', () => {
    const r = detectRedFlags('Superior  Vena   Cava obstruction');
    expect(r.redFlag).toBe(true);
    expect(r.categories.map((c) => c.key)).toContain('svc_syndrome');
  });

  test('多类别同时命中', () => {
    const r = detectRedFlags('感染性休克 合并 弥散性血管内凝血');
    const keys = r.categories.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(['shock', 'dic']));
    expect(r.matchedTerms.length).toBeGreaterThanOrEqual(2);
  });
});

describe('redFlags.buildSearchableText', () => {
  test('容忍缺失字段并拼接结构化实体', () => {
    const records = [
      { diagnosis: '肺腺癌', structured: { entities: { complication: '脊髓压迫' } } },
      null,
      { stage: 'IV期' }
    ];
    const text = buildSearchableText(records);
    expect(text).toContain('肺腺癌');
    expect(text).toContain('脊髓压迫');
    expect(text).toContain('IV期');
    // 端到端：拼出的文本喂给 detect 能命中
    expect(detectRedFlags(text).redFlag).toBe(true);
  });

  test('非数组输入返回空串', () => {
    expect(buildSearchableText(null)).toBe('');
    expect(buildSearchableText(undefined)).toBe('');
  });
});

describe('redFlags.normalize', () => {
  test('去空白并转小写', () => {
    expect(normalize('  Septic  Shock ')).toBe('septicshock');
    expect(normalize(null)).toBe('');
  });
});
