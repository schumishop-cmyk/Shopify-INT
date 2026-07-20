const https = require('https');

const API_VERSION = '2026-01';

/**
 * Normalizes Shopify's various error shapes into a consistent array of
 * `{ message }` objects (or undefined when there are none).
 *
 * The Admin GraphQL API returns errors as:
 *   - an array of { message, ... }        (normal GraphQL errors)
 *   - a string                            (e.g. "[API] Invalid API key or
 *                                          access token", "Not Found" for a
 *                                          bad API version)
 *   - an object { message }               (some auth/throttle responses)
 * Callers do `errors.map(e => e.message)`, so coerce everything to the
 * array shape to avoid "errors.map is not a function" crashes.
 */
function normalizeErrors(errors) {
  if (!errors) return undefined;
  if (Array.isArray(errors)) return errors.length ? errors : undefined;
  if (typeof errors === 'string') return [{ message: errors }];
  if (typeof errors === 'object') {
    if (typeof errors.message === 'string') return [{ message: errors.message }];
    return [{ message: JSON.stringify(errors) }];
  }
  return [{ message: String(errors) }];
}

/**
 * Minimal GraphQL client for the Shopify Admin API.
 * Resolves with { data, errors } (errors is a normalized array or undefined);
 * network failures reject.
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
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch {
          // Non-JSON body (e.g. an HTML error page) — surface it as an error
          resolve({
            data: undefined,
            errors: [{ message: `HTTP ${res.statusCode}: ${data.slice(0, 200)}` }],
          });
          return;
        }
        resolve({ data: parsed.data, errors: normalizeErrors(parsed.errors) });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { adminGraphql, API_VERSION, normalizeErrors };
