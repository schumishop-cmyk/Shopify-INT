const mockGraphql = jest.fn();
jest.mock('../adminGraphql', () => ({
  adminGraphql: (...args) => mockGraphql(...args),
}));

const { registerUninstallWebhook, registerSubscriptionWebhook } = require('../webhookRegistration');

const SHOP = 'test.myshopify.com';
const TOKEN = 'tok';
const OLD_PUBLIC_URL = process.env.PUBLIC_URL;

beforeAll(() => { process.env.PUBLIC_URL = 'https://app.example.com'; });
afterAll(() => { process.env.PUBLIC_URL = OLD_PUBLIC_URL; });

beforeEach(() => mockGraphql.mockReset());

describe('registerUninstallWebhook', () => {
  test('creates the APP_UNINSTALLED subscription when none exists', async () => {
    mockGraphql
      .mockResolvedValueOnce({ data: { webhookSubscriptions: { nodes: [] } } })
      .mockResolvedValueOnce({ data: { webhookSubscriptionCreate: { webhookSubscription: { id: 'gid://1' }, userErrors: [] } } });

    const res = await registerUninstallWebhook(SHOP, TOKEN);

    expect(res).toEqual({ ok: true });
    expect(mockGraphql.mock.calls[1][3].topic).toBe('APP_UNINSTALLED');
    expect(mockGraphql.mock.calls[1][3].sub.callbackUrl).toBe('https://app.example.com/webhooks/app/uninstalled');
  });

  test('skips creation when already subscribed', async () => {
    mockGraphql.mockResolvedValueOnce({
      data: { webhookSubscriptions: { nodes: [
        { id: 'gid://1', topic: 'APP_UNINSTALLED', endpoint: { __typename: 'WebhookHttpEndpoint', callbackUrl: 'https://app.example.com/webhooks/app/uninstalled' } },
      ] } },
    });

    const res = await registerUninstallWebhook(SHOP, TOKEN);
    expect(res).toEqual({ ok: true, alreadyExisted: true });
    expect(mockGraphql).toHaveBeenCalledTimes(1);
  });
});

describe('registerSubscriptionWebhook', () => {
  test('creates the APP_SUBSCRIPTIONS_UPDATE subscription at the right URL', async () => {
    mockGraphql
      .mockResolvedValueOnce({ data: { webhookSubscriptions: { nodes: [] } } })
      .mockResolvedValueOnce({ data: { webhookSubscriptionCreate: { webhookSubscription: { id: 'gid://2' }, userErrors: [] } } });

    const res = await registerSubscriptionWebhook(SHOP, TOKEN);

    expect(res).toEqual({ ok: true });
    expect(mockGraphql.mock.calls[1][3].topic).toBe('APP_SUBSCRIPTIONS_UPDATE');
    expect(mockGraphql.mock.calls[1][3].sub.callbackUrl).toBe('https://app.example.com/webhooks/app_subscriptions/update');
  });

  test('returns ok:false on userErrors without throwing', async () => {
    mockGraphql
      .mockResolvedValueOnce({ data: { webhookSubscriptions: { nodes: [] } } })
      .mockResolvedValueOnce({ data: { webhookSubscriptionCreate: { webhookSubscription: null, userErrors: [{ field: 'topic', message: 'invalid' }] } } });

    const res = await registerSubscriptionWebhook(SHOP, TOKEN);
    expect(res).toEqual({ ok: false });
  });
});
