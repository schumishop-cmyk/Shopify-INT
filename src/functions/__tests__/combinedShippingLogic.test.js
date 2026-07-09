const { computeDiscounts } = require('../../../extensions/combined-shipping/src/logic.cjs');

function makeInput({ groups, config } = {}) {
  return {
    cart: { deliveryGroups: groups || [] },
    discountNode: {
      metafield: config === undefined ? null : { value: JSON.stringify(config) },
    },
  };
}

const homeGroup = {
  id: 'gid://group/home',
  deliveryOptions: [
    { handle: 'home-standard', cost: { amount: '4.95' } },
    { handle: 'home-express', cost: { amount: '9.95' } },
  ],
};

const podGroup = {
  id: 'gid://group/pod',
  deliveryOptions: [
    { handle: 'pod-standard', cost: { amount: '3.50' } },
  ],
};

describe('computeDiscounts — guards', () => {
  test('no discount without config metafield', () => {
    expect(computeDiscounts(makeInput({ groups: [homeGroup, podGroup] }))).toEqual({ discounts: [] });
  });

  test('no discount when disabled', () => {
    const input = makeInput({ groups: [homeGroup, podGroup], config: { enabled: false, mode: 'highest_only' } });
    expect(computeDiscounts(input)).toEqual({ discounts: [] });
  });

  test('no discount for single-origin orders', () => {
    const input = makeInput({ groups: [homeGroup], config: { enabled: true, mode: 'highest_only' } });
    expect(computeDiscounts(input)).toEqual({ discounts: [] });
  });

  test('handles malformed config JSON gracefully', () => {
    const input = { cart: { deliveryGroups: [homeGroup, podGroup] }, discountNode: { metafield: { value: '{oops' } } };
    expect(computeDiscounts(input)).toEqual({ discounts: [] });
  });
});

describe('computeDiscounts — highest_only', () => {
  test('discounts the cheaper group 100%, most expensive group pays', () => {
    const input = makeInput({ groups: [homeGroup, podGroup], config: { enabled: true, mode: 'highest_only' } });
    const { discounts } = computeDiscounts(input);

    expect(discounts).toHaveLength(1);
    expect(discounts[0].value).toEqual({ percentage: { value: 100.0 } });
    // home group's cheapest option (4.95) beats pod (3.50) → pod is free
    expect(discounts[0].targets).toEqual([{ deliveryOption: { handle: 'pod-standard' } }]);
  });

  test('with three origins, only the most expensive group pays', () => {
    const third = { id: 'g3', deliveryOptions: [{ handle: 'x', cost: { amount: '7.00' } }] };
    const input = makeInput({ groups: [homeGroup, podGroup, third], config: { enabled: true, mode: 'highest_only' } });
    const { discounts } = computeDiscounts(input);

    // third (7.00) has the highest minimum → home + pod get discounted
    const handles = discounts.flatMap((d) => d.targets.map((t) => t.deliveryOption.handle));
    expect(handles.sort()).toEqual(['home-express', 'home-standard', 'pod-standard']);
    expect(handles).not.toContain('x');
  });
});

describe('computeDiscounts — flat_addition', () => {
  test('additional group costs the flat amount instead of its rate', () => {
    const input = makeInput({
      groups: [homeGroup, podGroup],
      config: { enabled: true, mode: 'flat_addition', flatAmountCents: 100 },
    });
    const { discounts } = computeDiscounts(input);

    // pod-standard costs 3.50, flat is 1.00 → 2.50 off
    expect(discounts).toHaveLength(1);
    expect(discounts[0].targets).toEqual([{ deliveryOption: { handle: 'pod-standard' } }]);
    expect(discounts[0].value).toEqual({ fixedAmount: { amount: '2.50' } });
  });

  test('no discount when the option is already cheaper than the flat amount', () => {
    const cheapPod = { id: 'g', deliveryOptions: [{ handle: 'p', cost: { amount: '0.50' } }] };
    const input = makeInput({
      groups: [homeGroup, cheapPod],
      config: { enabled: true, mode: 'flat_addition', flatAmountCents: 100 },
    });
    expect(computeDiscounts(input)).toEqual({ discounts: [] });
  });
});
