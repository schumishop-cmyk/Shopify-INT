/**
 * Combined-shipping logic for multi-origin checkouts
 * (unified Discount API, target cart.delivery-options.discounts.generate.run).
 *
 * Background: when an order ships from multiple origins to ONE address,
 * Shopify consolidates everything into a single delivery group whose
 * options are already SUMMED combinations of the per-origin rates. The
 * function input carries no fulfillment-origin information, so mixed
 * orders are detected via the PRODUCTS instead: fulfillment-partner
 * products are recognized by their vendor (e.g. "Spreadconnect").
 *
 * Because the partner's shipping rate is a constant the merchant knows,
 * the combined price can be corrected exactly on every summed option:
 *
 *   discount = partnerRate − flatFee   (flat_addition)
 *   discount = partnerRate             (highest_only — partner ships free)
 *
 * Config (JSON metafield on the discount):
 *   {
 *     "enabled": true,
 *     "mode": "highest_only" | "flat_addition",
 *     "flatAmountCents": 150,           // only for flat_addition
 *     "fulfillmentRateCents": 350,      // the partner's constant rate
 *     "detectVendors": ["Spreadconnect"]
 *   }
 *
 * If Shopify ever DOES split the cart into multiple delivery groups
 * (e.g. ship + pickup), the group-based path still applies: the most
 * expensive group is paid, additional groups are discounted.
 */
const EMPTY = { operations: [] };
const MESSAGE = 'Kombinierter Versand';

function parseConfig(input) {
  const raw = input?.discount?.metafield?.value;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function groupMinCost(group) {
  const costs = (group.deliveryOptions || [])
    .map((o) => parseFloat(o.cost?.amount))
    .filter((n) => !Number.isNaN(n));
  return costs.length ? Math.min(...costs) : 0;
}

/** Discounts for carts split into several delivery groups (ship+pickup etc.). */
function multiGroupCandidates(groups, config) {
  const ranked = [...groups].sort((a, b) => groupMinCost(b) - groupMinCost(a));
  const candidates = [];

  for (const group of ranked.slice(1)) {
    if (config.mode === 'flat_addition') {
      const flat = (config.flatAmountCents ?? 0) / 100;
      const off = groupMinCost(group) - flat;
      if (off <= 0) continue;
      candidates.push({
        message: MESSAGE,
        targets: [{ deliveryGroup: { id: group.id } }],
        value: { fixedAmount: { amount: off.toFixed(2) } },
      });
    } else {
      candidates.push({
        message: MESSAGE,
        targets: [{ deliveryGroup: { id: group.id } }],
        value: { percentage: { value: 100 } },
      });
    }
  }
  return candidates;
}

/**
 * Discounts for the consolidated single-group case: detect mixed orders
 * via product vendors and correct every summed option by a fixed amount.
 */
function consolidatedCandidates(input, group, config) {
  const vendors = (config.detectVendors || [])
    .map((v) => String(v).trim().toLowerCase())
    .filter(Boolean);
  const rate = (config.fulfillmentRateCents ?? 0) / 100;
  if (vendors.length === 0 || rate <= 0) return [];

  let hasFulfillment = false;
  let hasOwn = false;
  for (const line of input?.cart?.lines || []) {
    const vendor = line?.merchandise?.product?.vendor;
    if (typeof vendor === 'string' && vendors.includes(vendor.trim().toLowerCase())) {
      hasFulfillment = true;
    } else {
      hasOwn = true;
    }
  }
  if (!hasFulfillment || !hasOwn) return []; // not a mixed order

  const flat = config.mode === 'flat_addition' ? (config.flatAmountCents ?? 0) / 100 : 0;
  const off = rate - flat;
  if (off <= 0) return [];

  const candidates = [];
  for (const option of group.deliveryOptions || []) {
    const cost = parseFloat(option.cost?.amount);
    if (Number.isNaN(cost) || cost <= 0) continue;
    const amount = Math.min(off, cost);
    candidates.push({
      message: MESSAGE,
      targets: [{ deliveryOption: { handle: option.handle } }],
      value: { fixedAmount: { amount: amount.toFixed(2) } },
    });
  }
  return candidates;
}

function computeOperations(input) {
  const config = parseConfig(input);
  if (!config || config.enabled === false) return EMPTY;

  const classes = input?.discount?.discountClasses || [];
  if (!classes.includes('SHIPPING')) return EMPTY;

  const groups = input?.cart?.deliveryGroups || [];
  if (groups.length === 0) return EMPTY;

  const candidates = groups.length >= 2
    ? multiGroupCandidates(groups, config)
    : consolidatedCandidates(input, groups[0], config);

  if (candidates.length === 0) return EMPTY;

  return {
    operations: [
      { deliveryDiscountsAdd: { candidates, selectionStrategy: 'ALL' } },
    ],
  };
}

module.exports = { computeOperations };
