// Regression: the CroCompany model MUST declare the CPA billing columns.
// They exist in the DB (migrate.js) but were missing from the Sequelize model,
// so billing.computeMonthly() read undefined for every company → unit price 0 and
// qualified-status mismatch → every monthly bill came out empty. The mock-based
// billing.test.js injects these fields so it can't catch the gap — this asserts
// the real model.
const { CroCompany } = require('../models');

describe('CroCompany CPA billing attributes', () => {
  test('model declares cpa_price (else computeMonthly bills everyone 0)', () => {
    expect(CroCompany.rawAttributes.cpa_price).toBeDefined();
  });

  test('model declares cpa_qualified_status', () => {
    expect(CroCompany.rawAttributes.cpa_qualified_status).toBeDefined();
  });

  test('cpa_qualified_status is constrained to screened/enrolled', () => {
    const attr = CroCompany.rawAttributes.cpa_qualified_status;
    expect(attr.values).toEqual(expect.arrayContaining(['screened', 'enrolled']));
  });
});
