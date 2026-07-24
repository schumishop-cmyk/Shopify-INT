const mockGraphql = jest.fn();
jest.mock('../adminGraphql', () => ({ adminGraphql: (...a) => mockGraphql(...a) }));

const { getSubscriptionStatus, pricingPageUrl } = require('../billing');

beforeEach(() => {
  mockGraphql.mockReset();
  delete process.env.SHOPIFY_APP_HANDLE;
});

describe('getSubscriptionStatus', () => {
  test('reports an active subscription with its plan name', async () => {
    mockGraphql.mockResolvedValue({
      data: { currentAppInstallation: { activeSubscriptions: [
        { id: 'gid://1', name: 'Pro', status: 'ACTIVE', test: false },
      ] } },
    });
    await expect(getSubscriptionStatus('x.myshopify.com', 't')).resolves.toEqual({
      active: true, plan: 'Pro', test: false,
    });
  });

  test('reports inactive when there are no active subscriptions', async () => {
    mockGraphql.mockResolvedValue({
      data: { currentAppInstallation: { activeSubscriptions: [] } },
    });
    await expect(getSubscriptionStatus('x.myshopify.com', 't')).resolves.toEqual({
      active: false, plan: null, test: false,
    });
  });

  test('ignores non-ACTIVE subscriptions', async () => {
    mockGraphql.mockResolvedValue({
      data: { currentAppInstallation: { activeSubscriptions: [
        { id: 'gid://1', name: 'Pro', status: 'PENDING', test: false },
      ] } },
    });
    await expect(getSubscriptionStatus('x.myshopify.com', 't')).resolves.toMatchObject({ active: false });
  });

  test('flags test subscriptions', async () => {
    mockGraphql.mockResolvedValue({
      data: { currentAppInstallation: { activeSubscriptions: [
        { id: 'gid://1', name: 'Pro', status: 'ACTIVE', test: true },
      ] } },
    });
    await expect(getSubscriptionStatus('x.myshopify.com', 't')).resolves.toMatchObject({ active: true, test: true });
  });

  test('throws when the GraphQL API returns errors', async () => {
    mockGraphql.mockResolvedValue({ errors: [{ message: 'boom' }] });
    await expect(getSubscriptionStatus('x.myshopify.com', 't')).rejects.toThrow('boom');
  });
});

describe('pricingPageUrl', () => {
  test('builds the hosted plan-selection URL from the app handle', () => {
    process.env.SHOPIFY_APP_HANDLE = 'shipping-rules-app';
    expect(pricingPageUrl('cool-shop.myshopify.com')).toBe(
      'https://admin.shopify.com/store/cool-shop/charges/shipping-rules-app/pricing_plans'
    );
  });

  test('returns null when the app handle is not configured', () => {
    expect(pricingPageUrl('cool-shop.myshopify.com')).toBeNull();
  });
});
