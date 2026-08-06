const { adminGraphql } = require('./adminGraphql');

/**
 * Reads the shop's own locale-independent settings: what it charges in, what
 * unit it weighs in, and where it is based.
 *
 * The admin UI needs currency and weight unit to format inputs the way the
 * merchant already sees them everywhere else in Shopify (a shop selling in USD
 * must not get "€" labels), and the country decides which default rule set a
 * fresh install is seeded with.
 */

const SHOP_CONTEXT_QUERY = `
  query ShopContext {
    shop {
      currencyCode
      weightUnit
      billingAddress { countryCodeV2 }
    }
  }
`;

const FALLBACK = { currencyCode: 'EUR', weightUnit: 'GRAMS', countryCode: null };

/**
 * Returns { currencyCode, weightUnit, countryCode }.
 * Throws on GraphQL/network errors so callers can decide how to degrade.
 */
async function getShopContext(shop, token) {
  const { data, errors } = await adminGraphql(shop, token, SHOP_CONTEXT_QUERY);
  if (errors) {
    throw new Error(errors.map((e) => e.message).join('; '));
  }
  const s = data?.shop;
  return {
    currencyCode: s?.currencyCode || FALLBACK.currencyCode,
    weightUnit: s?.weightUnit || FALLBACK.weightUnit,
    countryCode: s?.billingAddress?.countryCodeV2 || FALLBACK.countryCode,
  };
}

module.exports = { getShopContext, SHOP_CONTEXT_FALLBACK: FALLBACK };
