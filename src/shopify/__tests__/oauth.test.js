const crypto = require('crypto');
const {
  isValidShop, publicBaseUrl, buildAuthorizeUrl, verifyCallbackHmac,
} = require('../oauth');

describe('isValidShop', () => {
  test('accepts myshopify domains, rejects everything else', () => {
    expect(isValidShop('test.myshopify.com')).toBe(true);
    expect(isValidShop('2c99af-3.myshopify.com')).toBe(true);
    expect(isValidShop('evil.example.com')).toBe(false);
    expect(isValidShop('test.myshopify.com.evil.com')).toBe(false);
    expect(isValidShop('')).toBe(false);
  });
});

describe('publicBaseUrl', () => {
  const orig = process.env.PUBLIC_URL;
  afterEach(() => { process.env.PUBLIC_URL = orig; });

  test('keeps https and strips trailing slash', () => {
    process.env.PUBLIC_URL = 'https://app.example.com/';
    expect(publicBaseUrl()).toBe('https://app.example.com');
  });

  test('upgrades http to https for non-local hosts', () => {
    process.env.PUBLIC_URL = 'http://app.example.com';
    expect(publicBaseUrl()).toBe('https://app.example.com');
  });

  test('adds https when the scheme is missing', () => {
    process.env.PUBLIC_URL = 'app.example.com';
    expect(publicBaseUrl()).toBe('https://app.example.com');
  });

  test('keeps http for localhost', () => {
    process.env.PUBLIC_URL = 'http://localhost:3000';
    expect(publicBaseUrl()).toBe('http://localhost:3000');
  });
});

describe('buildAuthorizeUrl', () => {
  test('includes all required OAuth params and offline grant option', () => {
    const url = buildAuthorizeUrl({
      shop: 'test.myshopify.com',
      apiKey: 'key123',
      scopes: 'write_shipping,read_products',
      redirectUri: 'https://app.example.com/auth/callback',
      state: 'nonce42',
    });
    expect(url.startsWith('https://test.myshopify.com/admin/oauth/authorize?')).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get('client_id')).toBe('key123');
    expect(q.get('scope')).toBe('write_shipping,read_products');
    expect(q.get('redirect_uri')).toBe('https://app.example.com/auth/callback');
    expect(q.get('state')).toBe('nonce42');
    expect(q.has('grant_options[]')).toBe(true);
  });
});

describe('verifyCallbackHmac', () => {
  const secret = 'shhh-secret';

  function sign(params) {
    const message = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
    return crypto.createHmac('sha256', secret).update(message).digest('hex');
  }

  test('accepts a correctly signed callback', () => {
    const params = { code: 'abc', shop: 'test.myshopify.com', state: 'x', timestamp: '123' };
    const hmac = sign(params);
    expect(verifyCallbackHmac({ ...params, hmac }, secret)).toBe(true);
  });

  test('rejects a tampered callback', () => {
    const params = { code: 'abc', shop: 'test.myshopify.com', state: 'x', timestamp: '123' };
    const hmac = sign(params);
    expect(verifyCallbackHmac({ ...params, code: 'tampered', hmac }, secret)).toBe(false);
  });

  test('rejects when hmac is missing', () => {
    expect(verifyCallbackHmac({ code: 'abc' }, secret)).toBe(false);
  });

  test('ignores the signature param when present', () => {
    const params = { code: 'abc', shop: 'test.myshopify.com', timestamp: '123' };
    const hmac = sign(params);
    expect(verifyCallbackHmac({ ...params, signature: 'legacy', hmac }, secret)).toBe(true);
  });
});
