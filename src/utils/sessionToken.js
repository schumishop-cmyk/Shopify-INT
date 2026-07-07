const crypto = require('crypto');

/**
 * Verifies a Shopify App Bridge session token (JWT, HS256).
 * https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens
 *
 * Session tokens are signed with the app's API secret and carry the shop
 * domain in the `dest` claim. They expire after 60 seconds, so the frontend
 * fetches a fresh one per request via shopify.idToken().
 *
 * @returns {{ shop: string, payload: object }} on success
 * @throws {Error} when the token is malformed, forged, expired, or for
 *                 another app
 */
function verifySessionToken(token, { apiKey, apiSecret, clockToleranceSeconds = 10 }) {
  if (!apiKey || !apiSecret) throw new Error('API credentials not configured');

  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('Malformed token');
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
  if (header.alg !== 'HS256') throw new Error(`Unsupported algorithm: ${header.alg}`);

  const expected = crypto
    .createHmac('sha256', apiSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const given = Buffer.from(signatureB64, 'base64url');
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    throw new Error('Invalid signature');
  }

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  const now = Math.floor(Date.now() / 1000);

  if (typeof payload.exp === 'number' && now > payload.exp + clockToleranceSeconds) {
    throw new Error('Token expired');
  }
  if (typeof payload.nbf === 'number' && now < payload.nbf - clockToleranceSeconds) {
    throw new Error('Token not yet valid');
  }
  if (payload.aud !== apiKey) throw new Error('Token audience does not match API key');
  if (!payload.dest) throw new Error('Missing dest claim');

  const shop = new URL(payload.dest).hostname;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) {
    throw new Error(`Invalid shop domain: ${shop}`);
  }

  return { shop, payload };
}

module.exports = { verifySessionToken };
