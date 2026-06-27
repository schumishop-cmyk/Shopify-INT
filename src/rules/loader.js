const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const CONFIG_PATH = path.resolve(__dirname, '../../config/shipping-rules.json');

function loadRules() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config = JSON.parse(raw);

  if (!Array.isArray(config.rules)) {
    throw new Error('shipping-rules.json must contain a "rules" array');
  }

  logger.info(`Loaded ${config.rules.length} shipping rules from config`);
  return config.rules;
}

module.exports = { loadRules };
