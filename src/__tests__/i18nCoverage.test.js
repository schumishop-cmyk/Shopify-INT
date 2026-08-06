const fs = require('fs');
const path = require('path');

/**
 * Guards the seam between backend and UI: the backend reports warnings and
 * errors as codes, and the admin UI looks them up in its message catalogs. A
 * code without a matching key would render as a raw identifier to the merchant,
 * which no unit test on either side would otherwise catch.
 *
 * Assertions compare lists (not booleans) so a failure names the missing keys.
 */

const ROOT = path.resolve(__dirname, '../..');
const I18N_DIR = path.join(ROOT, 'frontend/src/i18n');

const load = (file) => JSON.parse(fs.readFileSync(path.join(I18N_DIR, file), 'utf-8'));
const de = load('de.json');
const en = load('en.json');

/**
 * Collects every string literal assigned to `field` across the backend,
 * covering both object literals (`code: 'x'`) and assignments (`.code = 'x'`).
 */
function codesUsedInBackend(field) {
  const codes = new Set();
  const pattern = new RegExp(`(?:^|[^A-Za-z])${field}\\s*[:=]\\s*'([A-Za-z]+)'`, 'gm');

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full);
      } else if (entry.name.endsWith('.js')) {
        const source = fs.readFileSync(full, 'utf-8');
        for (const match of source.matchAll(pattern)) codes.add(match[1]);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  return [...codes];
}

/** Flattens { a: { b: 1 } } to ['a.b'] so catalogs can be compared key by key. */
function flatten(obj, prefix = '') {
  return Object.entries(obj).flatMap(([key, value]) => {
    const full = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'object' && value !== null ? flatten(value, full) : [full];
  });
}

const valueAt = (catalog, key) => key.split('.').reduce((node, part) => node?.[part], catalog);

describe('backend codes have translations', () => {
  test('every warning code exists in both catalogs', () => {
    const codes = codesUsedInBackend('code');
    expect(codes.length).toBeGreaterThan(0); // guards against a broken scan

    expect(codes.filter((c) => !de.warnings?.[c])).toEqual([]);
    expect(codes.filter((c) => !en.warnings?.[c])).toEqual([]);
  });

  test('every error code exists in both catalogs', () => {
    const codes = codesUsedInBackend('errorCode');
    expect(codes.length).toBeGreaterThan(0);

    expect(codes.filter((c) => !de.errors?.[c])).toEqual([]);
    expect(codes.filter((c) => !en.errors?.[c])).toEqual([]);
  });
});

describe('message catalogs are in sync', () => {
  test('German and English define exactly the same keys', () => {
    expect(flatten(de).sort()).toEqual(flatten(en).sort());
  });

  test('no message is empty or a non-string', () => {
    for (const [name, catalog] of [['de', de], ['en', en]]) {
      const broken = flatten(catalog).filter((key) => {
        const value = valueAt(catalog, key);
        return typeof value !== 'string' || value.trim().length === 0;
      });
      expect({ [name]: broken }).toEqual({ [name]: [] });
    }
  });

  test('placeholders match between languages', () => {
    const placeholders = (s) => (String(s).match(/\{(\w+)\}/g) || []).sort();
    const mismatched = flatten(de).filter((key) => (
      placeholders(valueAt(de, key)).join() !== placeholders(valueAt(en, key)).join()
    ));
    expect(mismatched).toEqual([]);
  });
});
