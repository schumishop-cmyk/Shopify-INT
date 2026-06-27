/**
 * Mandatory GDPR webhooks required for Shopify App Store listing.
 * Shopify verifies these are present before approving the app.
 *
 * All webhook bodies arrive as raw buffers — HMAC verification uses
 * the raw body, so express.json() must NOT parse these routes first.
 */
const { Router } = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { markUninstalled } = require('../db/shops');
const logger = require('../utils/logger');

const router = Router();

function verifyWebhookHmac(req, res, next) {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) return next();

  const hmac = req.headers['x-shopify-hmac-sha256'];
  if (!hmac) return res.status(401).send('Missing HMAC');

  const digest = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody || '')
    .digest('base64');

  if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac))) {
    logger.warn('Webhook HMAC mismatch');
    return res.status(401).send('Unauthorized');
  }
  next();
}

// rawBody is pre-populated by express.json({ verify }) in server.js

/** APP UNINSTALL — clean up shop data */
router.post('/webhooks/app/uninstalled', verifyWebhookHmac, (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  if (shop) {
    markUninstalled.run(shop);
    logger.info('Shop uninstalled', { shop });
  }
  res.sendStatus(200);
});

/** GDPR: Customer data request — log the request; we don't store PII */
router.post('/webhooks/customers/data_request', verifyWebhookHmac, (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  logger.info('GDPR customer data request received', { shop, customerId: req.body?.customer?.id });
  // We don't store customer personal data — acknowledge immediately
  res.sendStatus(200);
});

/** GDPR: Customer redact — delete any customer data we hold */
router.post('/webhooks/customers/redact', verifyWebhookHmac, (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  logger.info('GDPR customer redact request', { shop, customerId: req.body?.customer?.id });
  // No customer PII stored — acknowledge
  res.sendStatus(200);
});

/** GDPR: Shop redact — delete all data for a shop 48h after uninstall */
router.post('/webhooks/shop/redact', verifyWebhookHmac, (req, res) => {
  const shop = req.headers['x-shopify-shop-domain'];
  if (shop) {
    db.prepare('DELETE FROM shipping_rules WHERE shop = ?').run(shop);
    db.prepare('DELETE FROM sessions WHERE shop = ?').run(shop);
    db.prepare('DELETE FROM shops WHERE shop = ?').run(shop);
    logger.info('GDPR shop redact complete — all data deleted', { shop });
  }
  res.sendStatus(200);
});

module.exports = router;
