const request = require('supertest');

// Stub the rule loader so the server doesn't read from disk
jest.mock('../../rules/loader', () => ({
  loadRules: () => [
    {
      id: 'standard-de',
      name: 'Standard DE',
      priority: 10,
      enabled: true,
      conditions: { destinationCountries: ['DE'] },
      rates: [{ serviceName: 'Standard', serviceCode: 'std', price: 495, description: '', minDeliveryDays: 2, maxDeliveryDays: 5 }],
    },
  ],
}));

const app = require('../../server');

const validPayload = {
  rate: {
    origin: { country: 'DE', postal_code: '10115', city: 'Berlin', address1: 'Unter den Linden 1' },
    destination: { country: 'DE', postal_code: '80331', city: 'München', name: 'Test', address1: 'Kaufingerstraße 1' },
    items: [{ name: 'Item', sku: 'X', quantity: 1, grams: 500, price: 3500, requires_shipping: true, product_tags: [] }],
    currency: 'EUR',
    locale: 'de',
  },
};

describe('POST /api/carrier-service', () => {
  test('returns rates for valid DE payload', async () => {
    const res = await request(app).post('/api/carrier-service').send(validPayload);
    expect(res.status).toBe(200);
    expect(res.body.rates).toHaveLength(1);
    expect(res.body.rates[0].service_code).toBe('std');
  });

  test('returns 400 for missing rate body', async () => {
    const res = await request(app).post('/api/carrier-service').send({});
    expect(res.status).toBe(400);
  });

  test('returns empty rates for unknown country', async () => {
    const payload = { rate: { ...validPayload.rate, destination: { ...validPayload.rate.destination, country: 'JP' } } };
    const res = await request(app).post('/api/carrier-service').send(payload);
    expect(res.status).toBe(200);
    expect(res.body.rates).toHaveLength(0);
  });

  test('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
