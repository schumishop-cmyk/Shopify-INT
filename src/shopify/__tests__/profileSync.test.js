jest.mock('../../db/database', () => ({
  prepare: () => ({ run: jest.fn(), get: jest.fn(), all: jest.fn(() => []) }),
  exec: jest.fn(), pragma: jest.fn(), transaction: jest.fn((fn) => fn),
}));

const { buildSyncPlan, normalizeProfile } = require('../profileSync');

const baseProfile = {
  profileId: 'gid://shopify/DeliveryProfile/1',
  locationGroupId: 'gid://shopify/DeliveryLocationGroup/1',
  currencyCode: 'EUR',
  multipleLocationGroups: false,
  zones: [
    {
      id: 'gid://shopify/DeliveryZone/de',
      name: 'Deutschland',
      countryCodes: ['DE'],
      restOfWorld: false,
      methodDefinitionIds: ['gid://shopify/DeliveryMethodDefinition/old1'],
    },
  ],
};

function rule(overrides = {}) {
  return {
    id: 1,
    name: 'Testregel',
    enabled: true,
    priority: 10,
    conditions: { destinationCountries: ['DE'] },
    rates: [{ serviceName: 'Standard', serviceCode: 'std', price: 495, description: '2–5 Tage', minDeliveryDays: 2, maxDeliveryDays: 5 }],
    ...overrides,
  };
}

describe('buildSyncPlan', () => {
  test('adds rates to an existing zone covering the rule country', () => {
    const { input } = buildSyncPlan([rule()], baseProfile);
    const lg = input.locationGroupsToUpdate[0];
    expect(lg.zonesToUpdate).toHaveLength(1);
    expect(lg.zonesToUpdate[0].id).toBe('gid://shopify/DeliveryZone/de');
    const def = lg.zonesToUpdate[0].methodDefinitionsToCreate[0];
    expect(def.name).toBe('Standard');
    expect(def.rateDefinition.price.amount).toBe('4.95');
    expect(def.rateDefinition.price.currencyCode).toBe('EUR');
  });

  test('creates a new zone for countries not covered by any existing zone', () => {
    const r = rule({ conditions: { destinationCountries: ['FR', 'IT'] } });
    const { input } = buildSyncPlan([r], baseProfile);
    const lg = input.locationGroupsToUpdate[0];
    expect(lg.zonesToCreate).toHaveLength(1);
    expect(lg.zonesToCreate[0].countries).toEqual([
      { code: 'FR', includeAllProvinces: true },
      { code: 'IT', includeAllProvinces: true },
    ]);
    expect(lg.zonesToCreate[0].methodDefinitionsToCreate).toHaveLength(1);
  });

  test('maps weight conditions to weightConditionsToCreate in grams', () => {
    const r = rule({ conditions: { destinationCountries: ['DE'], minWeightGrams: 2001, maxWeightGrams: 10000 } });
    const { input } = buildSyncPlan([r], baseProfile);
    const def = input.locationGroupsToUpdate[0].zonesToUpdate[0].methodDefinitionsToCreate[0];
    expect(def.weightConditionsToCreate).toEqual([
      { criteria: { unit: 'GRAMS', value: 2001 }, operator: 'GREATER_THAN_OR_EQUAL_TO' },
      { criteria: { unit: 'GRAMS', value: 10000 }, operator: 'LESS_THAN_OR_EQUAL_TO' },
    ]);
    expect(def.priceConditionsToCreate).toBeUndefined();
  });

  test('maps cart price thresholds to priceConditionsToCreate in currency units', () => {
    const r = rule({
      conditions: { destinationCountries: ['DE'], minCartPrice: 5000 },
      rates: [{ serviceName: 'Kostenlos', serviceCode: 'free', price: 0, description: '' }],
    });
    const { input } = buildSyncPlan([r], baseProfile);
    const def = input.locationGroupsToUpdate[0].zonesToUpdate[0].methodDefinitionsToCreate[0];
    expect(def.priceConditionsToCreate).toEqual([
      { criteria: { amount: '50.00', currencyCode: 'EUR' }, operator: 'GREATER_THAN_OR_EQUAL_TO' },
    ]);
    expect(def.rateDefinition.price.amount).toBe('0.00');
  });

  test('warns and prefers weight when a rule mixes weight and price conditions', () => {
    const r = rule({ conditions: { destinationCountries: ['DE'], maxWeightGrams: 2000, maxCartPrice: 4999 } });
    const { input, warnings } = buildSyncPlan([r], baseProfile);
    const def = input.locationGroupsToUpdate[0].zonesToUpdate[0].methodDefinitionsToCreate[0];
    expect(def.weightConditionsToCreate).toBeDefined();
    expect(def.priceConditionsToCreate).toBeUndefined();
    expect(warnings.some((w) => w.code === 'weightAndPriceCombined')).toBe(true);
  });

  test('skips tag-based rules silently (handled by tagProfileSync)', () => {
    const r = rule({ conditions: { requireProductTags: ['sperrgut'] } });
    const { input, skipped, warnings } = buildSyncPlan([r], baseProfile);
    expect(skipped).toEqual(['Testregel']);
    expect(warnings).toEqual([]);
    expect(input.locationGroupsToUpdate[0].zonesToUpdate).toBeUndefined();
  });

  test('skips disabled rules silently', () => {
    const { input } = buildSyncPlan([rule({ enabled: false })], baseProfile);
    expect(input.locationGroupsToUpdate[0].zonesToUpdate).toBeUndefined();
  });

  test('routes fallback rules (no countries) into a rest-of-world zone', () => {
    const r = rule({ conditions: {} });
    const { input } = buildSyncPlan([r], baseProfile);
    const lg = input.locationGroupsToUpdate[0];
    expect(lg.zonesToCreate).toHaveLength(1);
    expect(lg.zonesToCreate[0].countries).toEqual([{ restOfWorld: true }]);
  });

  test('deletes only tracked method definitions that still exist', () => {
    const { input } = buildSyncPlan(
      [rule()],
      baseProfile,
      ['gid://shopify/DeliveryMethodDefinition/old1', 'gid://shopify/DeliveryMethodDefinition/gone'],
      []
    );
    expect(input.methodDefinitionsToDelete).toEqual(['gid://shopify/DeliveryMethodDefinition/old1']);
  });

  test('warns when an existing zone contains more countries than the rule targets', () => {
    const profile = {
      ...baseProfile,
      zones: [{ ...baseProfile.zones[0], countryCodes: ['DE', 'AT'], name: 'DACH' }],
    };
    const { warnings } = buildSyncPlan([rule()], profile);
    expect(warnings.some((w) => w.code === 'zoneHasExtraCountries' && w.params.countries.includes('AT'))).toBe(true);
  });
});

