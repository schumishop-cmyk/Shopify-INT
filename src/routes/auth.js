const { Router } = require('express');
const shopify = require('../shopify/client');
const { upsertShop, setCarrierServiceId } = require('../db/shops');
const { seedDefaultRules } = require('../db/rules');
const logger = require('../utils/logger');
const https = require('https');

const router = Router();

/** Step 1 — Merchant clicks "Install" on the App Store */
router.get('/auth/begin', async (req, res) => {
  await shopify.auth.begin({
    shop: shopify.utils.sanitizeShop(req.query.shop, true),
    callbackPath: '/auth/callback',
    isOnline: false,
    rawRequest: req,
    rawResponse: res,
  });
});

/** Step 2 — Shopify redirects back here with the auth code */
router.get('/auth/callback', async (req, res) => {
  try {
    const callback = await shopify.auth.callback({ rawRequest: req, rawResponse: res });
    const session = callback.session;

    upsertShop.run({
      shop: session.shop,
      access_token: session.accessToken,
      scope: session.scope,
    });

    seedDefaultRules(session.shop);
    await registerCarrierService(session.shop, session.accessToken);

    logger.info('Shop installed', { shop: session.shop });

    const host = req.query.host;
    return res.redirect(`/?shop=${session.shop}&host=${host}`);
  } catch (err) {
    logger.error('OAuth callback error', { error: err.message });
    return res.status(500).send('OAuth failed: ' + err.message);
  }
});

async function registerCarrierService(shop, token) {
  const publicUrl = process.env.PUBLIC_URL;
  if (!publicUrl) {
    logger.warn('PUBLIC_URL not set — skipping carrier service registration', { shop });
    return;
  }

  const body = JSON.stringify({
    carrier_service: {
      name: 'Shopify-INT Versandregeln',
      callback_url: `${publicUrl}/api/carrier-service?shop=${encodeURIComponent(shop)}`,
      service_discovery: true,
      format: 'json',
    },
  });

  return new Promise((resolve) => {
    const opts = {
      hostname: shop,
      path: '/admin/api/2024-01/carrier_services.json',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode === 201) {
            setCarrierServiceId.run(parsed.carrier_service.id, shop);
            logger.info('Carrier service registered', { shop, id: parsed.carrier_service.id });
          } else {
            logger.warn('Carrier service registration failed', { shop, status: res.statusCode, body: data });
          }
        } catch (e) {
          logger.error('Error parsing carrier registration response', { error: e.message });
        }
        resolve();
      });
    });

    req.on('error', (e) => {
      logger.error('Carrier registration request error', { error: e.message });
      resolve();
    });

    req.write(body);
    req.end();
  });
}

module.exports = router;
