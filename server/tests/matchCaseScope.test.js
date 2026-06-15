// Patient-safety: trial matching must be scoped to ONE patient (case), never
// merge records across patients in the same account. See match.js
// getUserCompletedRecords / resolveMatchCaseId.
jest.mock('../models', () => ({
  Trial: {},
  MedicalRecord: { findAll: jest.fn().mockResolvedValue([]) }
}));
jest.mock('../services/medicalCaseService', () => ({ listCases: jest.fn() }));

const { getUserCompletedRecords, resolveMatchCaseId } = require('../controllers/match');
const { MedicalRecord } = require('../models');
const caseSvc = require('../services/medicalCaseService');

describe('matching is scoped per patient/case (cross-patient contamination guard)', () => {
  beforeEach(() => {
    MedicalRecord.findAll.mockClear();
    caseSvc.listCases.mockReset();
  });

  test('getUserCompletedRecords filters by case_id when a caseId is given', async () => {
    await getUserCompletedRecords('u1', 'case_A');
    expect(MedicalRecord.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          user_id: 'u1', status: 'completed', deleted_at: null, case_id: 'case_A'
        })
      })
    );
  });

  test('getUserCompletedRecords does NOT filter by case_id when caseId is null (back-compat)', async () => {
    await getUserCompletedRecords('u1', null);
    const arg = MedicalRecord.findAll.mock.calls[0][0];
    expect(arg.where).not.toHaveProperty('case_id');
  });

  test('resolveMatchCaseId honors an explicit caseId without touching the DB', async () => {
    expect(await resolveMatchCaseId('u1', 'case_X')).toBe('case_X');
    expect(caseSvc.listCases).not.toHaveBeenCalled();
  });

  test('resolveMatchCaseId returns null for a single-patient account (no-op today)', async () => {
    caseSvc.listCases.mockResolvedValue([{ id: 'c1', status: 'active' }]);
    expect(await resolveMatchCaseId('u1', '')).toBeNull();
  });

  test('resolveMatchCaseId isolates to the active case when the account has >1 patient', async () => {
    caseSvc.listCases.mockResolvedValue([
      { id: 'c1', status: 'archived' },
      { id: 'c2', status: 'active' }
    ]);
    expect(await resolveMatchCaseId('u1', '')).toBe('c2');
  });

  test('resolveMatchCaseId falls back to null if case lookup throws (never blocks matching)', async () => {
    caseSvc.listCases.mockRejectedValue(new Error('redis down'));
    expect(await resolveMatchCaseId('u1', '')).toBeNull();
  });
});
