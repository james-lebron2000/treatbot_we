/**
 * PRD-2026Q2 §3.3：res.ok / res.fail / res.paginated 形状一致性。
 */

const { responseEnvelope } = require('../middleware/responseEnvelope');

const buildRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe('responseEnvelope §3.3', () => {
  test('res.ok 发 {code:0, message, data}', () => {
    const res = buildRes();
    responseEnvelope({}, res, () => {});
    res.ok({ hello: 'world' });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      code: 0,
      message: 'success',
      data: { hello: 'world' }
    });
  });

  test('res.fail 发 status + {code, message, data}', () => {
    const res = buildRes();
    responseEnvelope({}, res, () => {});
    res.fail('不存在', 404);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      code: 404,
      message: '不存在',
      data: null
    });
  });

  test('res.paginated 发 {code:0, data:{list, pagination}}', () => {
    const res = buildRes();
    responseEnvelope({}, res, () => {});
    res.paginated([{ id: 1 }], { page: 1, pageSize: 20, total: 1, hasMore: false });
    const payload = res.json.mock.calls[0][0];
    expect(payload.code).toBe(0);
    expect(payload.data.list).toEqual([{ id: 1 }]);
    expect(payload.data.pagination.total).toBe(1);
  });

  test('next 被调用一次', () => {
    const res = buildRes();
    const next = jest.fn();
    responseEnvelope({}, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
