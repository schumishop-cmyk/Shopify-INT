const request = require('supertest');

// Carrier endpoint requires the URL token when the secret is configured
process.env.CARRIER_SERVICE_SECRET = 'carrier-test-secret';

// Stub DB modules — no real SQLite in tests
jest.mock('../../db/rules', () => ({
  getRulesForShop: () => [
    {
      id: 1, shop: 'test.myshopify.com', rule_id: 'standard-de',
      name: 'Standard DE', priority: 10, enabled: true,
      updated_at: '2026-01-01',
      conditions: { destinationCountries: ['DE'] },
      rates: [{ serviceName: 'Standard', serviceCode: 'std', price: 495, description: '', minDeliveryDays: 2, maxDeliveryDays: 5 }],
    },
  ],
}));

jest.mock('../../db/shops', () => ({
  getShop: { get: (shop) => shop === 'test.myshopify.com' ? { shop, access_token: 'tok', uninstalled_at: null } : null },
  upsertShop: { run: jest.fn() },
  setCarrierServiceId: { run: jest.fn() },
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

const app = require('../../server');

const BASE = '/api/carrier-service';
const TOKEN = 'token=carrier-test-secret';

const validPayload = (country = 'DE') => ({
  rate: {
    origin: { country: 'DE', postal_code: '10115', city: 'Berlin', address1: 'Unter den Linden 1' },
    destination: { country, postal_code: '80331', city: 'München', name: 'Test', address1: 'Str 1' },
    items: [{ name: 'Item', sku: 'X', quantity: 1, grams: 500, price: 3500, requires_shipping: true, product_tags: [] }],
    currency: 'EUR',
    locale: 'de',
  },
});

describe('POST /api/carrier-service', () => {
  test('returns 401 without the URL token', async () => {
    const res = await request(app)
      .post(`${BASE}?shop=test.myshopify.com`)
      .send(validPayload());
    expect(res.status).toBe(401);
  });

  test('returns 401 with a wrong URL token', async () => {
    const res = await request(app)
      .post(`${BASE}?shop=test.myshopify.com&token=guessed-secret`)
      .send(validPayload());
    expect(res.status).toBe(401);
  });

  test('returns 400 when shop param missing', async () => {
    const res = await request(app).post(`${BASE}?${TOKEN}`).send(validPayload());
    expect(res.status).toBe(400);
  });

  test('returns 404 for unknown shop', async () => {
    const res = await request(app)
      .post(`${BASE}?shop=unknown.myshopify.com&${TOKEN}`)
      .send(validPayload());
    expect(res.status).toBe(404);
  });

  test('returns rates for known shop + valid DE payload', async () => {
    const res = await request(app)
      .post(`${BASE}?shop=test.myshopify.com&${TOKEN}`)
      .send(validPayload('DE'));
    expect(res.status).toBe(200);
    expect(res.body.rates).toHaveLength(1);
    expect(res.body.rates[0].service_code).toBe('std');
  });

  test('returns empty rates for unknown country', async () => {
    const res = await request(app)
      .post(`${BASE}?shop=test.myshopify.com&${TOKEN}`)
      .send(validPayload('JP'));
    expect(res.status).toBe(200);
    expect(res.body.rates).toHaveLength(0);
  });

  test('returns 400 for missing rate body', async () => {
    const res = await request(app)
      .post(`${BASE}?shop=test.myshopify.com&${TOKEN}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
