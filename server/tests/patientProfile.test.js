/**
 * patientProfile 富化字段单测（PRD-2026Q2 灯塔癌症导航报告 12 节）
 *
 * 验证：
 *  - emptyProfile() 包含所有富化默认字段；
 *  - buildProfile() 把 record.structured.entities 中的富化字段汇入 profile；
 *  - generatePatientSummary() 在新字段存在时附加对应叙事段落。
 */

const { buildProfile, emptyProfile, generatePatientSummary } = require('../services/patientProfile');

describe('patientProfile 富化字段', () => {
  test('emptyProfile 包含富化字段默认值', () => {
    const p = emptyProfile();
    expect(p).toHaveProperty('tnmStage', null);
    expect(p).toHaveProperty('pathologyType', null);
    expect(p).toHaveProperty('sex', null);
    expect(p).toHaveProperty('hospital', null);
    expect(p).toHaveProperty('diagnosisDate', null);
    expect(p.metastasisSites).toEqual([]);
    expect(p.surgicalHistory).toEqual([]);
    expect(p.timeline).toEqual([]);
    expect(p.molecular).toEqual({
      drivers: [],
      actionable: [],
      lossOfFunction: [],
      vus: [],
      biomarkers: {},
      drugMetabolism: []
    });
    expect(p.organoidDrugSensitivity).toEqual({ sensitive: [], resistant: [] });
    expect(p.imaging).toEqual([]);
    expect(p.tumorMarkers).toEqual([]);
    expect(p.treatmentHistory).toEqual([]);
  });

  test('buildProfile 合并富化字段（单条记录）', () => {
    const records = [{
      diagnosis: '肝细胞癌',
      updated_at: '2026-04-01',
      structured: {
        entities: {
          diagnosis: '肝细胞癌',
          tnmStage: 'T3N1M1',
          pathologyType: '中-低分化腺癌',
          sex: '男',
          hospital: '华东某三甲',
          diagnosisDate: '2025-12-15',
          metastasisSites: ['肝内多发', '肺转移'],
          molecular: {
            drivers: [{ gene: 'TP53', variant: 'R175H', impact: 'loss' }],
            actionable: [{ gene: 'PIK3CA', variant: 'E545K' }],
            biomarkers: { tmb: '12 mut/Mb', msi: 'MSS', pdl1: 'CPS 5', her2: 'IHC 1+' }
          },
          tumorMarkers: [{ name: 'AFP', value: 1280, unit: 'ng/mL', flag: 'H' }],
          treatmentHistory: [
            { name: '仑伐替尼', startDate: '2026-01', endDate: '2026-03', response: 'PD' }
          ],
          imaging: [{ date: '2026-04-01', modality: 'CT', findings: '肝内多发占位' }]
        }
      }
    }];

    const { structuredProfile, patientSummary } = buildProfile(records);
    expect(structuredProfile.tnmStage).toBe('T3N1M1');
    expect(structuredProfile.pathologyType).toBe('中-低分化腺癌');
    expect(structuredProfile.sex).toBe('男');
    expect(structuredProfile.hospital).toBe('华东某三甲');
    expect(structuredProfile.diagnosisDate).toBe('2025-12-15');
    expect(structuredProfile.metastasisSites).toEqual(['肝内多发', '肺转移']);
    expect(structuredProfile.molecular.drivers).toHaveLength(1);
    expect(structuredProfile.molecular.drivers[0].gene).toBe('TP53');
    expect(structuredProfile.molecular.actionable[0].gene).toBe('PIK3CA');
    expect(structuredProfile.molecular.biomarkers.tmb).toBe('12 mut/Mb');
    expect(structuredProfile.molecular.biomarkers.pdl1).toBe('CPS 5');
    expect(structuredProfile.tumorMarkers).toHaveLength(1);
    expect(structuredProfile.treatmentHistory).toHaveLength(1);
    expect(structuredProfile.imaging).toHaveLength(1);

    // summary 包含关键短语
    expect(patientSummary).toMatch(/转移部位/);
    expect(patientSummary).toMatch(/驱动变异.*TP53/);
    expect(patientSummary).toMatch(/可用药变异.*PIK3CA/);
    expect(patientSummary).toMatch(/生物标志物/);
    expect(patientSummary).toMatch(/肿瘤标志物.*AFP/);
    expect(patientSummary).toMatch(/TNM分期：T3N1M1/);
  });

  test('buildProfile 多条记录：drivers 按 gene+variant 去重', () => {
    const records = [
      {
        updated_at: '2026-04-10',
        structured: { entities: { molecular: { drivers: [{ gene: 'TP53', variant: 'R175H' }] } } }
      },
      {
        updated_at: '2026-03-01',
        structured: { entities: { molecular: { drivers: [{ gene: 'TP53', variant: 'R175H' }, { gene: 'KRAS', variant: 'G12C' }] } } }
      }
    ];
    const { structuredProfile } = buildProfile(records);
    // R175H 重复一次 → 仍只保留一条；KRAS G12C 加入
    const drivers = structuredProfile.molecular.drivers;
    expect(drivers).toHaveLength(2);
    const genes = drivers.map((d) => d.gene).sort();
    expect(genes).toEqual(['KRAS', 'TP53']);
  });

  test('generatePatientSummary 无富化字段时仍输出基础信息', () => {
    const p = emptyProfile();
    p.diagnosis = '肺腺癌';
    p.age = 60;
    const s = generatePatientSummary(p);
    expect(s).toMatch(/60岁患者/);
    expect(s).toMatch(/肺腺癌/);
    // 不应抛错也不应包含未填充段
    expect(s).not.toMatch(/转移部位/);
    expect(s).not.toMatch(/驱动变异/);
  });

  test('organoidDrugSensitivity 合并 sensitive/resistant', () => {
    const records = [{
      structured: {
        entities: {
          organoidDrugSensitivity: { sensitive: ['仑伐替尼', '索拉非尼'], resistant: ['卡铂'] }
        }
      }
    }, {
      structured: {
        entities: {
          organoidDrugSensitivity: { sensitive: ['索拉非尼'], resistant: ['顺铂'] }
        }
      }
    }];
    const { structuredProfile } = buildProfile(records);
    expect(structuredProfile.organoidDrugSensitivity.sensitive.sort()).toEqual(['仑伐替尼', '索拉非尼']);
    expect(structuredProfile.organoidDrugSensitivity.resistant.sort()).toEqual(['卡铂', '顺铂']);
  });
});
