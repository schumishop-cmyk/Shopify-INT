const { adminGraphql } = require('./adminGraphql');

/**
 * Shopify Managed Pricing integration.
 *
 * Charging happens entirely on Shopify's hosted pricing page — we never take
 * payment ourselves (App Store requirement 1.2.1). This module only
 *   a) reads whether the shop currently has an active app subscription, and
 *   b) builds the URL of Shopify's plan-selection page to link merchants to.
 * Plans themselves are defined in the Partner Dashboard, not in code.
 */

const SUBSCRIPTION_QUERY = `
  query AppSubscriptions {
    currentAppInstallation {
      activeSubscriptions {
        id
        name
        status
        test
      }
    }
  }
`;

/**
 * Returns the shop's subscription state:
 *   { active: boolean, plan: string|null, test: boolean }
 * Throws on GraphQL/network errors so the caller can decide how to degrade.
 */
async function getSubscriptionStatus(shop, token) {
  const { data, errors } = await adminGraphql(shop, token, SUBSCRIPTION_QUERY);
  if (errors) {
    const err = new Error(errors.map((e) => e.message).join('; '));
    err.graphqlErrors = errors;
    throw err;
  }
  const subs = data?.currentAppInstallation?.activeSubscriptions || [];
  const active = subs.find((s) => s.status === 'ACTIVE') || null;
  return {
    active: Boolean(active),
    plan: active ? active.name : null,
    test: active ? Boolean(active.test) : false,
  };
}

/**
 * Full URL of the Shopify-hosted Managed Pricing plan-selection page for this
 * shop. Requires SHOPIFY_APP_HANDLE (the app handle from the Partner
 * Dashboard); returns null when it is not configured so the UI can fall back
 * gracefully instead of linking to a broken page.
 */
function pricingPageUrl(shop) {
  const handle = process.env.SHOPIFY_APP_HANDLE;
  if (!handle) return null;
  const store = String(shop).replace(/\.myshopify\.com$/, '');
  return `https://admin.shopify.com/store/${store}/charges/${handle}/pricing_plans`;
}

module.exports = { getSubscriptionStatus, pricingPageUrl };
