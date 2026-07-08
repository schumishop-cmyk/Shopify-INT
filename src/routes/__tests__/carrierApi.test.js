const request = require('supertest');
const { makeSessionToken } = require('../../testutils/makeSessionToken');

process.env.SHOPIFY_API_KEY = 'test-api-key';
process.env.SHOPIFY_API_SECRET = 'test-api-secret';

// The carrier registration module talks to Shopify over HTTPS — stub it out
const mockRegister = jest.fn();
const mockStatus = jest.fn();
jest.mock('../../shopify/carrierRegistration', () => ({
  registerCarrierService: (...args) => mockRegister(...args),
  getCarrierStatus: (...args) => mockStatus(...args),
}));

jest.mock('../../db/shops', () => ({
  getShop: { get: (shop) => shop === 'test.myshopify.com' ? { shop, access_token: 'tok', uninstalled_at: null } : null },
  upsertShop: { run: jest.fn() },
  setCarrierServiceId: { run: jest.fn() },
  markUninstalled: { run: jest.fn() },
}));
jest.mock('../../db/rules', () => ({ getRulesForShop: () => [], seedDefaultRules: jest.fn() }));
jest.mock('../../db/sessionStorage', () => ({
  storeSession: jest.fn(), loadSession: jest.fn(), deleteSession: jest.fn(),
  deleteSessions: jest.fn(), findSessionsByShop: jest.fn(),
}));
jest.mock('../../db/database', () => ({
  prepare: () => ({ run: jest.fn(), get: jest.fn(), all: jest.fn() }),
  exec: jest.fn(), pragma: jest.fn(), transaction: jest.fn(() => jest.fn()),
}));

const app = require('../../server');
const auth = () => `Bearer ${makeSessionToken()}`;

beforeEach(() => {
  mockRegister.mockReset();
  mockStatus.mockReset();
});

describe('GET /api/carrier/status', () => {
  test('requires authentication', async () => {
    const res = await request(app).get('/api/carrier/status');
    expect(res.status).toBe(401);
  });

  test('returns the carrier status for the shop', async () => {
    mockStatus.mockResolvedValue({ registered: true, id: 123, active: true });
    const res = await request(app).get('/api/carrier/status').set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ registered: true, id: 123, active: true });
    expect(mockStatus).toHaveBeenCalledWith('test.myshopify.com', 'tok');
  });
});

describe('POST /api/carrier/register', () => {
  test('returns 200 with the new id on success', async () => {
    mockRegister.mockResolvedValue({ ok: true, id: 456 });
    const res = await request(app).post('/api/carrier/register').set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, id: 456, alreadyExisted: false });
  });

  test('surfaces the Shopify error with 422 on failure', async () => {
    mockRegister.mockResolvedValue({ ok: false, status: 422, error: 'base: Carrier Calculated Shipping must be enabled' });
    const res = await request(app).post('/api/carrier/register').set('Authorization', auth());
    expect(res.status).toBe(422);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/Carrier Calculated Shipping/);
  });
});
