require('dotenv').config();
const express = require('express');
const path = require('path');
const logger = require('./utils/logger');
const { handleCarrierRequest } = require('./carrier');
const authRouter = require('./routes/auth');
const webhooksRouter = require('./routes/webhooks');
const rulesRouter = require('./routes/api/rules');
const legalRouter = require('./routes/legal');

const app = express();
const PORT = process.env.PORT || 3000;

// Raw body capture for HMAC verification (carrier + webhooks)
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); },
}));

// Auth (OAuth flow)
app.use(authRouter);

// Mandatory GDPR + uninstall webhooks — must come before session middleware
app.use(webhooksRouter);

// Rules CRUD API (session-protected)
app.use('/api/rules', rulesRouter);

// Carrier service callback (called by Shopify at checkout)
app.post('/api/carrier-service', handleCarrierRequest);

// Legal pages (privacy policy, terms — required for App Store)
app.use(legalRouter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve the built React frontend
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Shopify-INT running on port ${PORT}`);
    logger.info('Carrier: POST /api/carrier-service?shop=<shop-domain>');
  });
}

module.exports = app;
