const mockGraphql = jest.fn();
jest.mock('../adminGraphql', () => ({ adminGraphql: (...a) => mockGraphql(...a) }));

const { getShopContext } = require('../shopContext');

beforeEach(() => mockGraphql.mockReset());

describe('getShopContext', () => {
  test('returns the shop currency, weight unit and country', async () => {
    mockGraphql.mockResolvedValue({
      data: { shop: { currencyCode: 'USD', weightUnit: 'POUNDS', billingAddress: { countryCodeV2: 'US' } } },
    });
    await expect(getShopContext('x.myshopify.com', 't')).resolves.toEqual({
      currencyCode: 'USD', weightUnit: 'POUNDS', countryCode: 'US',
    });
  });

  test('falls back to EUR/grams when fields are missing', async () => {
    mockGraphql.mockResolvedValue({ data: { shop: {} } });
    await expect(getShopContext('x.myshopify.com', 't')).resolves.toEqual({
      currencyCode: 'EUR', weightUnit: 'GRAMS', countryCode: null,
    });
  });

  test('throws on GraphQL errors so the caller can degrade', async () => {
    mockGraphql.mockResolvedValue({ errors: [{ message: 'boom' }] });
    await expect(getShopContext('x.myshopify.com', 't')).rejects.toThrow('boom');
  });
});
