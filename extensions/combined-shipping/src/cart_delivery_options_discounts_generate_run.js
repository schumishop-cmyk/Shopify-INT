// Target entry point — the toml maps export "cart_delivery_options_discounts_
// generate_run" to this camelCase function. Logic lives in logic.cjs so it
// can be unit-tested with Jest outside the WASM toolchain.
import { computeOperations } from './logic.cjs';

/**
 * @param {DeliveryInput} input
 * @returns {CartDeliveryOptionsDiscountsGenerateRunResult}
 */
export function cartDeliveryOptionsDiscountsGenerateRun(input) {
  return computeOperations(input);
}
