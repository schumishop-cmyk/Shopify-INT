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

// Derive host + scheme robustly from PUBLIC_URL. Only localhost is served
// over http; every real deployment (Railway etc.) is https — so if the
// scheme is missing or wrong in PUBLIC_URL, default to https for non-local
// hosts. This prevents an http:// redirect_uri that Shopify would reject as
// "unauthorized" (whitelisted callback is always https).
const rawPublicUrl = process.env.PUBLIC_URL || 'localhost:3000';
const hostName = rawPublicUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
const isLocal = /^localhost(:\d+)?$/.test(hostName) || hostName.startsWith('127.0.0.1');
const hostScheme = rawPublicUrl.startsWith('http://') || isLocal ? 'http' : 'https';

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || 'test-key',
  apiSecretKey: process.env.SHOPIFY_API_SECRET || 'test-secret',
  // Muss mit den Scopes in shopify.app.toml übereinstimmen — im Legacy-
  // Install-Flow bestimmt DIESE Liste, was der OAuth-Grant anfordert.
  // read_products:  Tag-Regeln suchen Produkte per Tag für die Profil-Zuordnung
  // read_locations: Standort-IDs für app-eigene Versandprofile (Tag-Regeln)
  scopes: ['write_shipping', 'write_discounts', 'read_products', 'read_locations'],
  hostName,
  hostScheme,
  apiVersion: ApiVersion.January24,
  isEmbeddedApp: true,
  sessionStorage,
  restResources,
  logger: { level: process.env.NODE_ENV === 'production' ? LogSeverity.Warning : LogSeverity.Info },
});

module.exports = shopify;
