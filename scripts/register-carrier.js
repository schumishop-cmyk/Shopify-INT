/**
 * Registers this app as a Carrier Service in Shopify.
 * Run once: node scripts/register-carrier.js
 *
 * Prerequisites:
 *   - .env with SHOPIFY_SHOP_DOMAIN, SHOPIFY_ACCESS_TOKEN, PUBLIC_URL
 *   - Your server must be publicly reachable at PUBLIC_URL (use ngrok locally)
 *   - The access token needs write_shipping scope
 *
 * Note: Carrier-calculated shipping requires the Shopify plan to support it.
 * On Basic plan you may need to enable "Third-party calculated shipping rates"
 * under Settings > Shipping and delivery > Carrier accounts.
 */
require('dotenv').config();
const https = require('https');

const SHOP = process.env.SHOPIFY_SHOP_DOMAIN;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const PUBLIC_URL = process.env.PUBLIC_URL;

if (!SHOP || !TOKEN || !PUBLIC_URL) {
  console.error('Missing required env vars: SHOPIFY_SHOP_DOMAIN, SHOPIFY_ACCESS_TOKEN, PUBLIC_URL');
  process.exit(1);
}

const body = JSON.stringify({
  carrier_service: {
    name: 'Shopify-INT Versandregeln',
    callback_url: `${PUBLIC_URL}/api/carrier-service`,
    service_discovery: true,
    format: 'json',
  },
});

const options = {
  hostname: SHOP,
  path: '/admin/api/2024-01/carrier_services.json',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': TOKEN,
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    const parsed = JSON.parse(data);
    if (res.statusCode === 201) {
      console.log('✓ Carrier service registered successfully');
      console.log('  ID:', parsed.carrier_service.id);
      console.log('  Callback URL:', parsed.carrier_service.callback_url);
    } else {
      console.error('✗ Registration failed:', JSON.stringify(parsed, null, 2));
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error('Request error:', err.message);
  process.exit(1);
});

req.write(body);
req.end();
