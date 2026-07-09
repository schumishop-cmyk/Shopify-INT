import { computeDiscounts } from './logic.cjs';

/**
 * Shopify Function entry point (purchase.shipping-discount.run).
 * All logic lives in logic.cjs so it can be unit-tested with Jest.
 */
export function run(input) {
  return computeDiscounts(input);
}
