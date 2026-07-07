const { verifySessionToken } = require('../utils/sessionToken');
const { getShop } = require('../db/shops');
const logger = require('../utils/logger');

/**
 * Authenticates embedded-app API requests via App Bridge session tokens.
 *
 * The frontend fetches a short-lived JWT with shopify.idToken() and sends it
 * as `Authorization: Bearer <token>`. We verify the HS256 signature against
 * our API secret — the shop identity comes from the verified `dest` claim,
 * never from a client-controlled header.
 */
function requireSessionToken(req, res, next) {
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

  req.shop = shop;
  req.shopToken = row.access_token;
  next();
}

module.exports = { requireSessionToken };
