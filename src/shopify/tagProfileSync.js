/**
 * Syncs tag-based shipping rules (e.g. Sperrgut) into PRODUCT-SPECIFIC
 * delivery profiles.
 *
 * Shopify's native conditional rates can't reference product tags, but a
 * custom delivery profile applies its own rates to exactly the variants
 * associated with it. So for every enabled rule with requireProductTags:
 *
 *   1. find all products carrying ALL of the rule's tags (read_products)
 *   2. create/update a profile "App: <rule name>" containing their variants
 *   3. write the rule's zones + rates into that profile
 *
 * On re-sync, variants are re-diffed (associate/dissociate) and rates are
 * replaced. Profiles of disabled/deleted rules are removed — their products
 * fall back to the default profile automatically. Tracked in
 * synced_resources with kind='profile', meta=rule_id.
 */
const { adminGraphql } = require('./adminGraphql');
const db = require('../db/database');
const logger = require('../utils/logger');

const PRODUCTS_BY_TAG = `
  query($q: String!, $after: String) {
    products(first: 50, query: $q, after: $after) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          variants(first: 100) {
            edges { node { id } }
          }
        }
      }
    }
  }
`;

const PROFILE_STATE = `
  query($id: ID!) {
    deliveryProfile(id: $id) {
      id
      profileLocationGroups {
        locationGroup { id }
        locationGroupZones(first: 30) {
          edges {
            node {
              zone { id }
              methodDefinitions(first: 100) {
                edges { node { id } }
              }
            }
          }
        }
      }
      profileItems(first: 100) {
        edges {
          node {
            variants(first: 100) {
              edges { node { id } }
            }
          }
        }
      }
    }
  }
`;

const PROFILE_CREATE = `
  mutation deliveryProfileCreate($profile: DeliveryProfileInput!) {
    deliveryProfileCreate(profile: $profile) {
      profile { id }
      userErrors { field message }
    }
  }
`;

const PROFILE_UPDATE = `
  mutation deliveryProfileUpdate($id: ID!, $profile: DeliveryProfileInput!) {
    deliveryProfileUpdate(id: $id, profile: $profile) {
      profile { id }
      userErrors { field message }
    }
  }
`;

const PROFILE_REMOVE = `
  mutation deliveryProfileRemove($id: ID!) {
    deliveryProfileRemove(id: $id) {
      job { id }
      userErrors { field message }
    }
  }
`;

const listTrackedProfiles = db.prepare(
  `SELECT gid, meta FROM synced_resources WHERE shop = ? AND kind = 'profile'`
);
const trackProfile = db.prepare(
  `INSERT INTO synced_resources (shop, kind, gid, meta) VALUES (?, 'profile', ?, ?)`
);
const untrackProfile = db.prepare(
  `DELETE FROM synced_resources WHERE shop = ? AND kind = 'profile' AND gid = ?`
);

const MAX_PRODUCT_PAGES = 5; // 250 products per rule in v1

function isTagRule(rule) {
  return rule.enabled && rule.conditions?.requireProductTags?.length > 0;
}

// One matching tag is enough (OR) — multiple tags act as synonyms
function tagQuery(tags) {
  return tags
    .map((t) => `tag:'${String(t).replace(/'/g, "\\'")}'`)
    .join(' OR ');
}

async function findVariantIdsByTags(shop, token, tags, warnings, ruleName) {
  const variantIds = [];
  let after = null;

  for (let page = 0; page < MAX_PRODUCT_PAGES; page++) {
    const res = await adminGraphql(shop, token, PRODUCTS_BY_TAG, { q: tagQuery(tags), after });
    if (res.errors) throw new Error(res.errors.map((e) => e.message).join('; '));

    const conn = res.data?.products;
    for (const { node } of conn?.edges || []) {
      for (const { node: variant } of node.variants?.edges || []) {
        variantIds.push(variant.id);
      }
    }

    if (!conn?.pageInfo?.hasNextPage) return variantIds;
    after = conn.pageInfo.endCursor;
  }

  warnings.push(`Regel "${ruleName}": mehr als ${MAX_PRODUCT_PAGES * 50} Produkte mit diesem Tag — nur die ersten wurden zugeordnet.`);
  return variantIds;
}

/** Builds the zonesToCreate spec for a tag rule's profile. */
function buildTagZones(rule, defs) {
  const countries = rule.conditions?.destinationCountries;
  if (countries?.length) {
    return [{
      name: `App: ${rule.name}`,
      countries: countries.map((code) => ({ code, includeAllProvinces: true })),
      methodDefinitionsToCreate: defs,
    }];
  }
  return [{
    name: `App: ${rule.name} (weltweit)`,
    countries: [{ restOfWorld: true }],
    methodDefinitionsToCreate: defs,
  }];
}

function extractUserErrors(res, mutationKey) {
  return res.errors || res.data?.[mutationKey]?.userErrors || [];
}

async function createTagProfile(shop, token, rule, variantIds, zones, locationIds) {
  const res = await adminGraphql(shop, token, PROFILE_CREATE, {
    profile: {
      name: `App: ${rule.name}`,
      locationGroupsToCreate: [{ locations: locationIds, zonesToCreate: zones }],
      variantsToAssociate: variantIds,
    },
  });
  const errors = extractUserErrors(res, 'deliveryProfileCreate');
  if (errors.length) throw new Error(errors.map((e) => e.message).join('; '));
  return res.data.deliveryProfileCreate.profile.id;
}

