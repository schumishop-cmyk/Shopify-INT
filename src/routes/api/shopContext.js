const { Router } = require('express');
const { requireSessionToken } = require('../../middleware/requireSession');
const { getShopContext, SHOP_CONTEXT_FALLBACK } = require('../../shopify/shopContext');
const logger = require('../../utils/logger');

const router = Router();
router.use(requireSessionToken);

/**
 * GET /api/shop-context — the shop's currency and weight unit, so the admin UI
 * formats money and weights the way the merchant sees them in Shopify itself.
 *
 * Fails open with sensible defaults: a transient API error must not stop the
 * UI from rendering.
 */
router.get('/', async (req, res) => {
  try {
    const ctx = await getShopContext(req.shop, req.shopToken);
    res.json(ctx);
  } catch (err) {
    logger.warn('Shop context lookup failed', { shop: req.shop, error: err.message });
    res.json({ ...SHOP_CONTEXT_FALLBACK, unknown: true });
  }
});

module.exports = router;
