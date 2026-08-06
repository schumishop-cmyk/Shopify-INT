const fs = require('fs');
const path = require('path');

jest.mock('../database', () => ({
  prepare: () => ({ run: jest.fn(), get: jest.fn(), all: jest.fn(() => []) }),
  exec: jest.fn(), pragma: jest.fn(), transaction: jest.fn((fn) => fn),
}));

const { rulesPathForCountry } = require('../rules');

describe('rulesPathForCountry', () => {
  test('picks the US starter set for a US shop', () => {
    expect(path.basename(rulesPathForCountry('US'))).toBe('shipping-rules.us.json');
  });

  test('is case-insensitive', () => {
    expect(path.basename(rulesPathForCountry('us'))).toBe('shipping-rules.us.json');
  });

  test('falls back to the default set for other countries', () => {
    expect(path.basename(rulesPathForCountry('DE'))).toBe('shipping-rules.json');
    expect(path.basename(rulesPathForCountry('FR'))).toBe('shipping-rules.json');
  });

  test('falls back to the default set when the country is unknown', () => {
    expect(path.basename(rulesPathForCountry(null))).toBe('shipping-rules.json');
    expect(path.basename(rulesPathForCountry(undefined))).toBe('shipping-rules.json');
  });
});

describe('starter rule sets', () => {
  // Both files are seeded verbatim into shops, so a malformed one would break
  // installs — validate the shape the seeder and sync depend on.
  for (const file of ['shipping-rules.json', 'shipping-rules.us.json']) {
    test(`${file} is valid and complete`, () => {
      const config = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../../../config', file), 'utf-8')
      );
      expect(Array.isArray(config.rules)).toBe(true);
      expect(config.rules.length).toBeGreaterThan(0);

      const ids = new Set();
      for (const rule of config.rules) {
        expect(typeof rule.id).toBe('string');
        expect(ids.has(rule.id)).toBe(false); // ids must be unique per set
        ids.add(rule.id);
        expect(typeof rule.name).toBe('string');
        expect(typeof rule.priority).toBe('number');
        expect(rule.rates.length).toBeGreaterThan(0);
        for (const rate of rule.rates) {
          expect(typeof rate.serviceName).toBe('string');
          expect(Number.isInteger(rate.price)).toBe(true); // cents, never floats
          expect(rate.price).toBeGreaterThanOrEqual(0);
        }
      }
    });
  }

  test('the US set prices in USD and uses US carriers', () => {
    const config = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../../../config/shipping-rules.us.json'), 'utf-8')
    );
    expect(config.currency).toBe('USD');
    const services = config.rules.flatMap((r) => r.rates.map((rate) => rate.serviceName)).join(' ');
    expect(services).toMatch(/USPS|UPS|FedEx/);
    expect(services).not.toMatch(/DHL/);
  });
});
