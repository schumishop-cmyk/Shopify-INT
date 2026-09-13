/**
 * Compiles the app's shipping rules into Shopify's NATIVE delivery profile
 * (Settings → Shipping). Native conditional rates work on every Shopify
 * plan — unlike the CarrierService API, which is gated to Advanced+.
 *
 * Mapping:
 *   destinationCountries        → shipping zones (existing zones are reused,
 *                                 missing countries get app-created zones)
 *   min/maxWeightGrams          → weight conditions on the rate
 *   min/maxCartPrice            → price conditions on the rate
 *   rates[]                     → method definitions (name/price shown at checkout)
 *   no countries                → Rest-of-world zone
 *
 * Native limitations (reported as warnings, not errors):
 *   - a single rate can carry weight OR price conditions, not both
 *   - tag-based rules need per-product profiles (phase 2)
 */
const { adminGraphql } = require('./adminGraphql');
const db = require('../db/database');
const logger = require('../utils/logger');

const PROFILE_QUERY = `
  query {
    shop { currencyCode }
    deliveryProfiles(first: 10) {
      edges {
        node {
          id
          name
          default
          profileLocationGroups {
            locationGroup {
              id
              locations(first: 20) {
                edges { node { id } }
              }
            }
            locationGroupZones(first: 50) {
              edges {
                node {
                  zone {
                    id
                    name
                    countries { code { countryCode restOfWorld } }
                  }
                  methodDefinitions(first: 100) {
                    edges { node { id name } }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const PROFILE_MUTATION = `
  mutation deliveryProfileUpdate($id: ID!, $profile: DeliveryProfileInput!) {
    deliveryProfileUpdate(id: $id, profile: $profile) {
      profile {
        id
        profileLocationGroups {
          locationGroup { id }
          locationGroupZones(first: 50) {
            edges {
              node {
                zone { id name }
                methodDefinitions(first: 100) { edges { node { id name } } }
              }
            }
          }
        }
      }
      userErrors { field message }
    }
  }
