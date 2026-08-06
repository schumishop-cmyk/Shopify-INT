/**
 * Manages the "combined shipping" automatic discount that drives the
 * discount function (extensions/combined-shipping).
 *
 * The function itself is deployed via `shopify app deploy`; this module
 * activates it per shop by creating a DiscountAutomaticApp (linked via
 * functionHandle) and storing the merchant's configuration as a JSON
 * metafield the function reads at checkout.
 */
const { adminGraphql } = require('./adminGraphql');
const db = require('../db/database');
const logger = require('../utils/logger');

const METAFIELD_NAMESPACE = '$app:combined-shipping';
const METAFIELD_KEY = 'config';
const DISCOUNT_TITLE = 'Kombinierter Versand (App)';
const FUNCTION_HANDLE = 'combined-shipping';

const FUNCTIONS_QUERY = `
  query {
    shopifyFunctions(first: 50) {
      nodes { id apiType title }
    }
  }
`;

const CREATE_MUTATION = `
  mutation discountAutomaticAppCreate($discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $discount) {
      automaticAppDiscount { discountId }
      userErrors { field message }
    }
  }
`;

const METAFIELD_MUTATION = `
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

const DELETE_MUTATION = `
  mutation discountAutomaticDelete($id: ID!) {
    discountAutomaticDelete(id: $id) {
      deletedAutomaticDiscountId
      userErrors { field message }
    }
  }
`;

const saveState = db.prepare(`
  UPDATE shops SET combined_discount_gid = @gid, combined_config = @config WHERE shop = @shop
`);
const clearDiscountState = db.prepare(`
  UPDATE shops SET combined_discount_gid = NULL, combined_config = NULL WHERE shop = ?
`);
const readState = db.prepare(`
  SELECT combined_discount_gid, combined_config FROM shops WHERE shop = ?
