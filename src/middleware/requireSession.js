const shopify = require('../shopify/client');
const { getShop } = require('../db/shops');

/**
 * Verifies that the request has a valid Shopify session (offline token).
 * For API routes called from the embedded app the session token is passed
 * in the Authorization header as a Bearer JWT.
 */
async function requireSession(req, res, next) {
  try {
    const sessionId = await shopify.session.getCurrentId({
      isOnline: false,
      rawRequest: req,
      rawResponse: res,
    });

    if (!sessionId) return res.status(401).json({ error: 'No session' });

    const session = await shopify.config.sessionStorage.loadSession(sessionId);
    if (!session?.accessToken) return res.status(401).json({ error: 'Session invalid or expired' });

    // Attach shop context to request
    req.shopSession = session;
    req.shop = session.shop;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized', detail: err.message });
  }
}

/**
 * Lightweight alternative: verify via X-Shop-Domain header + DB lookup.
 * Used for the carrier service endpoint where we verify by access token.
 */
async function requireShopHeader(req, res, next) {
  const shop = req.headers['x-shop-domain'];
  if (!shop) return res.status(401).json({ error: 'Missing X-Shop-Domain header' });

  const row = getShop.get(shop);
  if (!row || row.uninstalled_at) return res.status(401).json({ error: 'Shop not found or uninstalled' });

  req.shop = shop;
  req.shopToken = row.access_token;
  next();
}

module.exports = { requireSession, requireShopHeader };
