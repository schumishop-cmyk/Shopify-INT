/**
 * Sends a test request to the local carrier service endpoint.
 * Run: node scripts/test-carrier.js
 */
require('dotenv').config();
const http = require('http');

const PORT = process.env.PORT || 3000;

const testPayloads = [
  {
    label: 'DE, 800g, 35 EUR (kein Freishipping)',
    rate: {
      origin: { country: 'DE', postal_code: '10115', city: 'Berlin', address1: 'Unter den Linden 1' },
      destination: { country: 'DE', postal_code: '80331', city: 'München', name: 'Max Mustermann', address1: 'Kaufingerstraße 1' },
      items: [{ name: 'Trikot', sku: 'TRI-001', quantity: 1, grams: 800, price: 3500, requires_shipping: true, product_tags: [] }],
      currency: 'EUR',
      locale: 'de',
    },
  },
  {
    label: 'DE, 500g, 65 EUR (Freishippping)',
    rate: {
      origin: { country: 'DE', postal_code: '10115', city: 'Berlin' },
      destination: { country: 'DE', postal_code: '20095', city: 'Hamburg', name: 'Erika Musterfrau', address1: 'Mönckebergstraße 1' },
      items: [{ name: 'Schuhe', sku: 'SCH-002', quantity: 1, grams: 500, price: 6500, requires_shipping: true, product_tags: [] }],
      currency: 'EUR',
      locale: 'de',
    },
  },
  {
    label: 'FR, 1kg, 45 EUR (EU)',
    rate: {
      origin: { country: 'DE', postal_code: '10115', city: 'Berlin' },
      destination: { country: 'FR', postal_code: '75001', city: 'Paris', name: 'Jean Dupont', address1: 'Rue de Rivoli 1' },
      items: [{ name: 'Ball', sku: 'BAL-003', quantity: 2, grams: 500, price: 2250, requires_shipping: true, product_tags: [] }],
      currency: 'EUR',
      locale: 'fr',
    },
  },
  {
    label: 'DE, Sperrgut-Tag',
    rate: {
      origin: { country: 'DE', postal_code: '10115', city: 'Berlin' },
      destination: { country: 'DE', postal_code: '50667', city: 'Köln', name: 'Hans Koeln', address1: 'Schildergasse 1' },
      items: [{ name: 'Tor', sku: 'TOR-010', quantity: 1, grams: 15000, price: 8900, requires_shipping: true, product_tags: ['sperrgut', 'bulky'] }],
      currency: 'EUR',
      locale: 'de',
    },
  },
];

function post(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ rate: payload.rate });
    const options = {
      hostname: 'localhost',
      port: PORT,
      path: '/api/carrier-service',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log(`Testing carrier service at http://localhost:${PORT}\n`);
  for (const payload of testPayloads) {
    console.log(`\n--- ${payload.label} ---`);
    try {
      const result = await post(payload);
      if (result.rates && result.rates.length > 0) {
        result.rates.forEach((r) => {
          const price = (parseInt(r.total_price) / 100).toFixed(2);
          console.log(`  ✓ ${r.service_name}: ${price} ${r.currency} (${r.min_delivery_date} – ${r.max_delivery_date})`);
        });
      } else {
        console.log('  (keine Versandoptionen gefunden)');
      }
    } catch (err) {
      console.error(`  ✗ Fehler: ${err.message}`);
    }
  }
}

main();
