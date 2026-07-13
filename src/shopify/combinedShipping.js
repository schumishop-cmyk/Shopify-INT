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

const saveState = db.prepare(`
  UPDATE shops SET combined_discount_gid = @gid, combined_config = @config WHERE shop = @shop
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
      return { error: 'Ungültiger Pauschalbetrag' };
    }
    config.flatAmountCents = cents;
  }
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

/**
 * Activates (or reconfigures) combined shipping for a shop.
 * Returns { ok, active, config } or { ok: false, error, needsDeploy? }.
 */
async function applyCombinedShipping(shop, token, body) {
  const { config, error } = normalizeConfig(body);
  if (error) return { ok: false, error };

  const state = readState.get(shop);
  let discountGid = state?.combined_discount_gid;

  if (!discountGid) {
    if (!(await isFunctionDeployed(shop, token))) {
      return {
        ok: false,
        needsDeploy: true,
        error: 'Die Versand-Function ist noch nicht deployt. Bitte einmalig `shopify app deploy` im Projekt ausführen (siehe extensions/combined-shipping/README.md).',
      };
    }

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
      return { ok: false, error: errors.map((e) => e.message).join('; ') };
    }
    discountGid = res.data.discountAutomaticAppCreate.automaticAppDiscount.discountId;
    logger.info('Combined-shipping discount created', { shop, discountGid });
  }

  await writeConfigMetafield(shop, token, discountGid, config);
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

module.exports = { applyCombinedShipping, getCombinedShippingStatus, normalizeConfig };
