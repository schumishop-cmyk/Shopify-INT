const mockGraphql = jest.fn();
jest.mock('../adminGraphql', () => ({ adminGraphql: (...a) => mockGraphql(...a) }));

// Tag rules live in their own profiles and are covered by tagProfileSync's tests
const mockSyncTagProfiles = jest.fn();
jest.mock('../tagProfileSync', () => ({ syncTagProfiles: (...a) => mockSyncTagProfiles(...a) }));

const mockDbState = { appProfileGid: null, tracked: [], savedGid: undefined };
jest.mock('../../db/database', () => ({
  prepare: (sql) => {
    if (/SELECT app_profile_gid/.test(sql)) {
      return { get: () => ({ app_profile_gid: mockDbState.appProfileGid }), run: jest.fn(), all: jest.fn() };
    }
    if (/UPDATE shops SET app_profile_gid/.test(sql)) {
      return { run: (args) => { mockDbState.savedGid = args.gid; }, get: jest.fn(), all: jest.fn() };
    }
    if (/FROM synced_resources/.test(sql)) {
      return { all: () => mockDbState.tracked, get: jest.fn(), run: jest.fn() };
    }
    return { run: jest.fn(), get: jest.fn(), all: jest.fn(() => []) };
  },
  exec: jest.fn(), pragma: jest.fn(), transaction: jest.fn((fn) => fn),
}));

const { syncShopProfile, removeAppProfile } = require('../profileSync');

const SHOP = 'test.myshopify.com';
const TOKEN = 'tok';

const CONTEXT_OK = {
  data: {
    shop: { currencyCode: 'EUR' },
    locations: { nodes: [{ id: 'gid://shopify/Location/1' }] },
  },
};

function rule(overrides = {}) {
  return {
    id: 1, rule_id: 'std-de', name: 'Standard DE', enabled: true, priority: 10,
    conditions: { destinationCountries: ['DE'] },
    rates: [{ serviceName: 'DHL', serviceCode: 'dhl', price: 495, description: '', minDeliveryDays: 2, maxDeliveryDays: 5 }],
    ...overrides,
  };
}

/** Shape returned by the app profile's state query. */
function profileState(zoneIds = ['gid://zone/old'], defIds = ['gid://def/old']) {
  return {
    data: {
      deliveryProfile: {
        id: 'gid://profile/app',
        profileLocationGroups: [{
          locationGroup: { id: 'gid://lg/1' },
          locationGroupZones: {
            edges: zoneIds.map((zid) => ({
              node: {
                zone: { id: zid },
                methodDefinitions: { edges: defIds.map((did) => ({ node: { id: did } })) },
              },
            })),
          },
        }],
      },
    },
  };
}

beforeEach(() => {
  mockGraphql.mockReset();
  mockSyncTagProfiles.mockReset().mockResolvedValue({ created: 0, updated: 0, removed: 0, warnings: [] });
  mockDbState.appProfileGid = null;
  mockDbState.tracked = [];
  mockDbState.savedGid = undefined;
});

