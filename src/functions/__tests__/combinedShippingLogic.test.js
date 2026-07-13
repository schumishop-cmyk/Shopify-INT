const { computeOperations } = require('../../../extensions/combined-shipping/src/logic.cjs');

function makeInput({ groups, config, discountClasses = ['SHIPPING'] } = {}) {
  return {
    cart: { deliveryGroups: groups || [] },
    discount: {
      discountClasses,
      metafield: config === undefined ? null : { value: JSON.stringify(config) },
    },
  };
}

const EMPTY = { operations: [] };

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

function candidatesOf(result) {
  return result.operations[0].deliveryDiscountsAdd.candidates;
}

describe('computeOperations — guards', () => {
  test('no operations without config metafield', () => {
    expect(computeOperations(makeInput({ groups: [homeGroup, podGroup] }))).toEqual(EMPTY);
  });

  test('no operations when disabled', () => {
    const input = makeInput({ groups: [homeGroup, podGroup], config: { enabled: false, mode: 'highest_only' } });
    expect(computeOperations(input)).toEqual(EMPTY);
  });

  test('no operations without the SHIPPING discount class', () => {
    const input = makeInput({
      groups: [homeGroup, podGroup],
      config: { enabled: true, mode: 'highest_only' },
      discountClasses: ['ORDER'],
    });
    expect(computeOperations(input)).toEqual(EMPTY);
  });

  test('no operations for single-origin orders', () => {
    const input = makeInput({ groups: [homeGroup], config: { enabled: true, mode: 'highest_only' } });
    expect(computeOperations(input)).toEqual(EMPTY);
  });

  test('handles malformed config JSON gracefully', () => {
    const input = {
      cart: { deliveryGroups: [homeGroup, podGroup] },
      discount: { discountClasses: ['SHIPPING'], metafield: { value: '{oops' } },
    };
    expect(computeOperations(input)).toEqual(EMPTY);
  });
});

describe('computeOperations — highest_only', () => {
  test('discounts the cheaper group 100%, most expensive group pays', () => {
    const input = makeInput({ groups: [homeGroup, podGroup], config: { enabled: true, mode: 'highest_only' } });
    const candidates = candidatesOf(computeOperations(input));

    expect(candidates).toHaveLength(1);
    expect(candidates[0].value).toEqual({ percentage: { value: 100 } });
    // home group's cheapest option (4.95) beats pod (3.50) → pod ships free
    expect(candidates[0].targets).toEqual([{ deliveryGroup: { id: 'gid://group/pod' } }]);
  });

  test('with three origins, only the most expensive group pays', () => {
    const third = { id: 'gid://group/three', deliveryOptions: [{ handle: 'x', cost: { amount: '7.00' } }] };
    const input = makeInput({ groups: [homeGroup, podGroup, third], config: { enabled: true, mode: 'highest_only' } });
    const candidates = candidatesOf(computeOperations(input));

    // third (7.00) has the highest minimum → home + pod get discounted
    const ids = candidates.flatMap((c) => c.targets.map((t) => t.deliveryGroup.id)).sort();
    expect(ids).toEqual(['gid://group/home', 'gid://group/pod']);
  });

  test('uses selectionStrategy ALL', () => {
    const input = makeInput({ groups: [homeGroup, podGroup], config: { enabled: true, mode: 'highest_only' } });
    const result = computeOperations(input);
    expect(result.operations[0].deliveryDiscountsAdd.selectionStrategy).toBe('ALL');
  });
});

describe('computeOperations — flat_addition', () => {
  test('additional group costs the flat amount instead of its rate', () => {
    const input = makeInput({
      groups: [homeGroup, podGroup],
      config: { enabled: true, mode: 'flat_addition', flatAmountCents: 100 },
    });
    const candidates = candidatesOf(computeOperations(input));

    // pod's cheapest option costs 3.50, flat is 1.00 → 2.50 off the group
    expect(candidates).toHaveLength(1);
    expect(candidates[0].targets).toEqual([{ deliveryGroup: { id: 'gid://group/pod' } }]);
    expect(candidates[0].value).toEqual({ fixedAmount: { amount: '2.50' } });
  });

  test('no operations when the group is already cheaper than the flat amount', () => {
    const cheapPod = { id: 'g', deliveryOptions: [{ handle: 'p', cost: { amount: '0.50' } }] };
    const input = makeInput({
      groups: [homeGroup, cheapPod],
      config: { enabled: true, mode: 'flat_addition', flatAmountCents: 100 },
    });
    expect(computeOperations(input)).toEqual(EMPTY);
  });
});