`;

/** Normalizes the GraphQL profile response into a flat structure. */
function normalizeProfile(data) {
  const edge = (data.deliveryProfiles?.edges || []).find((e) => e.node.default)
    || data.deliveryProfiles?.edges?.[0];
  if (!edge) return null;

  const node = edge.node;
  const lg = node.profileLocationGroups?.[0];
  if (!lg) return null;

  const zones = (lg.locationGroupZones?.edges || []).map(({ node: z }) => ({
    id: z.zone.id,
    name: z.zone.name,
    countryCodes: (z.zone.countries || [])
      .filter((c) => c.code && !c.code.restOfWorld)
      .map((c) => c.code.countryCode),
    restOfWorld: (z.zone.countries || []).some((c) => c.code?.restOfWorld),
    methodDefinitionIds: (z.methodDefinitions?.edges || []).map((e) => e.node.id),
  }));

  return {
    profileId: node.id,
    locationGroupId: lg.locationGroup.id,
    locationIds: (lg.locationGroup.locations?.edges || []).map((e) => e.node.id),
    zones,
    currencyCode: data.shop?.currencyCode || 'EUR',
    multipleLocationGroups: (node.profileLocationGroups || []).length > 1,
  };
}

/** Builds method definition inputs for one rule (conditions + rates). */
function buildMethodDefinitions(rule, currencyCode, warnings) {
  const c = rule.conditions || {};
  const hasWeight = c.minWeightGrams !== undefined || c.maxWeightGrams !== undefined;
  const hasPrice = c.minCartPrice !== undefined || c.maxCartPrice !== undefined;

  let weightConditions;
  let priceConditions;

  if (hasWeight) {
    weightConditions = [];
    if (c.minWeightGrams !== undefined) {
      weightConditions.push({ criteria: { unit: 'GRAMS', value: c.minWeightGrams }, operator: 'GREATER_THAN_OR_EQUAL_TO' });
    }
    if (c.maxWeightGrams !== undefined) {
      weightConditions.push({ criteria: { unit: 'GRAMS', value: c.maxWeightGrams }, operator: 'LESS_THAN_OR_EQUAL_TO' });
    }
    if (hasPrice) {
      warnings.push({ code: 'weightAndPriceCombined', params: { rule: rule.name } });
    }
  } else if (hasPrice) {
    priceConditions = [];
    if (c.minCartPrice !== undefined) {
      priceConditions.push({ criteria: { amount: (c.minCartPrice / 100).toFixed(2), currencyCode }, operator: 'GREATER_THAN_OR_EQUAL_TO' });
    }
    if (c.maxCartPrice !== undefined) {
      priceConditions.push({ criteria: { amount: (c.maxCartPrice / 100).toFixed(2), currencyCode }, operator: 'LESS_THAN_OR_EQUAL_TO' });
    }
  }

  return rule.rates.map((rate) => ({
    name: rate.serviceName,
    description: rate.description || undefined,
    active: true,
    rateDefinition: { price: { amount: (rate.price / 100).toFixed(2), currencyCode } },
    ...(weightConditions ? { weightConditionsToCreate: weightConditions } : {}),
    ...(priceConditions ? { priceConditionsToCreate: priceConditions } : {}),
  }));
}

/**
 * Pure planning step: rules + current profile state → DeliveryProfileInput.
 *
 * @param {Array} rules - parsed rules (enabled + disabled; disabled are skipped)
 * @param {object} profile - normalizeProfile() output
 * @param {Array<string>} trackedMethodDefIds - method definition GIDs we created earlier
 * @param {Array<string>} trackedZoneIds - zone GIDs we created earlier
 * @returns {{ input: object, warnings: string[], skipped: string[] }}
 */
function buildSyncPlan(rules, profile, trackedMethodDefIds = [], trackedZoneIds = []) {
  const warnings = [];
  const skipped = [];
  const { currencyCode } = profile;

  if (profile.multipleLocationGroups) {
    warnings.push({ code: 'multipleLocationGroups', params: {} });
  }

  // Delete only what WE created earlier (and still exists in the profile)
  const existingDefIds = new Set(profile.zones.flatMap((z) => z.methodDefinitionIds));
  const methodDefinitionsToDelete = trackedMethodDefIds.filter((id) => existingDefIds.has(id));

  // zonesToUpdate: zoneId → methodDefinitionsToCreate[]
  const zoneUpdates = new Map();
  // plannedZones: new zones we will create, keyed by zone object
  const plannedZones = [];
  const plannedCountryIndex = new Map(); // countryCode → plannedZone

  const findZoneForCountry = (code) => profile.zones.find((z) => z.countryCodes.includes(code));
  const restOfWorldZone = profile.zones.find((z) => z.restOfWorld);

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const c = rule.conditions || {};
    if ((c.requireProductTags && c.requireProductTags.length) || (c.excludeProductTags && c.excludeProductTags.length)) {
      // Tag rules are handled separately via product-specific delivery
      // profiles (syncTagProfiles) — not part of the default profile plan
      skipped.push(rule.name);
      continue;
    }

    const defs = buildMethodDefinitions(rule, currencyCode, warnings);
    const countries = c.destinationCountries;

    if (!countries || countries.length === 0) {
      // Fallback rule → Rest of world
      if (restOfWorldZone) {
        appendToMap(zoneUpdates, restOfWorldZone.id, defs);
      } else {
        let rowZone = plannedZones.find((z) => z.restOfWorld);
        if (!rowZone) {
          // English on purpose: this name is written into the merchant's
          // Shopify shipping settings, where Shopify's own equivalent zone is
          // also called "Rest of world"
          rowZone = { name: 'App: Rest of world', restOfWorld: true, countries: [{ restOfWorld: true }], methodDefinitionsToCreate: [] };
          plannedZones.push(rowZone);
        }
        rowZone.methodDefinitionsToCreate.push(...defs);
      }
      continue;
    }

    // Existing zones that cover some of the rule's countries get the rates;
    // countries not covered anywhere are collected into a new app zone.
    const targetZoneIds = new Set();
    const uncovered = [];

    for (const code of countries) {
      const zone = findZoneForCountry(code);
      if (zone) {
        targetZoneIds.add(zone.id);
        const extra = zone.countryCodes.filter((cc) => !countries.includes(cc));
        if (extra.length > 0) {
          warnings.push({
            code: 'zoneHasExtraCountries',
            params: { rule: rule.name, zone: zone.name, countries: extra.join(', ') },
          });
        }
      } else if (plannedCountryIndex.has(code)) {
        plannedCountryIndex.get(code).methodDefinitionsToCreate.push(...defs.map(cloneDef));
        plannedCountryIndex.get(code)._defSignatures?.add?.(rule.id);
      } else {
        uncovered.push(code);
      }
    }

    for (const zoneId of targetZoneIds) {
      appendToMap(zoneUpdates, zoneId, defs.map(cloneDef));
    }

    if (uncovered.length > 0) {
      const zone = {
        name: `App: ${rule.name}`,
        // includeAllProvinces is required for countries with sub-regions
        // (Spain, Italy, …) — Shopify rejects the zone otherwise
        countries: uncovered.map((code) => ({ code, includeAllProvinces: true })),
        methodDefinitionsToCreate: defs.map(cloneDef),
      };
      plannedZones.push(zone);
      uncovered.forEach((code) => plannedCountryIndex.set(code, zone));
    }
  }

  // App zones from previous syncs that receive no rates this time are removed
  const zonesToDelete = trackedZoneIds.filter((id) => {
    const stillExists = profile.zones.some((z) => z.id === id);
    const receivesRates = zoneUpdates.has(id);
    return stillExists && !receivesRates;
  });

  const input = {
    ...(methodDefinitionsToDelete.length ? { methodDefinitionsToDelete } : {}),
    ...(zonesToDelete.length ? { zonesToDelete } : {}),
    locationGroupsToUpdate: [{
      id: profile.locationGroupId,
      ...(plannedZones.length ? {
        zonesToCreate: plannedZones.map(({ name, countries, methodDefinitionsToCreate }) => ({
          name, countries, methodDefinitionsToCreate,
        })),
      } : {}),
      ...(zoneUpdates.size ? {
        zonesToUpdate: [...zoneUpdates.entries()].map(([id, defs]) => ({
          id, methodDefinitionsToCreate: defs,
        })),
      } : {}),
    }],
  };

  return { input, warnings, skipped };
}

function appendToMap(map, key, defs) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(...defs);
}

function cloneDef(def) {
  return JSON.parse(JSON.stringify(def));
}

// ── App-owned profile (market-driven shipping) ───────────────────────────────
// Merchant delivery profiles are deprecated as of API 2026-07: on shops that
// moved to market-driven shipping, writes to them silently do nothing. Rules
// therefore live in a profile this app owns, which keeps working on both the
// old and the new model. coversAllItems makes it apply to every shippable item
// without enumerating variants (2026-07+).
const APP_PROFILE_NAME = 'Shipping Rules';

const SHOP_LOCATIONS_QUERY = `
  query AppProfileContext {
    shop { currencyCode }
    locations(first: 50, includeInactive: false) {
      nodes { id }
    }
  }
