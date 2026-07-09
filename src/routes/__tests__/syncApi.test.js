const request = require('supertest');
const { makeSessionToken } = require('../../testutils/makeSessionToken');

process.env.SHOPIFY_API_KEY = 'test-api-key';
process.env.SHOPIFY_API_SECRET = 'test-api-secret';

const mockSync = jest.fn();
jest.mock('../../shopify/profileSync', () => ({
  syncShopProfile: (...args) => mockSync(...args),
}));

jest.mock('../../db/shops', () => ({
  getShop: { get: (shop) => shop === 'test.myshopify.com' ? { shop, access_token: 'tok', uninstalled_at: null, last_synced_at: '2026-07-09 10:00:00' } : null },
  upsertShop: { run: jest.fn() },
  markUninstalled: { run: jest.fn() },
}));
jest.mock('../../db/rules', () => ({
  getRulesForShop: () => [{ id: 1, name: 'R', enabled: true, conditions: {}, rates: [] }],
  seedDefaultRules: jest.fn(),
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
const auth = () => `Bearer ${makeSessionToken()}`;

beforeEach(() => mockSync.mockReset());

describe('GET /api/sync/status', () => {
  test('requires authentication', async () => {
    const res = await request(app).get('/api/sync/status');
    expect(res.status).toBe(401);
  });

  test('returns the last sync timestamp', async () => {
    const res = await request(app).get('/api/sync/status').set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.lastSyncedAt).toBe('2026-07-09 10:00:00');
  });
});

describe('POST /api/sync', () => {
  test('runs the sync and returns the result', async () => {
    mockSync.mockResolvedValue({ ok: true, createdRates: 7, deletedRates: 3, warnings: [], skipped: [] });
    const res = await request(app).post('/api/sync').set('Authorization', auth());
    expect(res.status).toBe(200);
    expect(res.body.createdRates).toBe(7);
    expect(mockSync).toHaveBeenCalledWith('test.myshopify.com', 'tok', expect.any(Array));
  });

  test('returns 422 with the error when the sync fails', async () => {
    mockSync.mockResolvedValue({ ok: false, error: 'Kein Versandprofil gefunden' });
    const res = await request(app).post('/api/sync').set('Authorization', auth());
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/Versandprofil/);
  });

  test('returns 500 when the sync throws', async () => {
    mockSync.mockRejectedValue(new Error('network down'));
    const res = await request(app).post('/api/sync').set('Authorization', auth());
    expect(res.status).toBe(500);
  });
});
