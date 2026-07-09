const https = require('https');

const API_VERSION = '2024-01';

/**
 * Minimal GraphQL client for the Shopify Admin API.
 * Resolves with { data, errors } — network failures reject.
 */
function adminGraphql(shop, token, query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request({
      hostname: shop,
      path: `/admin/api/${API_VERSION}/graphql.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ data: parsed.data, errors: parsed.errors });
        } catch {
          reject(new Error(`Invalid GraphQL response (HTTP ${res.statusCode}): ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { adminGraphql, API_VERSION };
