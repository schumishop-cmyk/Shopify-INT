const { computeOperations } = require('../../../extensions/combined-shipping/src/logic.cjs');

const EMPTY = { operations: [] };

const CONFIG = {
  enabled: true,
  mode: 'flat_addition',
  flatAmountCents: 150,
  fulfillmentRateCents: 350,
  detectVendors: ['Spreadconnect'],
};

function line(vendor) {
  return { quantity: 1, merchandise: { __typename: 'ProductVariant', product: { vendor } } };
}

// Consolidated single group with SUMMED combination options — exactly what
// Shopify sends for a multi-origin order going to one address
const consolidatedGroup = {
  id: 'gid://shopify/CartDeliveryGroup/0',
  deliveryOptions: [
    { handle: 'combo-standard', cost: { amount: '8.45' } },   // 4.95 + 3.50
    { handle: 'combo-express', cost: { amount: '13.45' } },   // 9.95 + 3.50
    { handle: 'combo-free-own', cost: { amount: '3.50' } },   // 0 (frei ab 50€) + 3.50
  ],
};

function makeInput({ lines, groups, config = CONFIG, discountClasses = ['SHIPPING'] } = {}) {
  return {
    cart: {
      lines: lines || [],
      deliveryGroups: groups || [consolidatedGroup],
    },
    discount: {
      discountClasses,
      metafield: config ? { value: JSON.stringify(config) } : null,
    },
  };
}

function candidatesOf(result) {
  return result.operations[0].deliveryDiscountsAdd.candidates;
}

describe('computeOperations — guards', () => {
  const mixedLines = [line('Lokalsportfan'), line('Spreadconnect')];

  test('no operations without config metafield', () => {
    expect(computeOperations(makeInput({ lines: mixedLines, config: null }))).toEqual(EMPTY);
  });

  test('no operations when disabled', () => {
    const input = makeInput({ lines: mixedLines, config: { ...CONFIG, enabled: false } });
    expect(computeOperations(input)).toEqual(EMPTY);
  });

  test('no operations without the SHIPPING discount class', () => {
    const input = makeInput({ lines: mixedLines, discountClasses: ['ORDER'] });
    expect(computeOperations(input)).toEqual(EMPTY);
  });

  test('handles malformed config JSON gracefully', () => {
    const input = makeInput({ lines: mixedLines });
    input.discount.metafield = { value: '{oops' };
    expect(computeOperations(input)).toEqual(EMPTY);
  });
});

describe('computeOperations — consolidated mixed-order detection via vendor', () => {
  test('no discount when the cart has only own products', () => {
    const input = makeInput({ lines: [line('Lokalsportfan'), line('Nike')] });
    expect(computeOperations(input)).toEqual(EMPTY);
  });

  test('no discount when the cart has only fulfillment products', () => {
    const input = makeInput({ lines: [line('Spreadconnect'), line('Spreadconnect')] });
    expect(computeOperations(input)).toEqual(EMPTY);
  });

  test('mixed cart: every summed option is corrected by rate − flat', () => {
    const input = makeInput({ lines: [line('Lokalsportfan'), line('Spreadconnect')] });
    const candidates = candidatesOf(computeOperations(input));

    // 3.50 − 1.50 = 2.00 off every option
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.value.fixedAmount.amount)).toEqual(['2.00', '2.00', '2.00']);
    expect(candidates.map((c) => c.targets[0].deliveryOption.handle)).toEqual([
      'combo-standard', 'combo-express', 'combo-free-own',
    ]);
  });

  test('highest_only: full partner rate is discounted', () => {
    const input = makeInput({
      lines: [line('Lokalsportfan'), line('Spreadconnect')],
      config: { ...CONFIG, mode: 'highest_only' },
    });
    const candidates = candidatesOf(computeOperations(input));
    expect(candidates.map((c) => c.value.fixedAmount.amount)).toEqual(['3.50', '3.50', '3.50']);
  });

  test('discount is clamped to the option cost', () => {
    const cheapGroup = {
      id: 'g',
      deliveryOptions: [{ handle: 'cheap', cost: { amount: '1.20' } }],
    };
    const input = makeInput({
      lines: [line('Own'), line('Spreadconnect')],
      groups: [cheapGroup],
      config: { ...CONFIG, mode: 'highest_only' }, // 3.50 off, but option costs 1.20
    });
    const candidates = candidatesOf(computeOperations(input));
    expect(candidates[0].value.fixedAmount.amount).toBe('1.20');
  });

  test('vendor matching is case-insensitive', () => {
    const input = makeInput({ lines: [line('Own'), line('  spreadconnect ')] });
    expect(computeOperations(input)).not.toEqual(EMPTY);
  });

  test('no discount when detectVendors or rate missing from config', () => {
    const input = makeInput({
      lines: [line('Own'), line('Spreadconnect')],
      config: { enabled: true, mode: 'highest_only' },
    });
    expect(computeOperations(input)).toEqual(EMPTY);
  });

  test('non-variant merchandise counts as own product', () => {
    const giftCard = { quantity: 1, merchandise: { __typename: 'GiftCard' } };
    const input = makeInput({ lines: [giftCard, line('Spreadconnect')] });
    expect(computeOperations(input)).not.toEqual(EMPTY);
  });
});

describe('computeOperations — multi-group path (ship + pickup etc.)', () => {
  const homeGroup = {
    id: 'gid://group/home',
    deliveryOptions: [
      { handle: 'home-standard', cost: { amount: '4.95' } },
      { handle: 'home-express', cost: { amount: '9.95' } },
    ],
  };
  const podGroup = {
    id: 'gid://group/pod',
    deliveryOptions: [{ handle: 'pod-standard', cost: { amount: '3.50' } }],
  };

  test('highest_only: cheaper group is discounted 100%', () => {
    const input = makeInput({
      lines: [line('Own'), line('Spreadconnect')],
      groups: [homeGroup, podGroup],
      config: { ...CONFIG, mode: 'highest_only' },
    });
    const candidates = candidatesOf(computeOperations(input));
    expect(candidates).toHaveLength(1);
    expect(candidates[0].targets).toEqual([{ deliveryGroup: { id: 'gid://group/pod' } }]);
    expect(candidates[0].value).toEqual({ percentage: { value: 100 } });
  });

  test('flat_addition: additional group costs the flat amount', () => {
    const input = makeInput({
      lines: [line('Own'), line('Spreadconnect')],
      groups: [homeGroup, podGroup],
    });
    const candidates = candidatesOf(computeOperations(input));
    // pod min 3.50 − flat 1.50 = 2.00 off
    expect(candidates[0].value).toEqual({ fixedAmount: { amount: '2.00' } });
  });

  test('uses selectionStrategy ALL', () => {
    const input = makeInput({
      lines: [line('Own'), line('Spreadconnect')],
      groups: [homeGroup, podGroup],
    });
    const result = computeOperations(input);
    expect(result.operations[0].deliveryDiscountsAdd.selectionStrategy).toBe('ALL');
  });
});
