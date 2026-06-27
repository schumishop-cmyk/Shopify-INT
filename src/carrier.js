const crypto = require('crypto');
const RuleEngine = require('./rules/engine');
const { getRulesForShop } = require('./db/rules');
const { getShop } = require('./db/shops');
const logger = require('./utils/logger');

// Per-shop engine cache: shop → { engine, rulesHash }
const engineCache = new Map();

function getEngine(shop, rules) {
  const hash = JSON.stringify(rules.map((r) => r.updated_at + r.id));
  const cached = engineCache.get(shop);
  if (cached && cached.hash === hash) return cached.engine;

  const engine = new RuleEngine(rules);
  engineCache.set(shop, { engine, hash });
  return engine;
}

function verifyRequest(req) {
  const secret = process.env.CARRIER_SERVICE_SECRET;
  if (!secret) return true;

  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  if (!hmacHeader) return true;

  const body = req.rawBody || JSON.stringify(req.body);
  const digest = crypto.createHmac('sha256', secret).update(body).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

/**
 * POST /api/carrier-service
 *
 * Shopify sends the cart payload with the shop domain in the URL query
 * (?shop=store.myshopify.com) or we derive it from the callback_url registration.
 * Rules are loaded from DB for that specific shop.
 */
async function handleCarrierRequest(req, res) {
  if (!verifyRequest(req)) {
    logger.warn('Invalid HMAC signature on carrier request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).json({ error: 'Missing shop parameter' });
  }

  const shopRow = getShop.get(shop);
  if (!shopRow || shopRow.uninstalled_at) {
    return res.status(404).json({ error: 'Shop not found' });
  }

  const payload = req.body?.rate;
  if (!payload || !payload.destination || !Array.isArray(payload.items)) {
    logger.warn('Malformed carrier service request', { shop, body: req.body });
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const rules = getRulesForShop(shop);
    const engine = getEngine(shop, rules);
    const rates = engine.evaluate(payload);

    logger.info('Carrier rates computed', {
      shop,
      country: payload.destination.country,
      ratesCount: rates.length,
    });

    return res.json({ rates });
  } catch (err) {
    logger.error('Error evaluating shipping rules', { shop, error: err.message });
    return res.status(500).json({ rates: [] });
  }
}

module.exports = { handleCarrierRequest };
