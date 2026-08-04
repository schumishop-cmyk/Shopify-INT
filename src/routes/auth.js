const { Router } = require('express');
const crypto = require('crypto');
const { upsertShop } = require('../db/shops');
const { seedDefaultRules } = require('../db/rules');
const { registerUninstallWebhook, registerSubscriptionWebhook } = require('../shopify/webhookRegistration');
const {
  isValidShop, publicBaseUrl, buildAuthorizeUrl, verifyCallbackHmac, exchangeCode,
} = require('../shopify/oauth');
const logger = require('../utils/logger');

const router = Router();

// Must match shopify.app.toml [access_scopes]
const SCOPES = 'write_shipping,write_discounts,read_products,read_locations';
const STATE_COOKIE = 'shopify_oauth_state';

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

/** Step 1 — start OAuth: redirect the merchant to the Shopify consent screen */
router.get('/auth/begin', (req, res) => {
  const shop = String(req.query.shop || '').toLowerCase();
  if (!isValidShop(shop)) return res.status(400).send('Invalid shop parameter');

  const state = crypto.randomBytes(16).toString('hex');
  res.setHeader('Set-Cookie',
    `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);

  const url = buildAuthorizeUrl({
    shop,
    apiKey: process.env.SHOPIFY_API_KEY,
    scopes: SCOPES,
    redirectUri: `${publicBaseUrl()}/auth/callback`,
    state,
  });
  return res.redirect(url);
});

/** Step 2 — Shopify redirects back with the auth code; exchange for tokens */
router.get('/auth/callback', async (req, res) => {
  try {
    const shop = String(req.query.shop || '').toLowerCase();
    if (!isValidShop(shop)) return res.status(400).send('Invalid shop');

    if (!verifyCallbackHmac(req.query, process.env.SHOPIFY_API_SECRET)) {
      return res.status(401).send('HMAC validation failed');
    }

    const cookies = parseCookies(req.headers.cookie);
    if (!req.query.state || req.query.state !== cookies[STATE_COOKIE]) {
      return res.status(403).send('OAuth state mismatch');
    }

    // Expiring offline token (expiring=1) → access_token + refresh_token
    const tokens = await exchangeCode({
      shop,
      apiKey: process.env.SHOPIFY_API_KEY,
      apiSecret: process.env.SHOPIFY_API_SECRET,
      code: req.query.code,
    });

    const now = Date.now();
    upsertShop.run({
      shop,
      access_token: tokens.access_token,
      scope: tokens.scope || SCOPES,
      refresh_token: tokens.refresh_token || null,
      token_expires_at: tokens.expires_in
        ? new Date(now + tokens.expires_in * 1000).toISOString() : null,
      refresh_token_expires_at: tokens.refresh_token_expires_in
        ? new Date(now + tokens.refresh_token_expires_in * 1000).toISOString() : null,
    });

    seedDefaultRules(shop);
    // Legacy install flow can't declare webhooks in the TOML — subscribe
    // app/uninstalled here so we can clean up on removal, and
    // app_subscriptions/update so we can tear down live shipping data when
    // billing lapses (trial ends unpaid, payment fails, plan cancelled).
    await registerUninstallWebhook(shop, tokens.access_token);
    await registerSubscriptionWebhook(shop, tokens.access_token);

    logger.info('Shop installed', { shop, expiringToken: Boolean(tokens.refresh_token) });

    res.setHeader('Set-Cookie', `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
    return res.redirect(`https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}`);
  } catch (err) {
    logger.error('OAuth callback error', { error: err.message });
    return res.status(500).send('OAuth failed: ' + err.message);
  }
});

module.exports = router;
