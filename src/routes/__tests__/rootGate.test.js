const request = require('supertest');

const mockGetShop = jest.fn();
jest.mock('../../db/rules', () => ({ getRulesForShop: () => [], seedDefaultRules: jest.fn() }));
jest.mock('../../db/shops', () => ({
  getShop: { get: (...a) => mockGetShop(...a) },
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

const OLD_URL = process.env.PUBLIC_URL;
process.env.PUBLIC_URL = 'https://app.example.com';
const app = require('../../server');
afterAll(() => { process.env.PUBLIC_URL = OLD_URL; });

beforeEach(() => mockGetShop.mockReset());

describe('root auth-gate (immediate authentication after install)', () => {
  test('redirects an un-installed shop straight into OAuth', async () => {
    mockGetShop.mockReturnValue(null);
    const res = await request(app).get('/?shop=new-shop.myshopify.com');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/begin?shop=new-shop.myshopify.com');
  });

  test('redirects a previously-uninstalled shop into OAuth', async () => {
    mockGetShop.mockReturnValue({ uninstalled_at: '2026-01-01T00:00:00Z' });
    const res = await request(app).get('/?shop=gone.myshopify.com');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/begin?shop=gone.myshopify.com');
  });

  test('breaks out of the iframe for embedded loads via top-level navigation', async () => {
    mockGetShop.mockReturnValue(null);
    const res = await request(app).get('/?shop=new-shop.myshopify.com&embedded=1');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('window.top.location.href');
    expect(res.text).toContain('https://app.example.com/auth/begin?shop=new-shop.myshopify.com');
  });

  test('treats a host param as an embedded load', async () => {
    mockGetShop.mockReturnValue(null);
    const res = await request(app).get('/?shop=new-shop.myshopify.com&host=abc123');
    expect(res.status).toBe(200);
    expect(res.text).toContain('window.top.location.href');
  });

  test('serves the app (falls through) for an installed shop with an expiring token', async () => {
    mockGetShop.mockReturnValue({ uninstalled_at: null, access_token: 't', token_expires_at: '2099-01-01T00:00:00Z' });
    const res = await request(app).get('/?shop=live.myshopify.com');
    expect(res.status).toBe(200);
    expect(res.headers.location).toBeUndefined();
  });

  test('re-authorizes an installed shop still holding a legacy non-expiring token', async () => {
    mockGetShop.mockReturnValue({ uninstalled_at: null, access_token: 't', token_expires_at: null });
    const res = await request(app).get('/?shop=legacy.myshopify.com');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/auth/begin?shop=legacy.myshopify.com');
  });

  test('falls through when no shop is supplied', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(mockGetShop).not.toHaveBeenCalled();
  });

  test('falls through for an invalid shop domain', async () => {
    const res = await request(app).get('/?shop=evil.example.com');
    expect(res.status).toBe(200);
    expect(mockGetShop).not.toHaveBeenCalled();
  });
});
