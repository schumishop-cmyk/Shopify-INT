const { getShop, updateTokens } = require('../db/shops');
const { refreshOfflineToken } = require('./oauth');
const logger = require('../utils/logger');

const REFRESH_BUFFER_MS = 2 * 60 * 1000; // refresh 2 min before expiry

function isoIn(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

/**
 * Returns a currently-valid Admin API access token for a shop, refreshing
 * the expiring offline token when it's within the buffer of expiry.
 *
 * - Legacy shops with a non-expiring token (no token_expires_at) are returned
 *   as-is — they keep working until they must re-authorize.
 * - On refresh, the new access + refresh tokens and expiries are persisted.
 * - If the refresh token is dead, throws with err.needsReauth so callers can
 *   tell the merchant to re-open the app.
 */
async function getValidToken(shop) {
  const row = getShop.get(shop);
  if (!row || row.uninstalled_at) {
    const err = new Error('App not installed for this shop');
    err.notInstalled = true;
    throw err;
  }

  // Non-expiring (legacy) token — use as-is
  if (!row.token_expires_at) return row.access_token;

  const expMs = Date.parse(row.token_expires_at);
  if (Number.isFinite(expMs) && Date.now() < expMs - REFRESH_BUFFER_MS) {
    return row.access_token;
  }

  // Expired / near expiry — refresh
  if (!row.refresh_token) return row.access_token; // nothing to refresh with

  const t = await refreshOfflineToken({
    shop,
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
    refreshToken: row.refresh_token,
  });

  updateTokens.run({
    shop,
    access_token: t.access_token,
    refresh_token: t.refresh_token || row.refresh_token,
    token_expires_at: t.expires_in ? isoIn(t.expires_in) : null,
    refresh_token_expires_at: t.refresh_token_expires_in ? isoIn(t.refresh_token_expires_in) : row.refresh_token_expires_at,
  });

  logger.info('Offline token refreshed', { shop });
  return t.access_token;
}

module.exports = { getValidToken };
