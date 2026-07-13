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

beforeEach(() => {
  mockGraphql.mockReset();
  mockState.row = undefined;
});

describe('normalizeConfig', () => {
  test('defaults to highest_only', () => {
    expect(normalizeConfig({}).config).toEqual({ enabled: true, mode: 'highest_only' });
  });

  test('parses flat amount in euros to cents', () => {
    const { config } = normalizeConfig({ mode: 'flat_addition', flatAmount: '3.50' });
    expect(config.flatAmountCents).toBe(350);
  });

  test('rejects negative flat amounts', () => {
    expect(normalizeConfig({ mode: 'flat_addition', flatAmount: '-1' }).error).toBeDefined();
  });
});

describe('applyCombinedShipping', () => {
  test('reports needsDeploy when no discount function is deployed', async () => {
    mockGraphql.mockResolvedValueOnce({ data: { shopifyFunctions: { nodes: [] } } });
    const res = await applyCombinedShipping(SHOP, TOKEN, { enabled: true });
    expect(res.ok).toBe(false);
    expect(res.needsDeploy).toBe(true);
  });

  test('creates the discount via functionHandle with SHIPPING class', async () => {
    mockGraphql
      // isFunctionDeployed
      .mockResolvedValueOnce({ data: { shopifyFunctions: { nodes: [{ id: 'fn-1', apiType: 'discount' }] } } })
      // discountAutomaticAppCreate
      .mockResolvedValueOnce({ data: { discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://discount/1' }, userErrors: [] } } })
      // metafieldsSet
      .mockResolvedValueOnce({ data: { metafieldsSet: { metafields: [{ id: 'mf-1' }], userErrors: [] } } });

    const res = await applyCombinedShipping(SHOP, TOKEN, { enabled: true, mode: 'highest_only' });
    expect(res.ok).toBe(true);

    const createInput = mockGraphql.mock.calls[1][3].discount;
    expect(createInput.functionHandle).toBe('combined-shipping');
    expect(createInput.discountClasses).toEqual(['SHIPPING']);

    const metafieldCall = mockGraphql.mock.calls[2][3];
    expect(metafieldCall.metafields[0].ownerId).toBe('gid://discount/1');
    expect(JSON.parse(metafieldCall.metafields[0].value)).toEqual({ enabled: true, mode: 'highest_only' });
  });

  test('accepts legacy shipping_discounts apiType as deployed', async () => {
    mockGraphql
      .mockResolvedValueOnce({ data: { shopifyFunctions: { nodes: [{ id: 'fn-1', apiType: 'shipping_discounts' }] } } })
      .mockResolvedValueOnce({ data: { discountAutomaticAppCreate: { automaticAppDiscount: { discountId: 'gid://discount/2' }, userErrors: [] } } })
      .mockResolvedValueOnce({ data: { metafieldsSet: { metafields: [{ id: 'mf' }], userErrors: [] } } });

    const res = await applyCombinedShipping(SHOP, TOKEN, { enabled: true });
    expect(res.ok).toBe(true);
  });

  test('reuses an existing discount and only rewrites the metafield', async () => {
    mockState.row = { combined_discount_gid: 'gid://discount/keep', combined_config: '{}' };
    mockGraphql.mockResolvedValueOnce({ data: { metafieldsSet: { metafields: [{ id: 'mf' }], userErrors: [] } } });

    const res = await applyCombinedShipping(SHOP, TOKEN, { enabled: false });
    expect(res.ok).toBe(true);
    expect(res.active).toBe(false);
    expect(mockGraphql).toHaveBeenCalledTimes(1); // no function lookup, no create
    expect(mockGraphql.mock.calls[0][3].metafields[0].ownerId).toBe('gid://discount/keep');
  });

  test('surfaces userErrors from discount creation', async () => {
    mockGraphql
      .mockResolvedValueOnce({ data: { shopifyFunctions: { nodes: [{ id: 'fn-1', apiType: 'discount' }] } } })
      .mockResolvedValueOnce({ data: { discountAutomaticAppCreate: { automaticAppDiscount: null, userErrors: [{ field: 'title', message: 'schon vergeben' }] } } });

    const res = await applyCombinedShipping(SHOP, TOKEN, { enabled: true });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/schon vergeben/);
  });
});
