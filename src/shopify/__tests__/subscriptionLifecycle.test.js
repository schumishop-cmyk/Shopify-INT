const mockRemoveSyncedProfile = jest.fn();
jest.mock('../profileSync', () => ({ removeSyncedProfile: (...a) => mockRemoveSyncedProfile(...a) }));

const mockRemoveAllTagProfiles = jest.fn();
jest.mock('../tagProfileSync', () => ({ removeAllTagProfiles: (...a) => mockRemoveAllTagProfiles(...a) }));

const mockRemoveDiscount = jest.fn();
jest.mock('../combinedShipping', () => ({ removeCombinedShippingDiscount: (...a) => mockRemoveDiscount(...a) }));

const { teardownBillingLapsed } = require('../subscriptionLifecycle');

const SHOP = 'test.myshopify.com';
const TOKEN = 'tok';

beforeEach(() => {
  mockRemoveSyncedProfile.mockReset().mockResolvedValue({ ok: true, removedRates: 1, removedZones: 1 });
  mockRemoveAllTagProfiles.mockReset().mockResolvedValue({ ok: true, removed: 1, warnings: [] });
  mockRemoveDiscount.mockReset().mockResolvedValue({ ok: true, removed: true });
});

describe('teardownBillingLapsed', () => {
  test('removes all three kinds of live data', async () => {
    const res = await teardownBillingLapsed(SHOP, TOKEN);

    expect(mockRemoveSyncedProfile).toHaveBeenCalledWith(SHOP, TOKEN);
    expect(mockRemoveAllTagProfiles).toHaveBeenCalledWith(SHOP, TOKEN);
    expect(mockRemoveDiscount).toHaveBeenCalledWith(SHOP, TOKEN);
    expect(res.profile.ok).toBe(true);
    expect(res.tagProfiles.ok).toBe(true);
    expect(res.discount.ok).toBe(true);
  });

  test('keeps going and reports the failure when one step throws', async () => {
    mockRemoveSyncedProfile.mockRejectedValue(new Error('network down'));

    const res = await teardownBillingLapsed(SHOP, TOKEN);

    expect(res.profile).toEqual({ ok: false, error: 'network down' });
    // the other two steps still ran despite the first one failing
    expect(mockRemoveAllTagProfiles).toHaveBeenCalled();
    expect(mockRemoveDiscount).toHaveBeenCalled();
  });

  test('one failing step does not stop the others from running', async () => {
    mockRemoveAllTagProfiles.mockRejectedValue(new Error('rate limited'));

    const res = await teardownBillingLapsed(SHOP, TOKEN);

    expect(res.tagProfiles).toEqual({ ok: false, error: 'rate limited' });
    expect(res.profile.ok).toBe(true);
    expect(res.discount.ok).toBe(true);
  });
});