async function updateTagProfile(shop, token, profileGid, variantIds, zones) {
  const stateRes = await adminGraphql(shop, token, PROFILE_STATE, { id: profileGid });
  if (stateRes.errors) throw new Error(stateRes.errors.map((e) => e.message).join('; '));

  const state = stateRes.data?.deliveryProfile;
  if (!state) return { missing: true }; // deleted manually in the admin

  const lg = state.profileLocationGroups?.[0];
  const zoneEdges = lg?.locationGroupZones?.edges || [];
  const currentZoneIds = zoneEdges.map((e) => e.node.zone.id);
  const currentDefIds = zoneEdges.flatMap((e) =>
    (e.node.methodDefinitions?.edges || []).map((d) => d.node.id)
  );

  const currentVariants = new Set(
    (state.profileItems?.edges || []).flatMap((e) =>
      (e.node.variants?.edges || []).map((v) => v.node.id)
    )
  );
  const target = new Set(variantIds);
  const variantsToAssociate = variantIds.filter((id) => !currentVariants.has(id));
  const variantsToDissociate = [...currentVariants].filter((id) => !target.has(id));

  // Everything inside an app-owned profile is ours: replace all rates, and
  // rebuild the zone (first zone updated in place, any strays deleted)
  const [keepZoneId, ...strayZoneIds] = currentZoneIds;
  const zoneSpec = zones[0];

  const profileInput = {
    ...(currentDefIds.length ? { methodDefinitionsToDelete: currentDefIds } : {}),
    ...(strayZoneIds.length ? { zonesToDelete: strayZoneIds } : {}),
    ...(variantsToAssociate.length ? { variantsToAssociate } : {}),
    ...(variantsToDissociate.length ? { variantsToDissociate } : {}),
    locationGroupsToUpdate: [{
      id: lg.locationGroup.id,
      ...(keepZoneId
        ? { zonesToUpdate: [{ id: keepZoneId, ...zoneSpec }] }
        : { zonesToCreate: zones }),
    }],
  };
  // zonesToUpdate takes the zone id instead of creating one
  if (keepZoneId) delete profileInput.locationGroupsToUpdate[0].zonesToUpdate[0].name;

  const res = await adminGraphql(shop, token, PROFILE_UPDATE, { id: profileGid, profile: profileInput });
  const errors = extractUserErrors(res, 'deliveryProfileUpdate');
  if (errors.length) throw new Error(errors.map((e) => e.message).join('; '));
  return { missing: false };
}

async function removeTagProfile(shop, token, profileGid) {
  const res = await adminGraphql(shop, token, PROFILE_REMOVE, { id: profileGid });
  const errors = extractUserErrors(res, 'deliveryProfileRemove');
  if (errors.length) throw new Error(errors.map((e) => e.message).join('; '));
}

/**
 * Syncs all tag rules of a shop. Never throws for a single rule — failures
 * become warnings so the main sync result stays usable.
 */
async function syncTagProfiles(shop, token, rules, { locationIds, currencyCode }) {
  const { buildMethodDefinitions } = require('./profileSync');
  const warnings = [];
  let created = 0;
  let updated = 0;
  let removed = 0;

  const tagRules = rules.filter(isTagRule);
  const tracked = new Map(listTrackedProfiles.all(shop).map((r) => [r.meta, r.gid]));

  for (const rule of tagRules) {
    try {
      const variantIds = await findVariantIdsByTags(
        shop, token, rule.conditions.requireProductTags, warnings, rule.name
      );

      const existingGid = tracked.get(rule.rule_id);
      tracked.delete(rule.rule_id); // whatever remains afterwards is stale

      if (variantIds.length === 0) {
        warnings.push(`Regel "${rule.name}": kein Produkt trägt eines der Tags ${rule.conditions.requireProductTags.join(', ')} — Profil wird nicht angelegt.`);
        if (existingGid) {
          await removeTagProfile(shop, token, existingGid);
          untrackProfile.run(shop, existingGid);
          removed++;
        }
        continue;
      }

      if (rule.conditions.excludeProductTags?.length) {
        warnings.push(`Regel "${rule.name}": Ausschluss-Tags werden bei Profil-Regeln nicht unterstützt und ignoriert.`);
      }

      const defs = buildMethodDefinitions(rule, currencyCode, warnings);
      const zones = buildTagZones(rule, defs);

      if (existingGid) {
        const { missing } = await updateTagProfile(shop, token, existingGid, variantIds, zones);
        if (missing) {
          untrackProfile.run(shop, existingGid);
          const gid = await createTagProfile(shop, token, rule, variantIds, zones, locationIds);
          trackProfile.run(shop, gid, rule.rule_id);
          created++;
        } else {
          updated++;
        }
      } else {
        const gid = await createTagProfile(shop, token, rule, variantIds, zones, locationIds);
        trackProfile.run(shop, gid, rule.rule_id);
        created++;
      }
    } catch (err) {
      logger.warn('Tag profile sync failed for rule', { shop, rule: rule.rule_id, error: err.message });
      warnings.push(`Regel "${rule.name}": Profil-Sync fehlgeschlagen — ${err.message}`);
    }
  }

  // Profiles whose rule was deleted, disabled, or lost its tags
  for (const [ruleId, gid] of tracked) {
    try {
      await removeTagProfile(shop, token, gid);
      untrackProfile.run(shop, gid);
      removed++;
      logger.info('Stale tag profile removed', { shop, ruleId, gid });
    } catch (err) {
      warnings.push(`Veraltetes Tag-Profil konnte nicht entfernt werden (${err.message}).`);
    }
  }

  return { created, updated, removed, warnings };
}

module.exports = { syncTagProfiles, tagQuery, buildTagZones };
