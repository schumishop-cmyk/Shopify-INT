// Shipping-discount run target. All logic lives in logic.cjs so it can be
// unit-tested with Jest outside the WASM toolchain.
import { computeDiscounts } from './logic.cjs';

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  return computeDiscounts(input);
}
