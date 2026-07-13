/**
 * Combined-shipping logic for multi-origin checkouts
 * (unified Discount API, target cart.delivery-options.discounts.generate.run).
 *
 * Shopify splits a cart into delivery groups when items ship from different
 * origins (e.g. home warehouse + print-on-demand fulfillment) and SUMS the
 * shipping rates of all groups. This function turns that sum into a
 * configurable combined price by discounting the additional groups.
 *
 * Config (JSON metafield on the discount):
 *   {
 *     "enabled": true,
 *     "mode": "highest_only" | "flat_addition",
 *     "flatAmountCents": 300        // only for flat_addition
 *   }
 *
 * Modes:
 *   highest_only  — customer pays only the most expensive group's rate;
 *                   every other group is discounted 100%
 *   flat_addition — the most expensive group is paid in full; every other
 *                   group costs a flat amount (e.g. +3,00 € per origin)
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

function computeOperations(input) {
  const config = parseConfig(input);
  if (!config || config.enabled === false) return EMPTY;

  // The discount must carry the SHIPPING class to affect delivery options
  const classes = input?.discount?.discountClasses || [];
  if (!classes.includes('SHIPPING')) return EMPTY;

  const groups = input?.cart?.deliveryGroups || [];
  if (groups.length < 2) return EMPTY; // single-origin order — nothing to combine

  // The group whose cheapest option is the most expensive keeps its price;
  // all other groups get discounted.
  const ranked = [...groups].sort((a, b) => groupMinCost(b) - groupMinCost(a));
  const additionalGroups = ranked.slice(1);

  const candidates = [];

  for (const group of additionalGroups) {
    if (config.mode === 'flat_addition') {
      const flat = (config.flatAmountCents ?? 0) / 100;
      const off = groupMinCost(group) - flat;
      if (off <= 0) continue; // group is already cheaper than the flat fee
      candidates.push({
        message: MESSAGE,
        targets: [{ deliveryGroup: { id: group.id } }],
        value: { fixedAmount: { amount: off.toFixed(2) } },
      });
    } else {
      // highest_only (default): additional groups ship free
      candidates.push({
        message: MESSAGE,
        targets: [{ deliveryGroup: { id: group.id } }],
        value: { percentage: { value: 100 } },
      });
    }
  }

  if (candidates.length === 0) return EMPTY;

  return {
    operations: [
      {
        deliveryDiscountsAdd: {
          candidates,
          selectionStrategy: 'ALL',
        },
      },
    ],
  };
}

module.exports = { computeOperations };
