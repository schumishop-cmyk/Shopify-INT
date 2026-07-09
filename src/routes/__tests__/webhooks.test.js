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

process.env.SHOPIFY_API_SECRET = 'test-webhook-secret';

const app = require('../../server');

function hmacFor(body, secret = 'test-webhook-secret') {
  return crypto.createHmac('sha256', secret).update(body).digest('base64');
}

const SHOP = 'test.myshopify.com';

describe('Webhook HMAC verification', () => {
  const body = JSON.stringify({ shop: SHOP });

  test('returns 401 on invalid HMAC', async () => {
    const res = await request(app)
      .post('/webhooks/app/uninstalled')
      .set('x-shopify-hmac-sha256', 'invalidsignature==')
      .set('x-shopify-shop-domain', SHOP)
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(401);
  });

  test('returns 200 on valid HMAC for app/uninstalled', async () => {
    const res = await request(app)
      .post('/webhooks/app/uninstalled')
      .set('x-shopify-hmac-sha256', hmacFor(body))
      .set('x-shopify-shop-domain', SHOP)
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(200);
  });

  test('returns 200 for customers/data_request', async () => {
    const b = JSON.stringify({ customer: { id: 123 } });
    const res = await request(app)
      .post('/webhooks/customers/data_request')
      .set('x-shopify-hmac-sha256', hmacFor(b))
      .set('x-shopify-shop-domain', SHOP)
      .set('Content-Type', 'application/json')
      .send(b);
    expect(res.status).toBe(200);
  });

  test('returns 200 for customers/redact', async () => {
    const b = JSON.stringify({ customer: { id: 123 } });
    const res = await request(app)
      .post('/webhooks/customers/redact')
      .set('x-shopify-hmac-sha256', hmacFor(b))
      .set('x-shopify-shop-domain', SHOP)
      .set('Content-Type', 'application/json')
      .send(b);
    expect(res.status).toBe(200);
  });

  test('returns 200 for shop/redact', async () => {
    const b = JSON.stringify({ shop_id: 1 });
    const res = await request(app)
      .post('/webhooks/shop/redact')
      .set('x-shopify-hmac-sha256', hmacFor(b))
      .set('x-shopify-shop-domain', SHOP)
      .set('Content-Type', 'application/json')
      .send(b);
    expect(res.status).toBe(200);
  });
});
