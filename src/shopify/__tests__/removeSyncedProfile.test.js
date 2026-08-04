const mockGraphql = jest.fn();
jest.mock('../adminGraphql', () => ({
  adminGraphql: (...args) => mockGraphql(...args),
}));

const trackedRows = [];
jest.mock('../../db/database', () => ({
  prepare: () => ({
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn(() => trackedRows),
  }),
  exec: jest.fn(), pragma: jest.fn(), transaction: jest.fn((fn) => fn),
}));

const { removeSyncedProfile } = require('../profileSync');

const SHOP = 'test.myshopify.com';
const TOKEN = 'tok';

const profileQueryData = {
  shop: { currencyCode: 'EUR' },
  deliveryProfiles: {
    edges: [{
      node: {
        id: 'gid://shopify/DeliveryProfile/1',
        name: 'General Profile',
        default: true,
        profileLocationGroups: [{
          locationGroup: {
            id: 'gid://shopify/DeliveryLocationGroup/1',
            locations: { edges: [{ node: { id: 'gid://shopify/Location/1' } }] },
          },
          locationGroupZones: { edges: [] },
        }],
      },
    }],
  },
};

beforeEach(() => {
  mockGraphql.mockReset();
  trackedRows.length = 0;
});

describe('removeSyncedProfile', () => {
  test('is a no-op when nothing is tracked', async () => {
    const res = await removeSyncedProfile(SHOP, TOKEN);
    expect(res).toEqual({ ok: true, removedRates: 0, removedZones: 0 });
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  test('deletes every tracked zone and rate from the default profile', async () => {
    trackedRows.push(
      { kind: 'method_definition', gid: 'gid://def/1' },
      { kind: 'zone', gid: 'gid://zone/1' },
    );
    mockGraphql
      .mockResolvedValueOnce({ data: profileQueryData })
      .mockResolvedValueOnce({ data: { deliveryProfileUpdate: { profile: { id: 'gid://shopify/DeliveryProfile/1', profileLocationGroups: [] }, userErrors: [] } } });

    const res = await removeSyncedProfile(SHOP, TOKEN);

    expect(res).toEqual({ ok: true, removedRates: 1, removedZones: 1 });
    const mutationInput = mockGraphql.mock.calls[1][3].profile;
    expect(mutationInput.methodDefinitionsToDelete).toEqual(['gid://def/1']);
    expect(mutationInput.zonesToDelete).toEqual(['gid://zone/1']);
    expect(mutationInput.locationGroupsToUpdate).toEqual([{ id: 'gid://shopify/DeliveryLocationGroup/1' }]);
  });

  test('clears tracking and returns ok when no profile exists to remove from', async () => {
    trackedRows.push({ kind: 'zone', gid: 'gid://zone/1' });
    mockGraphql.mockResolvedValueOnce({ data: { shop: { currencyCode: 'EUR' }, deliveryProfiles: { edges: [] } } });

    const res = await removeSyncedProfile(SHOP, TOKEN);
    expect(res).toEqual({ ok: true, removedRates: 0, removedZones: 0 });
    expect(mockGraphql).toHaveBeenCalledTimes(1);
  });

  test('surfaces query errors', async () => {
    trackedRows.push({ kind: 'zone', gid: 'gid://zone/1' });
    mockGraphql.mockResolvedValueOnce({ errors: [{ message: 'boom' }] });

    const res = await removeSyncedProfile(SHOP, TOKEN);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/boom/);
  });

  test('surfaces mutation userErrors', async () => {
    trackedRows.push({ kind: 'zone', gid: 'gid://zone/1' });
    mockGraphql
      .mockResolvedValueOnce({ data: profileQueryData })
      .mockResolvedValueOnce({ data: { deliveryProfileUpdate: { profile: null, userErrors: [{ field: 'zonesToDelete', message: 'invalid' }] } } });

    const res = await removeSyncedProfile(SHOP, TOKEN);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/invalid/);
  });
});