describe('normalizeProfile', () => {
  test('picks the default profile and flattens zones', () => {
    const data = {
      shop: { currencyCode: 'EUR' },
      deliveryProfiles: {
        edges: [
          {
            node: {
              id: 'gid://shopify/DeliveryProfile/9',
              name: 'Allgemeines Profil',
              default: true,
              profileLocationGroups: [{
                locationGroup: { id: 'gid://shopify/DeliveryLocationGroup/5' },
                locationGroupZones: {
                  edges: [{
                    node: {
                      zone: {
                        id: 'gid://shopify/DeliveryZone/1',
                        name: 'Deutschland',
                        countries: [{ code: { countryCode: 'DE', restOfWorld: false } }],
                      },
                      methodDefinitions: { edges: [{ node: { id: 'gid://def/1', name: 'Standard' } }] },
                    },
                  }],
                },
              }],
            },
          },
        ],
      },
    };

    const profile = normalizeProfile(data);
    expect(profile.profileId).toBe('gid://shopify/DeliveryProfile/9');
    expect(profile.locationGroupId).toBe('gid://shopify/DeliveryLocationGroup/5');
    expect(profile.zones[0].countryCodes).toEqual(['DE']);
    expect(profile.zones[0].methodDefinitionIds).toEqual(['gid://def/1']);
    expect(profile.currencyCode).toBe('EUR');
  });

  test('returns null when no profile exists', () => {
    expect(normalizeProfile({ deliveryProfiles: { edges: [] } })).toBeNull();
  });
});
