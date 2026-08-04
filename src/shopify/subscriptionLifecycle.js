/**
 * Reacts to app_subscriptions/update: when a shop's billing lapses (trial
 * ends unpaid, payment fails, or the merchant cancels), the live Shopify-side
 * artifacts this app created — native shipping rates, tag-rule delivery
 * profiles, and the combined-shipping discount — are removed.
 *
 * The app's own rule configuration in our DB is left untouched, so if the
 * shop resubscribes, a normal sync/save recreates everything without the
 * merchant re-entering anything.
 */
const { removeSyncedProfile } = require('./profileSync');
const { removeAllTagProfiles } = require('./tagProfileSync');
const { removeCombinedShippingDiscount } = require('./combinedShipping');
const logger = require('../utils/logger');

async function teardownBillingLapsed(shop, token) {
  const results = {};

  try {
    results.profile = await removeSyncedProfile(shop, token);
  } catch (err) {
    logger.error('Teardown: removing native shipping rates failed', { shop, error: err.message });
    results.profile = { ok: false, error: err.message };
  }

  try {
    results.tagProfiles = await removeAllTagProfiles(shop, token);
  } catch (err) {
    logger.error('Teardown: removing tag profiles failed', { shop, error: err.message });
    results.tagProfiles = { ok: false, error: err.message };
  }

  try {
    results.discount = await removeCombinedShippingDiscount(shop, token);
  } catch (err) {
    logger.error('Teardown: removing combined-shipping discount failed', { shop, error: err.message });
    results.discount = { ok: false, error: err.message };
  }

  logger.info('Billing lapsed — Shopify-side app data removed', { shop, results });
  return results;
}

module.exports = { teardownBillingLapsed };
