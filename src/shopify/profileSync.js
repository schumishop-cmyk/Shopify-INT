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
            locationGroup { id }
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
      warnings.push(`Regel "${rule.name}": Shopify-Raten können Gewichts- und Preisbedingungen nicht kombinieren — Preisbedingung wird ignoriert.`);
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
    warnings.push('Der Shop hat mehrere Standort-Gruppen — es wird nur die erste synchronisiert.');
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
      skipped.push(rule.name);
      warnings.push(`Regel "${rule.name}" nutzt Produkt-Tags — Tag-Regeln folgen in einer späteren Version und wurden übersprungen.`);
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
          rowZone = { name: 'App: Rest der Welt', restOfWorld: true, countries: [{ restOfWorld: true }], methodDefinitionsToCreate: [] };
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
          warnings.push(`Regel "${rule.name}": Zone "${zone.name}" enthält weitere Länder (${extra.join(', ')}) — die Rate gilt dort ebenfalls.`);
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

// ── DB statements ────────────────────────────────────────────────────────────
const listTracked = db.prepare(`SELECT kind, gid FROM synced_resources WHERE shop = ?`);
const clearTracked = db.prepare(`DELETE FROM synced_resources WHERE shop = ?`);
const insertTracked = db.prepare(`INSERT INTO synced_resources (shop, kind, gid) VALUES (?, ?, ?)`);
const touchSynced = db.prepare(`UPDATE shops SET last_synced_at = datetime('now') WHERE shop = ?`);

/**
 * Executes a full sync for a shop: query profile → plan → mutate → re-track.
 */
async function syncShopProfile(shop, token, rules) {
  const queryRes = await adminGraphql(shop, token, PROFILE_QUERY);
  if (queryRes.errors) {
    return { ok: false, error: queryRes.errors.map((e) => e.message).join('; ') };
  }

  const profile = normalizeProfile(queryRes.data);
  if (!profile) {
    return { ok: false, error: 'Kein Versandprofil gefunden — bitte in Shopify unter Einstellungen → Versand ein Profil anlegen.' };
  }

  const tracked = listTracked.all(shop);
  const trackedDefs = tracked.filter((t) => t.kind === 'method_definition').map((t) => t.gid);
  const trackedZones = tracked.filter((t) => t.kind === 'zone').map((t) => t.gid);

  const { input, warnings, skipped } = buildSyncPlan(rules, profile, trackedDefs, trackedZones);

  const mutRes = await adminGraphql(shop, token, PROFILE_MUTATION, { id: profile.profileId, profile: input });
  if (mutRes.errors) {
    return { ok: false, error: mutRes.errors.map((e) => e.message).join('; '), warnings };
  }

  const userErrors = mutRes.data?.deliveryProfileUpdate?.userErrors || [];
  if (userErrors.length > 0) {
    return { ok: false, error: userErrors.map((e) => e.message).join('; '), warnings };
  }

  // Diff response against pre-sync state to learn which IDs we now own
  const before = {
    zoneIds: new Set(profile.zones.map((z) => z.id)),
    defIds: new Set(profile.zones.flatMap((z) => z.methodDefinitionIds)),
  };
  const preservedTrackedZones = new Set(trackedZones);

  const after = { zones: [], defs: [] };
  for (const lg of mutRes.data.deliveryProfileUpdate.profile.profileLocationGroups || []) {
    for (const { node } of lg.locationGroupZones?.edges || []) {
      after.zones.push(node.zone.id);
      for (const { node: def } of node.methodDefinitions?.edges || []) {
        after.defs.push(def.id);
      }
    }
  }

  const newZoneIds = after.zones.filter((id) => !before.zoneIds.has(id) || preservedTrackedZones.has(id));
  const newDefIds = after.defs.filter((id) => !before.defIds.has(id));

  const retrack = db.transaction(() => {
    clearTracked.run(shop);
    newZoneIds.forEach((gid) => insertTracked.run(shop, 'zone', gid));
    newDefIds.forEach((gid) => insertTracked.run(shop, 'method_definition', gid));
    touchSynced.run(shop);
  });
  retrack();

  logger.info('Profile sync complete', {
    shop,
    createdDefs: newDefIds.length,
    deletedDefs: input.methodDefinitionsToDelete?.length || 0,
    warnings: warnings.length,
  });

  return {
    ok: true,
    createdRates: newDefIds.length,
    deletedRates: input.methodDefinitionsToDelete?.length || 0,
    warnings,
    skipped,
  };
}

module.exports = { buildSyncPlan, normalizeProfile, syncShopProfile };
