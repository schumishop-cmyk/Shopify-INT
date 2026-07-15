const mockGraphql = jest.fn();
jest.mock('../adminGraphql', () => ({
  adminGraphql: (...args) => mockGraphql(...args),
}));

const trackedRows = [];
jest.mock('../../db/database', () => ({
  prepare: (sql) => ({
    run: jest.fn(),
    get: jest.fn(),
    all: jest.fn(() => trackedRows),
  }),
  exec: jest.fn(), pragma: jest.fn(), transaction: jest.fn((fn) => fn),
}));

const { syncTagProfiles, tagQuery, buildTagZones } = require('../tagProfileSync');

const SHOP = 'test.myshopify.com';
const TOKEN = 'tok';
const CTX = { locationIds: ['gid://shopify/Location/1'], currencyCode: 'EUR' };

function sperrgutRule(overrides = {}) {
  return {
    id: 8, rule_id: 'tag-bulky-surcharge', name: 'Aufpreis für Sperrgut-Produkte',
    enabled: true, priority: 5,
    conditions: { requireProductTags: ['sperrgut'] },
    rates: [{ serviceName: 'Sperrgutlieferung', serviceCode: 'bulky', price: 2990, description: '', minDeliveryDays: 5, maxDeliveryDays: 14 }],
    ...overrides,
  };
}

function productsResponse(variantIds, hasNextPage = false) {
  return {
    data: {
      products: {
        pageInfo: { hasNextPage, endCursor: 'c' },
        edges: [{
          node: {
            id: 'gid://shopify/Product/1',
            variants: { edges: variantIds.map((id) => ({ node: { id } })) },
          },
        }],
      },
    },
  };
}

beforeEach(() => {
  mockGraphql.mockReset();
  trackedRows.length = 0;
});

describe('tagQuery', () => {
  test('joins multiple tags with OR — one matching tag is enough', () => {
    expect(tagQuery(['sperrgut', 'bulky'])).toBe("tag:'sperrgut' OR tag:'bulky'");
  });

  test('escapes single quotes', () => {
    expect(tagQuery(["o'brien"])).toBe("tag:'o\\'brien'");
  });
});

describe('buildTagZones', () => {
  test('builds a country zone with provinces included', () => {
    const zones = buildTagZones(sperrgutRule({ conditions: { requireProductTags: ['x'], destinationCountries: ['DE', 'ES'] } }), []);
    expect(zones[0].countries).toEqual([
      { code: 'DE', includeAllProvinces: true },
      { code: 'ES', includeAllProvinces: true },
    ]);
  });

  test('falls back to rest of world without countries', () => {
    const zones = buildTagZones(sperrgutRule(), []);
    expect(zones[0].countries).toEqual([{ restOfWorld: true }]);
  });
});

describe('syncTagProfiles', () => {
  test('creates a profile with variants, zone, and rates for a new tag rule', async () => {
    mockGraphql
      .mockResolvedValueOnce(productsResponse(['gid://v/1', 'gid://v/2']))
      .mockResolvedValueOnce({ data: { deliveryProfileCreate: { profile: { id: 'gid://profile/9' }, userErrors: [] } } });

    const res = await syncTagProfiles(SHOP, TOKEN, [sperrgutRule()], CTX);

    expect(res.created).toBe(1);
    expect(res.warnings).toEqual([]);

    const createInput = mockGraphql.mock.calls[1][3].profile;
    expect(createInput.name).toBe('App: Aufpreis für Sperrgut-Produkte');
    expect(createInput.variantsToAssociate).toEqual(['gid://v/1', 'gid://v/2']);
    expect(createInput.locationGroupsToCreate[0].locations).toEqual(['gid://shopify/Location/1']);
    const def = createInput.locationGroupsToCreate[0].zonesToCreate[0].methodDefinitionsToCreate[0];
    expect(def.name).toBe('Sperrgutlieferung');
    expect(def.rateDefinition.price.amount).toBe('29.90');
  });

  test('warns and removes the profile when no products carry the tag', async () => {
    trackedRows.push({ gid: 'gid://profile/old', meta: 'tag-bulky-surcharge' });
    mockGraphql
      .mockResolvedValueOnce(productsResponse([]))
      .mockResolvedValueOnce({ data: { deliveryProfileRemove: { job: { id: 'j' }, userErrors: [] } } });

    const res = await syncTagProfiles(SHOP, TOKEN, [sperrgutRule()], CTX);

    expect(res.removed).toBe(1);
    expect(res.created).toBe(0);
    expect(res.warnings.some((w) => w.includes('kein Produkt'))).toBe(true);
  });

  test('updates an existing profile: replaces rates, diffs variants', async () => {
    trackedRows.push({ gid: 'gid://profile/9', meta: 'tag-bulky-surcharge' });
    mockGraphql
      // products by tag: v2 stays, v3 is new
      .mockResolvedValueOnce(productsResponse(['gid://v/2', 'gid://v/3']))
      // current profile state: has v1+v2, one zone with one def
      .mockResolvedValueOnce({
        data: {
          deliveryProfile: {
            id: 'gid://profile/9',
            profileLocationGroups: [{
              locationGroup: { id: 'gid://lg/1' },
              locationGroupZones: {
                edges: [{
                  node: {
                    zone: { id: 'gid://zone/1' },
                    methodDefinitions: { edges: [{ node: { id: 'gid://def/old' } }] },
                  },
                }],
              },
            }],
            profileItems: {
              edges: [{
                node: { variants: { edges: [{ node: { id: 'gid://v/1' } }, { node: { id: 'gid://v/2' } }] } },
              }],
            },
          },
        },
      })
      // update mutation
      .mockResolvedValueOnce({ data: { deliveryProfileUpdate: { profile: { id: 'gid://profile/9' }, userErrors: [] } } });

    const res = await syncTagProfiles(SHOP, TOKEN, [sperrgutRule()], CTX);

    expect(res.updated).toBe(1);
    const input = mockGraphql.mock.calls[2][3].profile;
    expect(input.methodDefinitionsToDelete).toEqual(['gid://def/old']);
    expect(input.variantsToAssociate).toEqual(['gid://v/3']);
    expect(input.variantsToDissociate).toEqual(['gid://v/1']);
    expect(input.locationGroupsToUpdate[0].zonesToUpdate[0].id).toBe('gid://zone/1');
  });

  test('removes stale profiles when the rule was disabled', async () => {
    trackedRows.push({ gid: 'gid://profile/stale', meta: 'tag-bulky-surcharge' });
    mockGraphql.mockResolvedValueOnce({ data: { deliveryProfileRemove: { job: { id: 'j' }, userErrors: [] } } });

    const res = await syncTagProfiles(SHOP, TOKEN, [sperrgutRule({ enabled: false })], CTX);

    expect(res.removed).toBe(1);
    expect(mockGraphql.mock.calls[0][3].id).toBe('gid://profile/stale');
  });

  test('turns per-rule failures into warnings instead of throwing', async () => {
    mockGraphql.mockResolvedValueOnce({ errors: [{ message: 'boom' }] });
    const res = await syncTagProfiles(SHOP, TOKEN, [sperrgutRule()], CTX);
    expect(res.created).toBe(0);
    expect(res.warnings.some((w) => w.includes('boom'))).toBe(true);
  });

  test('ignores rules without tags', async () => {
    const plainRule = sperrgutRule({ conditions: { destinationCountries: ['DE'] } });
    const res = await syncTagProfiles(SHOP, TOKEN, [plainRule], CTX);
    expect(mockGraphql).not.toHaveBeenCalled();
    expect(res.created + res.updated + res.removed).toBe(0);
  });
});
