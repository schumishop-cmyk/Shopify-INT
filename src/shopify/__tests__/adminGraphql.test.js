const { normalizeErrors } = require('../adminGraphql');

describe('normalizeErrors', () => {
  test('returns undefined when there are no errors', () => {
    expect(normalizeErrors(undefined)).toBeUndefined();
    expect(normalizeErrors(null)).toBeUndefined();
    expect(normalizeErrors([])).toBeUndefined();
  });

  test('passes through a normal GraphQL error array', () => {
    const errs = [{ message: 'Field x not found' }];
    expect(normalizeErrors(errs)).toBe(errs);
  });

  test('wraps a string error (e.g. invalid access token, Not Found)', () => {
    expect(normalizeErrors('[API] Invalid API key or access token')).toEqual([
      { message: '[API] Invalid API key or access token' },
    ]);
  });

  test('wraps an object error with a message field', () => {
    expect(normalizeErrors({ message: 'Throttled' })).toEqual([{ message: 'Throttled' }]);
  });

  test('stringifies an object error without a message field', () => {
    const res = normalizeErrors({ query: 'bad' });
    expect(res).toHaveLength(1);
    expect(res[0].message).toContain('query');
  });

  test('result is always .map-able (the crash we are fixing)', () => {
    for (const input of ['a string', { message: 'obj' }, [{ message: 'arr' }]]) {
      const out = normalizeErrors(input);
      expect(() => out.map((e) => e.message)).not.toThrow();
    }
  });
});
