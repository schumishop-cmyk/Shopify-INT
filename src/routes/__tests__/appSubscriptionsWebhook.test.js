const request = require('supertest');
const crypto = require('crypto');

jest.mock('../../db/rules', () => ({
  getRulesForShop: jest.fn(() => []),
  seedDefaultRules: jest.fn(),
}));
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
  prepare: () => ({ run: jest.fn(), get: jest.fn(), all: jest.fn() }),
  exec: jest.fn(), pragma: jest.fn(), transaction: jest.fn(() => jest.fn()),
}));

const mockGetValidToken = jest.fn();
jest.mock('../../shopify/tokens', () => ({ getValidToken: (...a) => mockGetValidToken(...a) }));

const mockTeardown = jest.fn();
jest.mock('../../shopify/subscriptionLifecycle', () => ({ teardownBillingLapsed: (...a) => mockTeardown(...a) }));

process.env.SHOPIFY_API_SECRET = 'test-webhook-secret';

const app = require('../../server');

function hmacFor(body, secret = 'test-webhook-secret') {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

const SHOP = 'test.myshopify.com';

function post(body) {
  const b = JSON.stringify(body);
  return request(app)
    .post('/webhooks/app_subscriptions/update')
    .set('x-shopify-hmac-sha256', hmacFor(b))
    .set('x-shopify-shop-domain', SHOP)
    .set('Content-Type', 'application/json')
    .send(b);
}

beforeEach(() => {
  mockGetValidToken.mockReset();
  mockTeardown.mockReset().mockResolvedValue({});
});

describe('app_subscriptions/update webhook', () => {
  test('rejects an invalid HMAC', async () => {
    const b = JSON.stringify({ app_subscription: { status: 'FROZEN' } });
    const res = await request(app)
      .post('/webhooks/app_subscriptions/update')
      .set('x-shopify-hmac-sha256', 'invalidsignature==')
      .set('x-shopify-shop-domain', SHOP)
      .set('Content-Type', 'application/json')
      .send(b);
    expect(res.status).toBe(401);
    expect(mockTeardown).not.toHaveBeenCalled();
  });

  test('acknowledges an ACTIVE subscription without tearing anything down', async () => {
    const res = await post({ app_subscription: { status: 'ACTIVE' } });
    expect(res.status).toBe(200);
    expect(mockTeardown).not.toHaveBeenCalled();
    expect(mockGetValidToken).not.toHaveBeenCalled();
  });

  test.each(['CANCELLED', 'DECLINED', 'EXPIRED', 'FROZEN'])(
    'tears down live shipping data on a %s subscription',
    async (status) => {
      mockGetValidToken.mockResolvedValue('shop-token');
      const res = await post({ app_subscription: { status } });
      expect(res.status).toBe(200);
      expect(mockGetValidToken).toHaveBeenCalledWith(SHOP);
      expect(mockTeardown).toHaveBeenCalledWith(SHOP, 'shop-token');
    }
  );

  test('still acknowledges 200 when the shop is not installed (no token available)', async () => {
    const err = new Error('App not installed for this shop');
    err.notInstalled = true;
    mockGetValidToken.mockRejectedValue(err);

    const res = await post({ app_subscription: { status: 'FROZEN' } });
    expect(res.status).toBe(200);
    expect(mockTeardown).not.toHaveBeenCalled();
  });

  test('acknowledges 200 even when teardown itself throws', async () => {
    mockGetValidToken.mockResolvedValue('shop-token');
    mockTeardown.mockRejectedValue(new Error('boom'));

    const res = await post({ app_subscription: { status: 'FROZEN' } });
    expect(res.status).toBe(200);
  });
});
