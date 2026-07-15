const request = require('supertest');

jest.mock('../../db/rules', () => ({ getRulesForShop: () => [], seedDefaultRules: jest.fn() }));
jest.mock('../../db/shops', () => ({
  getShop: { get: jest.fn(() => null) },
  upsertShop: { run: jest.fn() },
  markUninstalled: { run: jest.fn() },
}));
jest.mock('../../db/sessionStorage', () => ({
  storeSession: jest.fn(), loadSession: jest.fn(), deleteSession: jest.fn(),
  deleteSessions: jest.fn(), findSessionsByShop: jest.fn(),
}));
jest.mock('../../db/database', () => ({
  prepare: () => ({ run: jest.fn(), get: jest.fn(), all: jest.fn(() => []) }),
  exec: jest.fn(), pragma: jest.fn(), transaction: jest.fn((fn) => fn),
}));

const app = require('../../server');

describe('frame-ancestors CSP (clickjacking protection)', () => {
  test('allows framing by the requesting shop and the Shopify admin', async () => {
    const res = await request(app).get('/health?shop=test.myshopify.com');
    expect(res.headers['content-security-policy']).toBe(
      'frame-ancestors https://test.myshopify.com https://admin.shopify.com;'
    );
  });

  test('denies framing without a shop parameter', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['content-security-policy']).toBe("frame-ancestors 'none';");
  });

  test('denies framing for a non-myshopify domain', async () => {
    const res = await request(app).get('/health?shop=evil.example.com');
    expect(res.headers['content-security-policy']).toBe("frame-ancestors 'none';");
  });

  test('denies framing for an injection attempt in the shop param', async () => {
    const res = await request(app).get('/health?shop=test.myshopify.com%20https://evil.com');
    expect(res.headers['content-security-policy']).toBe("frame-ancestors 'none';");
  });
});
