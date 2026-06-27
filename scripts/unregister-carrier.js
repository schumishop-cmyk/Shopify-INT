/**
 * Lists and removes all registered carrier services for this shop.
 * Run: CARRIER_SERVICE_ID=123456 node scripts/unregister-carrier.js
 * Or without ID to list all and pick manually.
 */
require('dotenv').config();
const https = require('https');

const SHOP = process.env.SHOPIFY_SHOP_DOMAIN;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const DELETE_ID = process.env.CARRIER_SERVICE_ID;

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: SHOP,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': TOKEN,
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  if (!SHOP || !TOKEN) {
    console.error('Missing SHOPIFY_SHOP_DOMAIN or SHOPIFY_ACCESS_TOKEN');
    process.exit(1);
  }

  const list = await request('GET', '/admin/api/2024-01/carrier_services.json');
  const services = list.body?.carrier_services || [];

  if (services.length === 0) {
    console.log('No carrier services registered.');
    return;
  }

  console.log('Registered carrier services:');
  services.forEach((s) => console.log(`  ID: ${s.id}  Name: ${s.name}  URL: ${s.callback_url}`));

  if (DELETE_ID) {
    const res = await request('DELETE', `/admin/api/2024-01/carrier_services/${DELETE_ID}.json`);
    if (res.status === 200) {
      console.log(`\n✓ Carrier service ${DELETE_ID} deleted.`);
    } else {
      console.error(`\n✗ Delete failed (status ${res.status})`);
    }
  } else {
    console.log('\nTo delete one: CARRIER_SERVICE_ID=<id> node scripts/unregister-carrier.js');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
