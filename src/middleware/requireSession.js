const { verifySessionToken } = require('../utils/sessionToken');
const { getShop } = require('../db/shops');
const { getValidToken } = require('../shopify/tokens');
const logger = require('../utils/logger');

/**
 * Authenticates embedded-app API requests via App Bridge session tokens.
 *
 * The frontend fetches a short-lived JWT with shopify.idToken() and sends it
 * as `Authorization: Bearer <token>`. We verify the HS256 signature against
 * our API secret — the shop identity comes from the verified `dest` claim,
 * never from a client-controlled header.
 *
 * req.shopToken is a currently-valid Admin API access token: expiring offline
 * tokens are refreshed transparently before the request proceeds.
 */
async function requireSessionToken(req, res, next) {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!match) {
    return res.status(401).json({ error: 'Missing session token' });
  }

  let shop;
  try {
    ({ shop } = verifySessionToken(match[1], {
      apiKey: process.env.SHOPIFY_API_KEY,
      apiSecret: process.env.SHOPIFY_API_SECRET,
    }));
  } catch (err) {
    logger.warn('Session token rejected', { reason: err.message });
    return res.status(401).json({ error: 'Invalid session token' });
  }

  const row = getShop.get(shop);
  if (!row || row.uninstalled_at) {
    return res.status(401).json({ error: 'App not installed for this shop' });
  }

  try {
    req.shopToken = await getValidToken(shop);
  } catch (err) {
    logger.warn('Access token unavailable', { shop, error: err.message });
    return res.status(401).json(err.needsReauth
      ? {
        errorCode: 'sessionExpired',
        error: 'Session expired — please reopen or re-authorize the app.',
      }
      : {
        errorCode: 'tokenRefreshFailed',
        errorParams: { error: err.message },
        error: `Could not refresh the access token: ${err.message}`,
      });
  }

  req.shop = shop;
  next();
}

module.exports = { requireSessionToken };
