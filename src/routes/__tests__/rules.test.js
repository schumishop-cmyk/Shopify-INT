const request = require('supertest');
const { makeSessionToken } = require('../../testutils/makeSessionToken');

// Session-token auth reads these at request time — set before requiring app
process.env.SHOPIFY_API_KEY = 'test-api-key';
process.env.SHOPIFY_API_SECRET = 'test-api-secret';

// ── DB mocks ────────────────────────────────────────────────────────────────
const mockRules = [
  {
    id: 1, shop: 'test.myshopify.com', rule_id: 'rule-a',
    name: 'Standard DE', priority: 10, enabled: 1,
    conditions: '{"destinationCountries":["DE"]}',
    rates: '[{"serviceName":"Standard","serviceCode":"std","price":495,"description":"","minDeliveryDays":2,"maxDeliveryDays":5}]',
    created_at: '2026-01-01', updated_at: '2026-01-01',
  },
];

jest.mock('../../db/rules', () => ({
  listRules: { all: (shop) => shop === 'test.myshopify.com' ? [...mockRules] : [] },
  getRule: { get: jest.fn((shop, id) => mockRules.find((r) => r.shop === shop && r.id === Number(id)) || null) },
  insertRule: { run: jest.fn(() => ({ lastInsertRowid: 2 })) },
  updateRule: { run: jest.fn() },
  deleteRule: { run: jest.fn() },
  seedDefaultRules: jest.fn(),
  getRulesForShop: (shop) => shop === 'test.myshopify.com'
    ? mockRules.map((r) => ({ ...r, enabled: true, conditions: JSON.parse(r.conditions), rates: JSON.parse(r.rates) }))
    : [],
  parseRow: (row) => ({ ...row, enabled: row.enabled === 1, conditions: JSON.parse(row.conditions), rates: JSON.parse(row.rates) }),
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

function authed(req) {
  return req.set('Authorization', `Bearer ${makeSessionToken()}`);
}

describe('Session token authentication', () => {
  test('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(401);
  });

  test('returns 401 for a forged token (wrong secret)', async () => {
    const res = await request(app)
      .get('/api/rules')
      .set('Authorization', `Bearer ${makeSessionToken({ secret: 'attacker-secret' })}`);
    expect(res.status).toBe(401);
  });

  test('returns 401 for a token issued to another app', async () => {
    const res = await request(app)
      .get('/api/rules')
      .set('Authorization', `Bearer ${makeSessionToken({ aud: 'other-app-key' })}`);
    expect(res.status).toBe(401);
  });

  test('returns 401 for a shop that has not installed the app', async () => {
    const res = await request(app)
      .get('/api/rules')
      .set('Authorization', `Bearer ${makeSessionToken({ shop: 'stranger.myshopify.com' })}`);
    expect(res.status).toBe(401);
  });

  test('the legacy X-Shop-Domain header grants no access', async () => {
    const res = await request(app)
      .get('/api/rules')
      .set('X-Shop-Domain', 'test.myshopify.com');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/rules', () => {
  test('returns rules for a valid session token', async () => {
    const res = await authed(request(app).get('/api/rules'));
    expect(res.status).toBe(200);
    expect(res.body.rules).toHaveLength(1);
    expect(res.body.rules[0].name).toBe('Standard DE');
  });
});

describe('POST /api/rules', () => {
  const validRule = {
    name: 'Express DE',
    priority: 20,
    enabled: true,
    conditions: { destinationCountries: ['DE'] },
    rates: [{ serviceName: 'Express', serviceCode: 'exp', price: 995, description: '1–2 Tage', minDeliveryDays: 1, maxDeliveryDays: 2 }],
  };

  test('creates a rule and returns 201', async () => {
    const rulesDb = require('../../db/rules');
    rulesDb.getRule.get.mockReturnValueOnce({
      id: 2, shop: 'test.myshopify.com', rule_id: 'rule-b',
      name: 'Express DE', priority: 20, enabled: 1,
      conditions: '{"destinationCountries":["DE"]}',
      rates: '[{"serviceName":"Express","serviceCode":"exp","price":995,"description":"1–2 Tage","minDeliveryDays":1,"maxDeliveryDays":2}]',
    });

    const res = await authed(request(app).post('/api/rules')).send(validRule);
    expect(res.status).toBe(201);
    expect(res.body.rule.name).toBe('Express DE');
  });

  test('returns 400 when name is missing', async () => {
    const res = await authed(request(app).post('/api/rules')).send({ rates: [] });
    expect(res.status).toBe(400);
  });

  test('returns 400 when rates array is empty', async () => {
    const res = await authed(request(app).post('/api/rules')).send({ name: 'Test', rates: [] });
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/rules/:id', () => {
  test('returns 404 for unknown rule', async () => {
    const res = await authed(request(app).put('/api/rules/999')).send({ name: 'X', rates: [] });
    expect(res.status).toBe(404);
  });

  test('updates a rule for valid id', async () => {
    const rulesDb = require('../../db/rules');
    rulesDb.getRule.get
      .mockReturnValueOnce(mockRules[0])
      .mockReturnValueOnce({ ...mockRules[0], name: 'Updated' });

    const res = await authed(request(app).put('/api/rules/1')).send({ name: 'Updated' });
    expect(res.status).toBe(200);
    expect(res.body.rule.name).toBe('Updated');
  });
});

describe('DELETE /api/rules/:id', () => {
  test('returns 404 for unknown rule', async () => {
    const res = await authed(request(app).delete('/api/rules/999'));
    expect(res.status).toBe(404);
  });

  test('deletes existing rule', async () => {
    const rulesDb = require('../../db/rules');
    rulesDb.getRule.get.mockReturnValueOnce(mockRules[0]);
    const res = await authed(request(app).delete('/api/rules/1'));
    expect(res.status).toBe(200);
  });
});
