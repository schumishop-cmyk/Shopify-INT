require('dotenv').config();
const { shopifyApi, ApiVersion, Session } = require('@shopify/shopify-api');
const { restResources } = require('@shopify/shopify-api/rest/admin/2024-01');

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY || 'n/a',
  apiSecretKey: process.env.SHOPIFY_API_SECRET || 'n/a',
  adminApiAccessToken: process.env.SHOPIFY_ACCESS_TOKEN,
  hostName: process.env.SHOPIFY_SHOP_DOMAIN || '',
  apiVersion: ApiVersion.January24,
  isEmbeddedApp: false,
  restResources,
});

function getSession() {
  return new Session({
    id: 'offline_session',
    shop: process.env.SHOPIFY_SHOP_DOMAIN,
    state: '',
    isOnline: false,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
  });
}

module.exports = { shopify, getSession };
