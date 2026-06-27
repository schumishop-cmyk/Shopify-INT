const RuleEngine = require('../engine');

const baseRules = [
  {
    id: 'free-de',
    name: 'Free DE over 50 EUR',
    priority: 10,
    enabled: true,
    conditions: { destinationCountries: ['DE'], minCartPrice: 5000 },
    rates: [{ serviceName: 'Kostenlos', serviceCode: 'free', price: 0, description: '', minDeliveryDays: 2, maxDeliveryDays: 5 }],
  },
  {
    id: 'standard-de',
    name: 'Standard DE',
    priority: 20,
    enabled: true,
    // Only shown when cart is below the free-shipping threshold
    conditions: { destinationCountries: ['DE'], maxCartPrice: 4999 },
    rates: [{ serviceName: 'Standard', serviceCode: 'std', price: 495, description: '', minDeliveryDays: 2, maxDeliveryDays: 5 }],
  },
  {
    id: 'eu',
    name: 'EU',
    priority: 30,
    enabled: true,
    conditions: { destinationCountries: ['FR', 'AT'] },
    rates: [{ serviceName: 'EU', serviceCode: 'eu', price: 1290, description: '', minDeliveryDays: 5, maxDeliveryDays: 10 }],
  },
  {
    id: 'bulky',
    name: 'Bulky',
    priority: 5,
    enabled: true,
    conditions: { requireProductTags: ['sperrgut'] },
    rates: [{ serviceName: 'Sperrgut', serviceCode: 'bulky', price: 2990, description: '', minDeliveryDays: 5, maxDeliveryDays: 14 }],
  },
];

function makePayload({ country = 'DE', grams = 500, price = 3500, tags = [] } = {}) {
  return {
    destination: { country },
    items: [{ grams, price, quantity: 1, product_tags: tags }],
    currency: 'EUR',
  };
}

describe('RuleEngine', () => {
  let engine;
  beforeEach(() => { engine = new RuleEngine(baseRules); });

  test('returns standard rate for DE cart under threshold', () => {
    const rates = engine.evaluate(makePayload({ country: 'DE', price: 3500 }));
    expect(rates).toHaveLength(1);
    expect(rates[0].service_code).toBe('std');
    expect(rates[0].total_price).toBe('495');
  });

  test('returns free rate for DE cart at threshold', () => {
    const rates = engine.evaluate(makePayload({ country: 'DE', price: 5000 }));
    expect(rates).toHaveLength(1);
    expect(rates[0].service_code).toBe('free');
    expect(rates[0].total_price).toBe('0');
  });

  test('returns EU rate for FR', () => {
    const rates = engine.evaluate(makePayload({ country: 'FR', price: 3500 }));
    expect(rates).toHaveLength(1);
    expect(rates[0].service_code).toBe('eu');
  });

  test('returns empty array for unmatched country', () => {
    const rates = engine.evaluate(makePayload({ country: 'US' }));
    expect(rates).toHaveLength(0);
  });

  test('bulky tag rule has higher priority than standard DE', () => {
    const rates = engine.evaluate(makePayload({ country: 'DE', tags: ['sperrgut'] }));
    expect(rates[0].service_code).toBe('bulky');
  });

  test('disabled rules are skipped', () => {
    const rules = [{ ...baseRules[1], enabled: false }];
    const e = new RuleEngine(rules);
    const rates = e.evaluate(makePayload({ country: 'DE' }));
    expect(rates).toHaveLength(0);
  });

  test('rate total_price is string as Shopify requires', () => {
    const rates = engine.evaluate(makePayload({ country: 'FR' }));
    expect(typeof rates[0].total_price).toBe('string');
  });

  test('delivery dates are included and valid ISO format', () => {
    const rates = engine.evaluate(makePayload({ country: 'DE' }));
    expect(rates[0].min_delivery_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rates[0].max_delivery_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(rates[0].max_delivery_date) >= new Date(rates[0].min_delivery_date)).toBe(true);
  });

  test('weight condition: maxWeightGrams filters correctly', () => {
    const rules = [{
      id: 'light',
      name: 'Light',
      priority: 10,
      enabled: true,
      conditions: { destinationCountries: ['DE'], maxWeightGrams: 1000 },
      rates: [{ serviceName: 'Light', serviceCode: 'light', price: 399, description: '', minDeliveryDays: 1, maxDeliveryDays: 3 }],
    }];
    const e = new RuleEngine(rules);
    expect(e.evaluate(makePayload({ grams: 800 }))).toHaveLength(1);
    expect(e.evaluate(makePayload({ grams: 1500 }))).toHaveLength(0);
  });
});
