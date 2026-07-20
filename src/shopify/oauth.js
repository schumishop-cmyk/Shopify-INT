const https = require('https');
const crypto = require('crypto');

/**
 * Manual Shopify OAuth (authorization code grant) with EXPIRING offline
 * tokens. As of Dec 2025 Shopify rejects non-expiring offline tokens for
 * the Admin API, so the code exchange sends `expiring=1` and we persist the
 * refresh token to rotate access tokens without merchant interaction.
 *
 * Docs: authentication-authorization/access-tokens/offline-access-tokens
 */

function isValidShop(shop) {
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

/** The app's public base URL, always https for non-local hosts, no trailing slash. */
function publicBaseUrl() {
  const raw = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const hasScheme = /^https?:\/\//.test(raw);
  const host = raw.replace(/^https?:\/\//, '');
  const isLocal = /^localhost(:\d+)?$/.test(host) || host.startsWith('127.0.0.1');
  if (hasScheme) {
    return raw.startsWith('http://') && !isLocal ? raw.replace(/^http:\/\//, 'https://') : raw;
  }
  return (isLocal ? 'http://' : 'https://') + host;
}

function buildAuthorizeUrl({ shop, apiKey, scopes, redirectUri, state }) {
  const params = new URLSearchParams({
    client_id: apiKey,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
    'grant_options[]': '', // empty = offline access token
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/**
 * Verifies the HMAC Shopify attaches to the OAuth callback query.
 * All params except hmac/signature are sorted and joined as key=value&…,
 * then HMAC-SHA256 with the client secret is compared to the hmac param.
 */
function verifyCallbackHmac(query, secret) {
  const { hmac, signature, ...rest } = query;
  if (!hmac || !secret) return false;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k].join(',') : rest[k]}`)
    .join('&');
  const digest = crypto.createHmac('sha256', secret).update(message).digest('hex');
  const a = Buffer.from(digest);
  const b = Buffer.from(String(hmac));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function postForm(shop, path, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const req = https.request({
      hostname: shop,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let parsed;
        try { parsed = data ? JSON.parse(data) : {}; }
        catch { return reject(new Error(`Token endpoint returned non-JSON (HTTP ${res.statusCode})`)); }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Exchanges an authorization code for an EXPIRING offline access token. */
async function exchangeCode({ shop, apiKey, apiSecret, code }) {
  const { status, body } = await postForm(shop, '/admin/oauth/access_token', {
    client_id: apiKey,
    client_secret: apiSecret,
    code,
    expiring: '1',
  });
  if (status !== 200 || !body.access_token) {
    throw new Error(`Token exchange failed (HTTP ${status}): ${body.error_description || body.error || JSON.stringify(body)}`);
  }
  // { access_token, scope, expires_in, refresh_token, refresh_token_expires_in }
  return body;
}

/** Rotates an expiring offline token using its refresh token. */
async function refreshOfflineToken({ shop, apiKey, apiSecret, refreshToken }) {
  const { status, body } = await postForm(shop, '/admin/oauth/access_token', {
    client_id: apiKey,
    client_secret: apiSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  if (status !== 200 || !body.access_token) {
    const err = new Error(`Token refresh failed (HTTP ${status}): ${body.error_description || body.error || 'unknown'}`);
    // 401 = refresh token dead (expired/invalidated) → merchant must re-open the app
    err.needsReauth = status === 401;
    throw err;
  }
  return body;
}

module.exports = {
  isValidShop,
  publicBaseUrl,
  buildAuthorizeUrl,
  verifyCallbackHmac,
  exchangeCode,
  refreshOfflineToken,
};
