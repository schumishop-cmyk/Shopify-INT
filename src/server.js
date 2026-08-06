require('dotenv').config();
const express = require('express');
const path = require('path');
const logger = require('./utils/logger');
const authRouter = require('./routes/auth');
const webhooksRouter = require('./routes/webhooks');
const rulesRouter = require('./routes/api/rules');
const syncRouter = require('./routes/api/sync');
const combinedShippingRouter = require('./routes/api/combinedShipping');
const billingRouter = require('./routes/api/billing');
const shopContextRouter = require('./routes/api/shopContext');
const legalRouter = require('./routes/legal');
const { getShop } = require('./db/shops');
const { isValidShop, publicBaseUrl } = require('./shopify/oauth');

const app = express();
const PORT = process.env.PORT || 3000;

// Raw body capture for webhook HMAC verification
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); },
}));

// Clickjacking protection (App Store review requirement for embedded apps):
// only the requesting shop's admin may frame the app; everyone else is denied
app.use((req, res, next) => {
  const shop = String(req.query.shop || '');
  const validShop = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
  res.setHeader(
    'Content-Security-Policy',
    validShop
      ? `frame-ancestors https://${shop} https://admin.shopify.com;`
      : "frame-ancestors 'none';"
  );
  next();
});

// Auth (OAuth flow)
app.use(authRouter);

// Mandatory GDPR + uninstall webhooks — must come before session middleware
app.use(webhooksRouter);

// Rules CRUD API (session-protected)
app.use('/api/rules', rulesRouter);

// Delivery profile sync (session-protected)
app.use('/api/sync', syncRouter);

// Combined multi-origin shipping via discount function (session-protected)
app.use('/api/combined-shipping', combinedShippingRouter);

// Managed Pricing: subscription status + hosted plan-selection URL
app.use('/api/billing', billingRouter);

// Shop currency + weight unit, so the UI formats values the merchant's way
app.use('/api/shop-context', shopContextRouter);

// Legal pages (privacy policy, terms — required for App Store)
app.use(legalRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root gate: a shop hitting "/" must be sent into OAuth (App Store requirement:
// authenticate immediately after install, before any UI) when it is either
// not authenticated OR still holding a legacy non-expiring offline token.
// Re-running OAuth upgrades such a token to an expiring one (Shopify flags API
// calls made with non-expiring tokens). Installed shops with an expiring token
// fall through to the embedded frontend below.
app.get('/', (req, res, next) => {
  const shop = String(req.query.shop || '').toLowerCase();
  if (!shop || !isValidShop(shop)) return next();

  const row = getShop.get(shop);
  const installed = row && !row.uninstalled_at;
  // Pre-2026-07 installs stored a non-expiring token (no token_expires_at);
  // send them back through OAuth once to obtain an expiring/refreshable token.
  const legacyToken = installed && !row.token_expires_at;
  if (installed && !legacyToken) return next(); // installed, modern token → serve app

  const authPath = `/auth/begin?shop=${encodeURIComponent(shop)}`;
  const embedded = req.query.embedded === '1' || Boolean(req.query.host);
  if (embedded) {
    // Inside the Admin iframe we cannot 302 to Shopify's consent screen
    // (X-Frame-Options blocks it), so break out of the frame via top-level nav.
    const absolute = publicBaseUrl() + authPath;
    return res
      .type('html')
      .send(`<!doctype html><html><head><meta charset="utf-8"></head><body><script>
(function(){var u=${JSON.stringify(absolute)};if(window.top===window.self){window.location.href=u;}else{window.top.location.href=u;}})();
</script></body></html>`);
  }
  return res.redirect(authPath);
});

// Serve the built React frontend
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Shopify-INT running on port ${PORT}`);
  });
}

module.exports = app;
