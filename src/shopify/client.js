require('dotenv').config();
require('@shopify/shopify-api/adapters/node');
const { shopifyApi, ApiVersion, LogSeverity } = require('@shopify/shopify-api');
const { restResources } = require('@shopify/shopify-api/rest/admin/2024-01');
const sessionStorage = require('../db/sessionStorage');

if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
  if (process.env.NODE_ENV !== 'test') {
    console.warn('[shopify] SHOPIFY_API_KEY / SHOPIFY_API_SECRET not set — OAuth disabled');
  }
}

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || 'test-key',
  apiSecretKey: process.env.SHOPIFY_API_SECRET || 'test-secret',
  // Muss mit den Scopes in shopify.app.toml übereinstimmen — im Legacy-
  // Install-Flow bestimmt DIESE Liste, was der OAuth-Grant anfordert.
  // read_products:  Tag-Regeln suchen Produkte per Tag für die Profil-Zuordnung
  // read_locations: Standort-IDs für app-eigene Versandprofile (Tag-Regeln)
  scopes: ['write_shipping', 'write_discounts', 'read_products', 'read_locations'],
  hostName: (process.env.PUBLIC_URL || 'localhost:3000').replace(/^https?:\/\//, ''),
  hostScheme: process.env.PUBLIC_URL?.startsWith('https') ? 'https' : 'http',
  apiVersion: ApiVersion.January24,
  isEmbeddedApp: true,
  sessionStorage,
  restResources,
  logger: { level: process.env.NODE_ENV === 'production' ? LogSeverity.Warning : LogSeverity.Info },
});

module.exports = shopify;