describe('syncShopProfile — app-owned profile', () => {
  test('creates the profile with coversAllItems on the first sync', async () => {
    mockGraphql
      .mockResolvedValueOnce(CONTEXT_OK)
      .mockResolvedValueOnce({ data: { deliveryProfileCreate: { profile: { id: 'gid://profile/new' }, userErrors: [] } } });

    const res = await syncShopProfile(SHOP, TOKEN, [rule()]);

    expect(res.ok).toBe(true);
    const input = mockGraphql.mock.calls[1][3].profile;
    expect(input.coversAllItems).toBe(true);
    expect(input.locationGroupsToCreate[0].locations).toEqual(['gid://shopify/Location/1']);
    const zone = input.locationGroupsToCreate[0].zonesToCreate[0];
    expect(zone.countries).toEqual([{ code: 'DE', includeAllProvinces: true }]);
    expect(zone.methodDefinitionsToCreate[0].rateDefinition.price.amount).toBe('4.95');
    // GID is persisted so the next sync updates instead of creating another one
    expect(mockDbState.savedGid).toBe('gid://profile/new');
  });

  test('never touches the merchant profile', async () => {
    mockGraphql
      .mockResolvedValueOnce(CONTEXT_OK)
      .mockResolvedValueOnce({ data: { deliveryProfileCreate: { profile: { id: 'gid://profile/new' }, userErrors: [] } } });

    await syncShopProfile(SHOP, TOKEN, [rule()]);

    const queries = mockGraphql.mock.calls.map((c) => c[2]);
    expect(queries.some((q) => /deliveryProfiles\s*\(/.test(q))).toBe(false);
  });

  test('replaces zones and rates on a subsequent sync', async () => {
    mockDbState.appProfileGid = 'gid://profile/app';
    mockGraphql
      .mockResolvedValueOnce(CONTEXT_OK)
      .mockResolvedValueOnce(profileState())
      .mockResolvedValueOnce({ data: { deliveryProfileUpdate: { profile: { id: 'gid://profile/app', profileLocationGroups: [] }, userErrors: [] } } });

    const res = await syncShopProfile(SHOP, TOKEN, [rule()]);

    expect(res.ok).toBe(true);
    const input = mockGraphql.mock.calls[2][3].profile;
    expect(input.methodDefinitionsToDelete).toEqual(['gid://def/old']);
    expect(input.zonesToDelete).toEqual(['gid://zone/old']);
    expect(input.locationGroupsToUpdate[0].id).toBe('gid://lg/1');
    expect(input.locationGroupsToUpdate[0].zonesToCreate).toHaveLength(1);
  });

  test('recreates the profile when the merchant deleted it', async () => {
    mockDbState.appProfileGid = 'gid://profile/gone';
    mockGraphql
      .mockResolvedValueOnce(CONTEXT_OK)
      .mockResolvedValueOnce({ data: { deliveryProfile: null } })
      .mockResolvedValueOnce({ data: { deliveryProfileCreate: { profile: { id: 'gid://profile/fresh' }, userErrors: [] } } });

    const res = await syncShopProfile(SHOP, TOKEN, [rule()]);

    expect(res.ok).toBe(true);
    expect(mockDbState.savedGid).toBe('gid://profile/fresh');
  });

  test('fails clearly when the shop has no active location', async () => {
    mockGraphql.mockResolvedValueOnce({ data: { shop: { currencyCode: 'EUR' }, locations: { nodes: [] } } });

    const res = await syncShopProfile(SHOP, TOKEN, [rule()]);

    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe('noLocations');
    expect(mockGraphql).toHaveBeenCalledTimes(1); // no writes attempted
  });

  test('surfaces creation userErrors', async () => {
    mockGraphql
      .mockResolvedValueOnce(CONTEXT_OK)
      .mockResolvedValueOnce({ data: { deliveryProfileCreate: { profile: null, userErrors: [{ field: 'name', message: 'taken' }] } } });

    const res = await syncShopProfile(SHOP, TOKEN, [rule()]);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/taken/);
  });

  test('migrates legacy rates out of the merchant profile after the first app-profile sync', async () => {
    // Shop synced under the old model: its rates still sit in the merchant profile
    mockDbState.tracked = [
      { kind: 'method_definition', gid: 'gid://def/legacy' },
      { kind: 'zone', gid: 'gid://zone/legacy' },
    ];
    mockGraphql
      .mockResolvedValueOnce(CONTEXT_OK)
      .mockResolvedValueOnce({ data: { deliveryProfileCreate: { profile: { id: 'gid://profile/new' }, userErrors: [] } } })
      // cleanup path: read the merchant profile, then strip our leftovers
      .mockResolvedValueOnce({
        data: {
          shop: { currencyCode: 'EUR' },
          deliveryProfiles: {
            edges: [{
              node: {
                id: 'gid://profile/merchant', name: 'General', default: true,
                profileLocationGroups: [{
                  locationGroup: { id: 'gid://lg/m', locations: { edges: [] } },
                  locationGroupZones: { edges: [] },
                }],
              },
            }],
          },
        },
      })
      .mockResolvedValueOnce({ data: { deliveryProfileUpdate: { profile: { id: 'gid://profile/merchant', profileLocationGroups: [] }, userErrors: [] } } });

    const res = await syncShopProfile(SHOP, TOKEN, [rule()]);

    expect(res.ok).toBe(true);
    const cleanup = mockGraphql.mock.calls[3][3].profile;
    expect(cleanup.methodDefinitionsToDelete).toEqual(['gid://def/legacy']);
    expect(cleanup.zonesToDelete).toEqual(['gid://zone/legacy']);
  });

  test('warns instead of failing when the legacy cleanup errors', async () => {
    mockDbState.tracked = [{ kind: 'zone', gid: 'gid://zone/legacy' }];
    mockGraphql
      .mockResolvedValueOnce(CONTEXT_OK)
      .mockResolvedValueOnce({ data: { deliveryProfileCreate: { profile: { id: 'gid://profile/new' }, userErrors: [] } } })
      .mockResolvedValueOnce({ errors: [{ message: 'merchant profile is read-only' }] });

    const res = await syncShopProfile(SHOP, TOKEN, [rule()]);

    // the new profile is live, so the sync itself succeeded
    expect(res.ok).toBe(true);
    expect(res.warnings.some((w) => w.code === 'legacyCleanupFailed')).toBe(true);
  });
});

describe('removeAppProfile', () => {
  test('deletes the profile and clears the stored GID', async () => {
    mockDbState.appProfileGid = 'gid://profile/app';
    mockGraphql.mockResolvedValueOnce({ data: { deliveryProfileRemove: { job: { id: 'j' }, userErrors: [] } } });

    const res = await removeAppProfile(SHOP, TOKEN);

    expect(res).toEqual({ ok: true, removed: true });
    expect(mockGraphql.mock.calls[0][3].id).toBe('gid://profile/app');
    expect(mockDbState.savedGid).toBeNull();
  });

  test('is a no-op when no profile is on record', async () => {
    const res = await removeAppProfile(SHOP, TOKEN);
    expect(res).toEqual({ ok: true, removed: false });
    expect(mockGraphql).not.toHaveBeenCalled();
  });

  test('treats an already-deleted profile as success', async () => {
    mockDbState.appProfileGid = 'gid://profile/gone';
    mockGraphql.mockResolvedValueOnce({
      data: { deliveryProfileRemove: { job: null, userErrors: [{ field: 'id', message: 'Profile does not exist' }] } },
    });

    const res = await removeAppProfile(SHOP, TOKEN);
    expect(res.ok).toBe(true);
  });
});
