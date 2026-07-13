const { Router } = require('express');
const shopify = require('../shopify/client');
const { upsertShop } = require('../db/shops');
const { seedDefaultRules } = require('../db/rules');
const { registerUninstallWebhook } = require('../shopify/webhookRegistration');
const logger = require('../utils/logger');

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

    // Legacy install flow can't declare webhooks in the TOML — subscribe
    // app/uninstalled here so we can clean up when the shop removes the app.
    await registerUninstallWebhook(session.shop, session.accessToken);

    // No automatic profile sync here: writing into the merchant's shipping
    // settings only happens when they explicitly click "Synchronisieren".

    logger.info('Shop installed', { shop: session.shop });

    // Embedded app: send the merchant back into the Shopify admin,
    // where our app loads inside the iframe with App Bridge.
    return res.redirect(
      `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`
    );
  } catch (err) {
    logger.error('OAuth callback error', { error: err.message });
    return res.status(500).send('OAuth failed: ' + err.message);
  }
});

module.exports = router;
