const crypto = require('crypto');
const RuleEngine = require('./rules/engine');
const { loadRules } = require('./rules/loader');
const logger = require('./utils/logger');

let engine;

function getEngine() {
  if (!engine) {
    engine = new RuleEngine(loadRules());
  }
  return engine;
}

/** Reload rules without restarting the server (e.g. after config update). */
function reloadRules() {
  engine = new RuleEngine(loadRules());
  logger.info('Shipping rules reloaded');
}

/**
 * Verifies the HMAC signature Shopify attaches to carrier service requests.
 * Shopify does NOT sign carrier service callbacks with HMAC by default —
 * the secret here is a shared token you set in the carrier service registration
 * and validate manually. Treat it as a bearer token via the callback_url path.
 *
 * For extra security this implementation also accepts an X-Shopify-Hmac-Sha256
 * header if present (useful when proxied through Shopify Functions in the future).
 */
function verifyRequest(req) {
  const secret = process.env.CARRIER_SERVICE_SECRET;
  if (!secret) return true; // skip verification if no secret configured

  const hmacHeader = req.headers['x-shopify-hmac-sha256'];
  if (!hmacHeader) return true; // Shopify REST carrier service does not sign requests

  const body = req.rawBody || JSON.stringify(req.body);
  const digest = crypto.createHmac('sha256', secret).update(body).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

/**
 * POST /api/carrier-service
 * Shopify sends the cart payload and expects a list of available shipping rates.
 */
async function handleCarrierRequest(req, res) {
  if (!verifyRequest(req)) {
    logger.warn('Invalid HMAC signature on carrier request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body?.rate;
  if (!payload || !payload.destination || !Array.isArray(payload.items)) {
    logger.warn('Malformed carrier service request', { body: req.body });
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const rates = getEngine().evaluate(payload);
    logger.info('Carrier rates computed', {
      country: payload.destination.country,
      ratesCount: rates.length,
    });
    return res.json({ rates });
  } catch (err) {
    logger.error('Error evaluating shipping rules', { error: err.message, stack: err.stack });
    return res.status(500).json({ rates: [] });
  }
}

module.exports = { handleCarrierRequest, reloadRules };
