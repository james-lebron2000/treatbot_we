// Regression: the CroCompany model MUST declare the CPA billing columns.
// They exist in the DB (scripts/migrate.js) but were missing from the Sequelize
// model, so billing.computeMonthly() read `undefined` for every company →
// unit price 0 and qualified-status mismatch → every monthly bill came out empty.
// billing.test.js mocks CroCompany.findAll with objects that DO carry these
// fields, so it could not catch the gap — this asserts the real model.
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
    // ENUM values surface on attr.values (Sequelize)
    expect(attr.values).toEqual(expect.arrayContaining(['screened', 'enrolled']));
  });
});
