const { Router } = require('express');
const { requireSessionToken } = require('../../middleware/requireSession');
const { syncShopProfile } = require('../../shopify/profileSync');
const { getRulesForShop } = require('../../db/rules');
const { getShop } = require('../../db/shops');
const logger = require('../../utils/logger');

const router = Router();
router.use(requireSessionToken);

/** GET /api/sync/status — when did the last successful sync run? */
router.get('/status', (req, res) => {
  const row = getShop.get(req.shop);
  res.json({ lastSyncedAt: row?.last_synced_at || null });
});

/** POST /api/sync — compile the shop's rules into its delivery profile */
router.post('/', async (req, res) => {
  try {
    const rules = getRulesForShop(req.shop);
    const result = await syncShopProfile(req.shop, req.shopToken, rules);

    if (!result.ok) {
      // "Access denied for X field" = the shop's token predates a scope
      // addition — a fresh OAuth grant fixes it
      if (/access denied/i.test(result.error || '')) {
        result.errorCode = 'reauthorizeNeeded';
        result.errorParams = { url: `/auth/begin?shop=${req.shop}` };
        result.error += ` — The app was granted new permissions. Please re-authorize once: /auth/begin?shop=${req.shop}`;
      }
      logger.warn('Profile sync failed', { shop: req.shop, error: result.error });
      return res.status(422).json(result);
    }
    return res.json(result);
  } catch (err) {
    logger.error('Profile sync crashed', { shop: req.shop, error: err.message });
    return res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