`);

function normalizeConfig(body) {
  const mode = body.mode === 'flat_addition' ? 'flat_addition' : 'highest_only';
  const config = {
    enabled: body.enabled !== false,
    mode,
  };

  if (mode === 'flat_addition') {
    const cents = Math.round(parseFloat(body.flatAmount ?? 0) * 100);
    if (Number.isNaN(cents) || cents < 0) {
      return { errorCode: 'invalidFlatAmount', error: 'Invalid flat amount' };
    }
    config.flatAmountCents = cents;
  }

  // Mixed orders are detected via the fulfillment partner's product vendor,
  // and corrected by their (constant) shipping rate
  const vendor = String(body.detectVendor ?? '').trim();
  const rateCents = Math.round(parseFloat(body.fulfillmentRate ?? 0) * 100);

  if (config.enabled) {
    if (!vendor) {
      return { errorCode: 'vendorRequired', error: 'Enter the fulfillment partner\'s vendor name' };
    }
    if (Number.isNaN(rateCents) || rateCents <= 0) {
      return { errorCode: 'fulfillmentRateRequired', error: 'Enter the fulfillment partner\'s shipping rate' };
    }
    if (mode === 'flat_addition' && config.flatAmountCents >= rateCents) {
      return {
        errorCode: 'flatAmountTooHigh',
        error: 'The flat fee must be lower than the partner\'s shipping rate — otherwise there is nothing to discount',
      };
    }
  }

  if (vendor) config.detectVendors = [vendor];
  if (rateCents > 0) config.fulfillmentRateCents = rateCents;

  return { config };
}

/** Is a discount function from this app deployed? */
async function isFunctionDeployed(shop, token) {
  const res = await adminGraphql(shop, token, FUNCTIONS_QUERY);
  if (res.errors) throw new Error(res.errors.map((e) => e.message).join('; '));
  return (res.data?.shopifyFunctions?.nodes || []).some(
    (n) => typeof n.apiType === 'string' && n.apiType.includes('discount')
  );
}

async function writeConfigMetafield(shop, token, discountGid, config) {
  const res = await adminGraphql(shop, token, METAFIELD_MUTATION, {
    metafields: [{
      ownerId: discountGid,
      namespace: METAFIELD_NAMESPACE,
      key: METAFIELD_KEY,
      type: 'json',
      value: JSON.stringify(config),
    }],
  });
  const errors = res.errors || res.data?.metafieldsSet?.userErrors || [];
  if (errors.length) throw new Error(errors.map((e) => e.message).join('; '));
}

// English fallback text; the admin UI renders the localized version of the code
const NEEDS_DEPLOY_ERROR = 'The shipping function is not deployed yet. Run `shopify app deploy` once (see extensions/combined-shipping/README.md).';

/** Creates the automatic app discount and returns its GID (throws on userErrors). */
async function createDiscount(shop, token) {
  const res = await adminGraphql(shop, token, CREATE_MUTATION, {
    discount: {
      title: DISCOUNT_TITLE,
      functionHandle: FUNCTION_HANDLE,
      startsAt: new Date().toISOString(),
      discountClasses: ['SHIPPING'],
      combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: false },
    },
  });
  const errors = res.errors || res.data?.discountAutomaticAppCreate?.userErrors || [];
  if (errors.length) {
    const err = new Error(errors.map((e) => e.message).join('; '));
    err.userErrors = errors;
    throw err;
  }
  const gid = res.data.discountAutomaticAppCreate.automaticAppDiscount.discountId;
  logger.info('Combined-shipping discount created', { shop, discountGid: gid });
  return gid;
}

/**
 * Activates (or reconfigures) combined shipping for a shop.
 * Returns { ok, active, config } or { ok: false, error, needsDeploy? }.
 */
async function applyCombinedShipping(shop, token, body) {
  const { config, error, errorCode } = normalizeConfig(body);
  if (error) return { ok: false, error, errorCode };

  const state = readState.get(shop);
  let discountGid = state?.combined_discount_gid;
  let freshlyCreated = false;

  try {
    if (!discountGid) {
      if (!(await isFunctionDeployed(shop, token))) {
        return { ok: false, needsDeploy: true, errorCode: 'needsDeploy', error: NEEDS_DEPLOY_ERROR };
      }
      discountGid = await createDiscount(shop, token);
      freshlyCreated = true;
    }

    try {
      await writeConfigMetafield(shop, token, discountGid, config);
    } catch (err) {
      // A stored discount GID can go stale — e.g. Shopify deletes the app's
      // automatic discount on uninstall, but a reinstall reuses the shop row.
      // "Owner does not exist" means that discount is gone; recreate it once
      // and retry so saving self-heals instead of failing.
      if (!freshlyCreated && /owner does not exist/i.test(err.message)) {
        logger.warn('Stored combined-shipping discount is stale; recreating', { shop, staleGid: discountGid });
        if (!(await isFunctionDeployed(shop, token))) {
          return { ok: false, needsDeploy: true, errorCode: 'needsDeploy', error: NEEDS_DEPLOY_ERROR };
        }
        discountGid = await createDiscount(shop, token);
        await writeConfigMetafield(shop, token, discountGid, config);
      } else {
        throw err;
      }
    }
  } catch (err) {
    // Surface Shopify userErrors as a clean failure; re-throw anything else.
    if (err.userErrors) return { ok: false, error: err.message };
    throw err;
  }

  saveState.run({ shop, gid: discountGid, config: JSON.stringify(config) });
  logger.info('Combined-shipping config saved', { shop, config });
  return { ok: true, active: config.enabled, config };
}

/** Current state for the UI. */
async function getCombinedShippingStatus(shop, token) {
  const state = readState.get(shop);
  let deployed = true;
  if (!state?.combined_discount_gid) {
    try {
      deployed = await isFunctionDeployed(shop, token);
    } catch {
      deployed = false;
    }
  }
  return {
    deployed,
    active: Boolean(state?.combined_discount_gid),
    config: state?.combined_config ? JSON.parse(state.combined_config) : null,
  };
}

/**
 * Removes the combined-shipping automatic discount from the store. Used when
 * billing lapses; the shop's saved configuration in our DB is cleared too, so
 * resubscribing recreates the discount fresh on the next save.
 */
async function removeCombinedShippingDiscount(shop, token) {
  const state = readState.get(shop);
  const gid = state?.combined_discount_gid;
  if (!gid) return { ok: true, removed: false };

  const res = await adminGraphql(shop, token, DELETE_MUTATION, { id: gid });
  const errors = res.errors || res.data?.discountAutomaticDelete?.userErrors || [];
  // Already gone (e.g. merchant deleted it manually) — treat as success
  if (errors.length && !errors.some((e) => /does not exist/i.test(e.message))) {
    return { ok: false, error: errors.map((e) => e.message).join('; ') };
  }

  clearDiscountState.run(shop);
  return { ok: true, removed: true };
}

module.exports = {
  applyCombinedShipping, getCombinedShippingStatus, normalizeConfig, removeCombinedShippingDiscount,
};
