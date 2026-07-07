const crypto = require('crypto');

/** Builds App Bridge-style session-token JWTs for tests. */
function makeSessionToken({
  shop = 'test.myshopify.com',
  aud = 'test-api-key',
  exp,
  nbf,
  secret = 'test-api-secret',
  alg = 'HS256',
  dest,
} = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: `https://${shop}/admin`,
    dest: dest ?? `https://${shop}`,
    aud,
    sub: '42',
    exp: exp ?? now + 60,
    nbf: nbf ?? now - 10,
    iat: now,
    jti: 'jti',
    sid: 'sid',
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

module.exports = { makeSessionToken };
