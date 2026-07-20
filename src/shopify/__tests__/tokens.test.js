const mockRow = { value: undefined };
const mockUpdate = jest.fn();
jest.mock('../../db/shops', () => ({
  getShop: { get: jest.fn(() => mockRow.value) },
  updateTokens: { run: (...a) => mockUpdate(...a) },
}));

const mockRefresh = jest.fn();
jest.mock('../oauth', () => ({
  refreshOfflineToken: (...a) => mockRefresh(...a),
}));

const { getValidToken } = require('../tokens');

beforeEach(() => {
  mockRow.value = undefined;
  mockUpdate.mockReset();
  mockRefresh.mockReset();
  process.env.SHOPIFY_API_KEY = 'key';
  process.env.SHOPIFY_API_SECRET = 'secret';
});

test('throws notInstalled when the shop is missing or uninstalled', async () => {
  mockRow.value = undefined;
  await expect(getValidToken('x.myshopify.com')).rejects.toMatchObject({ notInstalled: true });

  mockRow.value = { access_token: 't', uninstalled_at: '2026-01-01' };
  await expect(getValidToken('x.myshopify.com')).rejects.toMatchObject({ notInstalled: true });
});

test('returns a legacy non-expiring token as-is (no refresh)', async () => {
  mockRow.value = { access_token: 'legacy', uninstalled_at: null, token_expires_at: null };
  await expect(getValidToken('x.myshopify.com')).resolves.toBe('legacy');
  expect(mockRefresh).not.toHaveBeenCalled();
});

test('returns a still-valid expiring token without refreshing', async () => {
  const future = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  mockRow.value = { access_token: 'fresh', uninstalled_at: null, token_expires_at: future, refresh_token: 'r' };
  await expect(getValidToken('x.myshopify.com')).resolves.toBe('fresh');
  expect(mockRefresh).not.toHaveBeenCalled();
});

test('refreshes and persists when the token is expired', async () => {
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  mockRow.value = { access_token: 'old', uninstalled_at: null, token_expires_at: past, refresh_token: 'r-old' };
  mockRefresh.mockResolvedValue({
    access_token: 'new', refresh_token: 'r-new', expires_in: 3600, refresh_token_expires_in: 7776000,
  });

  await expect(getValidToken('x.myshopify.com')).resolves.toBe('new');
  expect(mockRefresh).toHaveBeenCalledWith(expect.objectContaining({ shop: 'x.myshopify.com', refreshToken: 'r-old' }));
  expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ access_token: 'new', refresh_token: 'r-new' }));
});

test('refreshes when within the 2-minute expiry buffer', async () => {
  const soon = new Date(Date.now() + 60 * 1000).toISOString(); // 1 min left
  mockRow.value = { access_token: 'old', uninstalled_at: null, token_expires_at: soon, refresh_token: 'r' };
  mockRefresh.mockResolvedValue({ access_token: 'new', refresh_token: 'r2', expires_in: 3600 });
  await expect(getValidToken('x.myshopify.com')).resolves.toBe('new');
  expect(mockRefresh).toHaveBeenCalled();
});

test('propagates needsReauth when the refresh token is dead', async () => {
  const past = new Date(Date.now() - 60 * 1000).toISOString();
  mockRow.value = { access_token: 'old', uninstalled_at: null, token_expires_at: past, refresh_token: 'dead' };
  mockRefresh.mockRejectedValue(Object.assign(new Error('Token refresh failed (HTTP 401)'), { needsReauth: true }));
  await expect(getValidToken('x.myshopify.com')).rejects.toMatchObject({ needsReauth: true });
});
