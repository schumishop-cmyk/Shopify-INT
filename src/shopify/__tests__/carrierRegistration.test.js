// Stub DB access so requiring the module doesn't open SQLite
jest.mock('../../db/shops', () => ({
  getShop: { get: jest.fn() },
  setCarrierServiceId: { run: jest.fn() },
}));

const { extractError } = require('../carrierRegistration');

describe('extractError', () => {
  test('formats Shopify { base: [...] } errors (the 422 plan case)', () => {
    const res = { status: 422, body: { errors: { base: ['Carrier Calculated Shipping must be enabled for your store'] } } };
    expect(extractError(res)).toBe('base: Carrier Calculated Shipping must be enabled for your store');
  });

  test('handles a plain string error', () => {
    expect(extractError({ status: 401, body: { errors: 'Unauthorized' } })).toBe('Unauthorized');
  });

  test('handles an array of errors', () => {
    expect(extractError({ status: 422, body: { errors: ['a', 'b'] } })).toBe('a; b');
  });

  test('falls back to the status code when no errors field', () => {
    expect(extractError({ status: 500, body: {} })).toBe('Shopify returned HTTP 500');
  });

  test('joins multiple keyed error fields', () => {
    const res = { status: 422, body: { errors: { base: ['x'], callback_url: ['invalid'] } } };
    expect(extractError(res)).toBe('base: x; callback_url: invalid');
  });
});
