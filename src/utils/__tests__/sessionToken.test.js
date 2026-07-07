const { verifySessionToken } = require('../sessionToken');
const { makeSessionToken } = require('../../testutils/makeSessionToken');

const opts = { apiKey: 'test-api-key', apiSecret: 'test-api-secret' };

describe('verifySessionToken', () => {
  test('accepts a valid token and extracts the shop', () => {
    const { shop } = verifySessionToken(makeSessionToken(), opts);
    expect(shop).toBe('test.myshopify.com');
  });

  test('rejects a token signed with the wrong secret', () => {
    const token = makeSessionToken({ secret: 'attacker-secret' });
    expect(() => verifySessionToken(token, opts)).toThrow('Invalid signature');
  });

  test('rejects an expired token', () => {
    const token = makeSessionToken({ exp: Math.floor(Date.now() / 1000) - 120 });
    expect(() => verifySessionToken(token, opts)).toThrow('expired');
  });

  test('rejects a token for a different app (aud mismatch)', () => {
    const token = makeSessionToken({ aud: 'some-other-app' });
    expect(() => verifySessionToken(token, opts)).toThrow('audience');
  });

  test('rejects malformed tokens', () => {
    expect(() => verifySessionToken('not.a.jwt.at.all', opts)).toThrow();
    expect(() => verifySessionToken('garbage', opts)).toThrow('Malformed');
  });

  test('rejects non-HS256 algorithms', () => {
    const token = makeSessionToken({ alg: 'none' });
    expect(() => verifySessionToken(token, opts)).toThrow('Unsupported algorithm');
  });

  test('rejects dest outside myshopify.com', () => {
    const token = makeSessionToken({ dest: 'https://evil.example.com' });
    expect(() => verifySessionToken(token, opts)).toThrow('Invalid shop domain');
  });

  test('throws when API credentials are not configured', () => {
    expect(() => verifySessionToken(makeSessionToken(), { apiKey: '', apiSecret: '' })).toThrow('credentials');
  });
});
