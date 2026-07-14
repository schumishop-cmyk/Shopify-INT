const mockGraphql = jest.fn();
jest.mock('../adminGraphql', () => ({
  adminGraphql: (...args) => mockGraphql(...args),
}));

const mockState = { row: undefined };
jest.mock('../../db/database', () => ({
  prepare: () => ({
    run: jest.fn(),
    get: jest.fn(() => mockState.row),
    all: jest.fn(() => []),
  }),
  exec: jest.fn(), pragma: jest.fn(), transaction: jest.fn((fn) => fn),
}));

const { applyCombinedShipping, normalizeConfig } = require('../combinedShipping');

const SHOP = 'test.myshopify.com';
const TOKEN = 'tok';

// Valid request body used by most tests
const BODY = {
  enabled: true,
  mode: 'flat_addition',
  flatAmount: '1.50',
  detectVendor: 'Spreadconnect',
  fulfillmentRate: '3.50',
};

beforeEach(() => {
  mockGraphql.mockReset();
  mockState.row = undefined;
});

describe('normalizeConfig', () => {
  test('builds the full config from a valid body', () => {
    expect(normalizeConfig(BODY).config).toEqual({
      enabled: true,
      mode: 'flat_addition',
      flatAmountCents: 150,
      detectVendors: ['Spreadconnect'],
      fulfillmentRateCents: 350,
    });
  });

  test('requires a vendor when enabled', () => {
    expect(normalizeConfig({ ...BODY, detectVendor: ' ' }).error).toMatch(/Vendor/);
  });

  test('requires a positive fulfillment rate when enabled', () => {
    expect(normalizeConfig({ ...BODY, fulfillmentRate: '0' }).error).toMatch(/Versandrate/);
  });

  test('rejects a flat fee that is not below the partner rate', () => {
    expect(normalizeConfig({ ...BODY, flatAmount: '3.50' }).error).toMatch(/Pauschale/);
  });

  test('skips validation when disabled', () => {
    const { config, error } = normalizeConfig({ enabled: false });
    expect(error).toBeUndefined();
    expect(config.enabled).toBe(false);
  });

  test('rejects negative flat amounts', () => {
    expect(normalizeConfig({ ...BODY, flatAmount: '-1' }).error).toBeDefined();
  });
});

describe('applyCombinedShipping', () => {
  test('reports needsDeploy when no discount function is deployed', async () => {
    mockGraphql.mockResolvedValueOnce({ data: { shopifyFunctions: { nodes: [] } } });
    const res = await applyCombinedShipping(SHOP, TOKEN, BODY);
    expect(res.ok).toBe(false);
    expect(res.needsDeploy).toBe(true);
  });

  test('creates the discount via functionHandle with SHIPPING class', async () => {
    mockGraphql
      .mockResolvedValueOnce({ data: { shopifyFunctions: { nodes: [{ id: 'fn-1', apiType: 'discount' }] } } })
      .mockResolvedValueOnce({ data: { discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://discount/1' }, userErrors: [] } } })
      .mockResolvedValueOnce({ data: { metafieldsSet: { metafields: [{ id: 'mf-1' }], userErrors: [] } } });

    const res = await applyCombinedShipping(SHOP, TOKEN, BODY);
    expect(res.ok).toBe(true);

    const createInput = mockGraphql.mock.calls[1][3].discount;
    expect(createInput.functionHandle).toBe('combined-shipping');
    expect(createInput.discountClasses).toEqual(['SHIPPING']);

    const metafieldCall = mockGraphql.mock.calls[2][3];
    expect(metafieldCall.metafields[0].ownerId).toBe('gid://discount/1');
    expect(JSON.parse(metafieldCall.metafields[0].value)).toEqual({
      enabled: true,
      mode: 'flat_addition',
      flatAmountCents: 150,
      detectVendors: ['Spreadconnect'],
      fulfillmentRateCents: 350,
    });
  });

  test('reuses an existing discount and only rewrites the metafield', async () => {
    mockState.row = { combined_discount_gid: 'gid://discount/keep', combined_config: '{}' };
    mockGraphql.mockResolvedValueOnce({ data: { metafieldsSet: { metafields: [{ id: 'mf' }], userErrors: [] } } });

    const res = await applyCombinedShipping(SHOP, TOKEN, { enabled: false });
    expect(res.ok).toBe(true);
    expect(res.active).toBe(false);
    expect(mockGraphql).toHaveBeenCalledTimes(1);
    expect(mockGraphql.mock.calls[0][3].metafields[0].ownerId).toBe('gid://discount/keep');
  });

  test('surfaces userErrors from discount creation', async () => {
    mockGraphql
      .mockResolvedValueOnce({ data: { shopifyFunctions: { nodes: [{ id: 'fn-1', apiType: 'discount' }] } } })
      .mockResolvedValueOnce({ data: { discountAutomaticAppCreate: { automaticAppDiscount: null, userErrors: [{ field: 'title', message: 'schon vergeben' }] } } });

    const res = await applyCombinedShipping(SHOP, TOKEN, BODY);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/schon vergeben/);
  });
});
