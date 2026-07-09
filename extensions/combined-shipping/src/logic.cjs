/**
 * Combined-shipping logic for multi-origin checkouts.
 *
 * Shopify splits a cart into delivery groups when items ship from different
 * origins (e.g. home warehouse + print-on-demand fulfillment) and SUMS the
 * shipping rates of all groups. This function turns that sum into a
 * configurable combined price by discounting the additional groups.
 *
 * Config (JSON metafield on the discount node):
 *   {
 *     "enabled": true,
 *     "mode": "highest_only" | "flat_addition",
 *     "flatAmountCents": 300        // only for flat_addition
 *   }
 *
 * Modes:
 *   highest_only  — customer pays only the most expensive group's rate;
 *                   every other group's options are discounted 100%
 *   flat_addition — the most expensive group is paid in full; every other
 *                   group costs a flat amount (e.g. +3,00 € per origin)
 */
const EMPTY = { discounts: [] };

function parseConfig(input) {
  const raw = input?.discountNode?.metafield?.value;
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function groupMinCost(group) {
  const costs = (group.deliveryOptions || [])
    .map((o) => parseFloat(o.cost?.amount))
    .filter((n) => !Number.isNaN(n));
  return costs.length ? Math.min(...costs) : 0;
}

function computeDiscounts(input) {
  const config = parseConfig(input);
  if (!config || config.enabled === false) return EMPTY;

  const groups = input?.cart?.deliveryGroups || [];
  if (groups.length < 2) return EMPTY; // single-origin order — nothing to combine

  // The group whose cheapest option is the most expensive keeps its price;
  // all other groups get discounted.
  const ranked = [...groups].sort((a, b) => groupMinCost(b) - groupMinCost(a));
  const additionalGroups = ranked.slice(1);

  const discounts = [];

  for (const group of additionalGroups) {
    if (config.mode === 'flat_addition') {
      const flat = (config.flatAmountCents ?? 0) / 100;
      for (const option of group.deliveryOptions || []) {
        const cost = parseFloat(option.cost?.amount) || 0;
        const off = Math.max(cost - flat, 0);
        if (off <= 0) continue;
        discounts.push({
          message: 'Kombinierter Versand',
          targets: [{ deliveryOption: { handle: option.handle } }],
          value: { fixedAmount: { amount: off.toFixed(2) } },
        });
      }
    } else {
      // highest_only (default): additional groups ship free
      const targets = (group.deliveryOptions || []).map((option) => ({
        deliveryOption: { handle: option.handle },
      }));
      if (targets.length === 0) continue;
      discounts.push({
        message: 'Kombinierter Versand',
        targets,
        value: { percentage: { value: 100.0 } },
      });
    }
  }

  return { discounts };
}

module.exports = { computeDiscounts };
