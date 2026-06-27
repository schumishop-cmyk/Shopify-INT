require('dotenv').config();
const express = require('express');
const logger = require('./utils/logger');
const { handleCarrierRequest, reloadRules } = require('./carrier');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf.toString(); },
}));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Carrier service callback — Shopify calls this at checkout
app.post('/api/carrier-service', handleCarrierRequest);

// Hot-reload shipping rules without restarting
app.post('/api/reload-rules', (req, res) => {
  const secret = process.env.CARRIER_SERVICE_SECRET;
  if (secret && req.headers['x-admin-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    reloadRules();
    res.json({ message: 'Shipping rules reloaded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

if (require.main === module) {
  app.listen(PORT, () => {
    logger.info(`Shopify Carrier Service running on port ${PORT}`);
    logger.info(`Carrier endpoint: POST /api/carrier-service`);
  });
}

module.exports = app;