`;

const APP_PROFILE_STATE_QUERY = `
  query AppProfileState($id: ID!) {
    deliveryProfile(id: $id) {
      id
      profileLocationGroups {
        locationGroup { id }
        locationGroupZones(first: 50) {
          edges {
            node {
              zone { id }
              methodDefinitions(first: 100) { edges { node { id } } }
            }
          }
        }
      }
    }
  }
`;

const APP_PROFILE_CREATE = `
  mutation deliveryProfileCreate($profile: DeliveryProfileInput!) {
    deliveryProfileCreate(profile: $profile) {
      profile { id }
      userErrors { field message }
    }
  }
`;

const APP_PROFILE_REMOVE = `
  mutation deliveryProfileRemove($id: ID!) {
    deliveryProfileRemove(id: $id) {
      job { id }
      userErrors { field message }
    }
  }
`;

// ── DB statements ────────────────────────────────────────────────────────────
const listTracked = db.prepare(`SELECT kind, gid FROM synced_resources WHERE shop = ? AND kind IN ('zone', 'method_definition')`);
const readAppProfile = db.prepare(`SELECT app_profile_gid FROM shops WHERE shop = ?`);
const saveAppProfile = db.prepare(`UPDATE shops SET app_profile_gid = @gid WHERE shop = @shop`);
// Only clears default-profile resources — tag-rule profiles (kind='profile')
// are managed by tagProfileSync and must survive this
const clearTracked = db.prepare(`DELETE FROM synced_resources WHERE shop = ? AND kind IN ('zone', 'method_definition')`);
const insertTracked = db.prepare(`INSERT INTO synced_resources (shop, kind, gid) VALUES (?, ?, ?)`);
const touchSynced = db.prepare(`UPDATE shops SET last_synced_at = datetime('now') WHERE shop = ?`);

/** Reads the shop's currency and active locations, independent of any profile. */
async function fetchShopContext(shop, token) {
  const res = await adminGraphql(shop, token, SHOP_LOCATIONS_QUERY);
  if (res.errors) throw new Error(res.errors.map((e) => e.message).join('; '));
  return {
    currencyCode: res.data?.shop?.currencyCode || 'EUR',
    locationIds: (res.data?.locations?.nodes || []).map((n) => n.id),
  };
}

/** Reads our own profile's current zones/rates, or null if it's gone. */
async function fetchAppProfileState(shop, token, gid) {
  const res = await adminGraphql(shop, token, APP_PROFILE_STATE_QUERY, { id: gid });
  if (res.errors) throw new Error(res.errors.map((e) => e.message).join('; '));
  const profile = res.data?.deliveryProfile;
  if (!profile) return null; // deleted in the admin

  const lg = profile.profileLocationGroups?.[0];
  const zoneEdges = lg?.locationGroupZones?.edges || [];
  return {
    locationGroupId: lg?.locationGroup?.id,
    zoneIds: zoneEdges.map((e) => e.node.zone.id),
    methodDefinitionIds: zoneEdges.flatMap((e) =>
      (e.node.methodDefinitions?.edges || []).map((d) => d.node.id)
    ),
  };
}

function extractUserErrors(res, key) {
  return res.errors || res.data?.[key]?.userErrors || [];
}

/**
 * Executes a full sync for a shop into the app-owned delivery profile:
 * read context → plan zones → create or replace the profile's contents.
 */
async function syncShopProfile(shop, token, rules) {
  let context;
  try {
    context = await fetchShopContext(shop, token);
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (context.locationIds.length === 0) {
    return {
      ok: false,
      errorCode: 'noLocations',
      error: 'No active locations found — add a location in Shopify under Settings → Locations.',
    };
  }

  // We own every zone in this profile, so it is planned from scratch against an
  // empty profile and replaces whatever was there before.
  const { input, warnings, skipped } = buildSyncPlan(rules, {
    profileId: null,
    locationGroupId: null,
    locationIds: context.locationIds,
    zones: [],
    currencyCode: context.currencyCode,
    multipleLocationGroups: false,
  });
  const zonesToCreate = input.locationGroupsToUpdate?.[0]?.zonesToCreate || [];

  let gid = readAppProfile.get(shop)?.app_profile_gid || null;
  let state = null;
  if (gid) {
    try {
      state = await fetchAppProfileState(shop, token, gid);
    } catch (err) {
      return { ok: false, error: err.message, warnings };
    }
    if (!state) gid = null; // merchant deleted it — recreate below
  }

  let createdRates = 0;
  let deletedRates = 0;

  try {
    if (!gid) {
      const res = await adminGraphql(shop, token, APP_PROFILE_CREATE, {
        profile: {
          name: APP_PROFILE_NAME,
          coversAllItems: true,
          locationGroupsToCreate: [{ locations: context.locationIds, zonesToCreate }],
        },
      });
      const errors = extractUserErrors(res, 'deliveryProfileCreate');
      if (errors.length) throw new Error(errors.map((e) => e.message).join('; '));
      gid = res.data.deliveryProfileCreate.profile.id;
      logger.info('App delivery profile created', { shop, gid });
    } else {
      // Replace the whole contents: drop our previous zones/rates, add the new ones
      deletedRates = state.methodDefinitionIds.length;
      const res = await adminGraphql(shop, token, PROFILE_MUTATION, {
        id: gid,
        profile: {
          ...(state.methodDefinitionIds.length ? { methodDefinitionsToDelete: state.methodDefinitionIds } : {}),
          ...(state.zoneIds.length ? { zonesToDelete: state.zoneIds } : {}),
          coversAllItems: true,
          locationGroupsToUpdate: [{ id: state.locationGroupId, zonesToCreate }],
        },
      });
      const errors = extractUserErrors(res, 'deliveryProfileUpdate');
      if (errors.length) throw new Error(errors.map((e) => e.message).join('; '));
    }
  } catch (err) {
    return { ok: false, error: err.message, warnings };
  }

  createdRates = zonesToCreate.reduce((n, z) => n + (z.methodDefinitionsToCreate?.length || 0), 0);

  saveAppProfile.run({ shop, gid });
  touchSynced.run(shop);

  // One-time migration: rules used to be written into the merchant's default
  // profile. Those rates are now duplicates, so remove what we put there.
  const leftovers = listTracked.all(shop);
  if (leftovers.length > 0) {
    const cleanup = await removeSyncedProfile(shop, token);
    if (cleanup.ok) {
      logger.info('Migrated rules out of the merchant profile', { shop, removed: leftovers.length });
    } else {
      warnings.push({ code: 'legacyCleanupFailed', params: { error: cleanup.error } });
    }
  }

  // Tag rules (e.g. Sperrgut) live in their own product-specific profiles
  const { syncTagProfiles } = require('./tagProfileSync');
  const tagResult = await syncTagProfiles(shop, token, rules, {
    locationIds: context.locationIds,
    currencyCode: context.currencyCode,
  });

  logger.info('Profile sync complete', {
    shop,
    gid,
    createdRates,
    deletedRates,
    tagProfiles: tagResult,
    warnings: warnings.length + tagResult.warnings.length,
  });

  return {
    ok: true,
    createdRates,
    deletedRates,
    tagProfiles: {
      created: tagResult.created,
      updated: tagResult.updated,
      removed: tagResult.removed,
    },
    warnings: [...warnings, ...tagResult.warnings],
    skipped,
  };
}

/**
 * Deletes the app-owned delivery profile, taking its rates with it. Used when
 * billing lapses. A profile the merchant already removed counts as success.
 */
async function removeAppProfile(shop, token) {
  const gid = readAppProfile.get(shop)?.app_profile_gid;
  if (!gid) return { ok: true, removed: false };

  const res = await adminGraphql(shop, token, APP_PROFILE_REMOVE, { id: gid });
  const errors = extractUserErrors(res, 'deliveryProfileRemove');
  if (errors.length && !errors.some((e) => /does not exist|not found/i.test(e.message))) {
    return { ok: false, error: errors.map((e) => e.message).join('; ') };
  }

  saveAppProfile.run({ shop, gid: null });
  return { ok: true, removed: true };
}

/**
 * Removes every zone/rate this app once added to the shop's default delivery
 * profile, leaving the merchant's own zones and rates untouched. Still needed
 * to clean up shops synced before rules moved into the app-owned profile; the
 * tracked GIDs are only cleared after Shopify confirms deletion.
 */
async function removeSyncedProfile(shop, token) {
  const tracked = listTracked.all(shop);
  const methodDefinitionsToDelete = tracked.filter((t) => t.kind === 'method_definition').map((t) => t.gid);
  const zonesToDelete = tracked.filter((t) => t.kind === 'zone').map((t) => t.gid);

  if (!methodDefinitionsToDelete.length && !zonesToDelete.length) {
    return { ok: true, removedRates: 0, removedZones: 0 };
  }

  const queryRes = await adminGraphql(shop, token, PROFILE_QUERY);
  if (queryRes.errors) {
    return { ok: false, error: queryRes.errors.map((e) => e.message).join('; ') };
  }
  const profile = normalizeProfile(queryRes.data);
  if (!profile) {
    // No profile to remove anything from — nothing left to track either
    clearTracked.run(shop);
    return { ok: true, removedRates: 0, removedZones: 0 };
  }

  const input = {
    ...(methodDefinitionsToDelete.length ? { methodDefinitionsToDelete } : {}),
    ...(zonesToDelete.length ? { zonesToDelete } : {}),
    locationGroupsToUpdate: [{ id: profile.locationGroupId }],
  };

  const mutRes = await adminGraphql(shop, token, PROFILE_MUTATION, { id: profile.profileId, profile: input });
  if (mutRes.errors) {
    return { ok: false, error: mutRes.errors.map((e) => e.message).join('; ') };
  }
  const userErrors = mutRes.data?.deliveryProfileUpdate?.userErrors || [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join('; ') };
  }

  clearTracked.run(shop);
  return { ok: true, removedRates: methodDefinitionsToDelete.length, removedZones: zonesToDelete.length };
}

module.exports = {
  buildSyncPlan, buildMethodDefinitions, normalizeProfile, syncShopProfile,
  removeSyncedProfile, removeAppProfile,
};
